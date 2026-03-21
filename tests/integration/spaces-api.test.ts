import { describe, expect, it } from 'vitest';

import { createJixiaApp } from '../../src/server/app';

describe('spaces api', () => {
  it('starts with health and spaces routes', () => {
    const app = createJixiaApp();

    expect(app.health.getHealth()).toEqual({
      service: 'jixia-server',
      status: 'ok',
    });
    expect(typeof app.spaces.createSpace).toBe('function');
  });

  it('creates personal and shared spaces', async () => {
    const app = createJixiaApp();
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
  });

  it('rejects cross-space reads when visibility policy does not allow them', async () => {
    const app = createJixiaApp();
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
  });
});
