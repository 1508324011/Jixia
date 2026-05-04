import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
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
      expect(personal.id).toMatch(/^space-/);
      expect(shared.id).toMatch(/^space-/);

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

      const persistedState = JSON.parse(
        readFileSync(join(storageRoot, 'server-state.json'), 'utf8'),
      ) as {
        memberships: Array<{ spaceId: string; userId: string }>;
        spaces: Array<{ id: string }>;
      };
      expect(persistedState.spaces.map((space) => space.id)).toEqual(
        expect.arrayContaining([personal.id, shared.id]),
      );
      expect(
        persistedState.memberships.filter(
          (membership) =>
            membership.spaceId === shared.id && membership.userId === 'user-alice',
        ),
      ).toHaveLength(1);
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
      const serverState = JSON.parse(readFileSync(statePath, 'utf8')) as {
        memberships: Array<{
          joinedAt: string;
          role: 'owner' | 'editor' | 'viewer';
          spaceId: string;
          userId: string;
        }>;
      };
      serverState.memberships.push({
        joinedAt: new Date().toISOString(),
        role: 'viewer',
        spaceId: sharedSpace.id,
        userId: 'user-charlie',
      });
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
