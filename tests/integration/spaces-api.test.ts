import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { describe, expect, it } from 'vitest';

import { createPrismaClient, createSpaceRepository } from '../../src/db';
import { createJixiaApp } from '../../src/server/app';

function createStorageRoot(): string {
  return mkdtempSync(join(tmpdir(), 'jixia-spaces-api-'));
}

function createSpacesTestEnv(storageRoot: string) {
  return {
    JIXIA_DATABASE_URL: `file:${join(storageRoot, 'jixia-spaces.db')}`,
    JIXIA_STORAGE_ROOT: storageRoot,
  };
}

describe('spaces api', () => {
  it('starts with health and spaces routes', () => {
    const storageRoot = createStorageRoot();

    try {
      const app = createJixiaApp({ env: createSpacesTestEnv(storageRoot) });

      expect(app.health.getHealth()).toEqual({
        service: 'jixia-server',
        status: 'ok',
      });
      expect(typeof app.spaces.createSpace).toBe('function');
    } finally {
      rmSync(storageRoot, { force: true, recursive: true });
    }
  });

  it('creates personal and shared spaces', async () => {
    const storageRoot = createStorageRoot();

    try {
      const app = createJixiaApp({ env: createSpacesTestEnv(storageRoot) });
      const personal = await app.spaces.createSpace(
        { kind: 'personal', name: 'Alice Personal' },
        'user-alice',
      );
      const shared = await app.spaces.createSpace(
        { kind: 'shared', name: 'Lab Shared' },
        'user-alice',
      );

      expect(personal.kind).toBe('personal');
      expect(shared.kind).toBe('shared');
      expect(personal.id).toEqual(expect.any(String));
      expect(shared.id).toEqual(expect.any(String));
      expect(personal.id).not.toHaveLength(0);
      expect(shared.id).not.toHaveLength(0);

      const memberships = await app.spaces.listMemberships(
        { spaceId: shared.id },
        'user-alice',
      );
      expect(memberships).toHaveLength(1);
      expect(memberships[0]).toMatchObject({
        role: 'owner',
        spaceId: shared.id,
        userId: 'user-alice',
      });

      const statePath = join(storageRoot, 'server-state.json');
      if (existsSync(statePath)) {
        const persistedState = JSON.parse(readFileSync(statePath, 'utf8')) as {
          memberships?: unknown;
          spaces?: unknown;
        };

        expect(persistedState.spaces).toBeUndefined();
        expect(persistedState.memberships).toBeUndefined();
      }
    } finally {
      rmSync(storageRoot, { force: true, recursive: true });
    }
  });

  it('lists only persisted memberships for the actor and denies non-members', async () => {
    const storageRoot = createStorageRoot();

    try {
      const app = createJixiaApp({ env: createSpacesTestEnv(storageRoot) });
      const aliceSpace = await app.spaces.createSpace(
        { kind: 'shared', name: 'Alice Shared' },
        'user-alice',
      );
      await app.spaces.createSpace(
        { kind: 'shared', name: 'Bob Shared' },
        'user-bob',
      );

      expect(await app.spaces.listSpaces({ actorUserId: 'user-alice' })).toEqual([
        expect.objectContaining({ id: aliceSpace.id, name: 'Alice Shared' }),
      ]);
      expect(await app.spaces.listSpaces({ actorUserId: 'user-bob' })).toEqual([
        expect.objectContaining({ name: 'Bob Shared' }),
      ]);
      await expect(
        app.spaces.listMemberships({ spaceId: aliceSpace.id }, 'user-bob'),
      ).rejects.toThrow(/access denied/i);
    } finally {
      rmSync(storageRoot, { force: true, recursive: true });
    }
  });

  it('persists spaces and memberships across app restarts and ignores stale legacy state for authority', async () => {
    const storageRoot = createStorageRoot();

    try {
      const env = createSpacesTestEnv(storageRoot);
      const firstApp = createJixiaApp({ env });
      const sharedSpace = await firstApp.spaces.createSpace(
        { kind: 'shared', name: 'Restarted Shared' },
        'user-alice',
      );
      const statePath = join(storageRoot, 'server-state.json');
      const serverState = {
        memberships: [
          {
            joinedAt: new Date().toISOString(),
            role: 'viewer',
            spaceId: sharedSpace.id,
            userId: 'user-charlie',
          },
        ],
      };
      writeFileSync(statePath, JSON.stringify(serverState, null, 2));

      const secondApp = createJixiaApp({ env });

      expect(await secondApp.spaces.listSpaces({ actorUserId: 'user-alice' })).toEqual([
        expect.objectContaining({ id: sharedSpace.id, name: 'Restarted Shared' }),
      ]);
      expect(await secondApp.spaces.listSpaces({ actorUserId: 'user-charlie' })).toEqual([]);
      await expect(
        secondApp.spaces.listMemberships({ spaceId: sharedSpace.id }, 'user-charlie'),
      ).rejects.toThrow(/access denied/i);
    } finally {
      rmSync(storageRoot, { force: true, recursive: true });
    }
  });

  it('upserts duplicate memberships without creating duplicates', async () => {
    const storageRoot = createStorageRoot();
    const env = createSpacesTestEnv(storageRoot);
    const prisma = createPrismaClient({ url: env.JIXIA_DATABASE_URL });
    const repository = createSpaceRepository(prisma);

    try {
      const space = await repository.createSpace(
        { id: 'space-repo', kind: 'shared', name: 'Repository Shared' },
        'user-alice',
      );
      const firstMembership = await repository.addMembership(space.id, {
        role: 'viewer',
        userId: 'user-bob',
      });
      const duplicateMembership = await repository.addMembership(space.id, {
        role: 'editor',
        userId: 'user-bob',
      });
      const memberships = await repository.listMemberships({ spaceId: space.id });

      expect(duplicateMembership).toEqual(firstMembership);
      expect(
        memberships.filter((membership) => membership.userId === 'user-bob'),
      ).toHaveLength(1);
      expect(
        memberships.find((membership) => membership.userId === 'user-bob'),
      ).toMatchObject({ role: 'viewer' });
    } finally {
      await prisma.$disconnect();
      rmSync(storageRoot, { force: true, recursive: true });
    }
  });

  it('rejects cross-space reads when visibility policy does not allow them', async () => {
    const storageRoot = createStorageRoot();

    try {
      const app = createJixiaApp({ env: createSpacesTestEnv(storageRoot) });
      const aliceShared = await app.spaces.createSpace(
        { kind: 'shared', name: 'Alice Shared' },
        'user-alice',
      );
      const bobPersonal = await app.spaces.createSpace(
        { kind: 'personal', name: 'Bob Personal' },
        'user-bob',
      );

      await expect(
        app.spaces.assertCanReadResource({
          actorSpaceId: bobPersonal.id,
          actorUserId: 'user-bob',
          resourceSpaceId: aliceShared.id,
          visibility: 'space_shared',
        }),
      ).rejects.toThrow(/access denied/i);
    } finally {
      rmSync(storageRoot, { force: true, recursive: true });
    }
  });
});
