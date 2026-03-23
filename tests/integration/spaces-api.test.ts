import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { describe, expect, it } from 'vitest';

import { createJixiaApp } from '../../src/server/app';

function createStorageRoot(): string {
  return mkdtempSync(join(tmpdir(), 'jixia-spaces-api-'));
}

describe('spaces api', () => {
  it('starts with health and spaces routes', () => {
    const storageRoot = createStorageRoot();

    try {
      const app = createJixiaApp({ env: { JIXIA_STORAGE_ROOT: storageRoot } });

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
      const app = createJixiaApp({ env: { JIXIA_STORAGE_ROOT: storageRoot } });
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

      const memberships = await app.spaces.listMemberships({ spaceId: shared.id });
      expect(memberships).toHaveLength(1);
      expect(memberships[0]).toMatchObject({
        role: 'owner',
        spaceId: shared.id,
        userId: 'user-alice',
      });
    } finally {
      rmSync(storageRoot, { force: true, recursive: true });
    }
  });

  it('rejects cross-space reads when visibility policy does not allow them', async () => {
    const storageRoot = createStorageRoot();

    try {
      const app = createJixiaApp({ env: { JIXIA_STORAGE_ROOT: storageRoot } });
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
