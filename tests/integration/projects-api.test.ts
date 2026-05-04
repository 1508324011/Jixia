import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { describe, expect, it } from 'vitest';

import { createJixiaApp } from '../../src/server/app';

function createStorageRoot(): string {
  return mkdtempSync(join(tmpdir(), 'jixia-projects-api-'));
}

describe('projects api', () => {
  it('creates projects and lists only actor project memberships', async () => {
    const storageRoot = createStorageRoot();

    try {
      const app = createJixiaApp({ env: { JIXIA_STORAGE_ROOT: storageRoot } });
      const sharedSpace = await app.spaces.createSpace(
        { kind: 'shared', name: 'Project Governance' },
        'user-alice',
      );
      const project = await app.projects.createProject(
        { name: 'Project-first Recovery', spaceId: sharedSpace.id },
        'user-alice',
      );

      expect(project.project.spaceId).toBe(sharedSpace.id);
      expect(project.project.createdByUserId).toBe('user-alice');
      expect(project.membership).toMatchObject({
        projectId: project.project.id,
        role: 'owner',
        userId: 'user-alice',
      });

      const aliceProjects = await app.projects.listProjects('user-alice');
      const bobProjects = await app.projects.listProjects('user-bob');

      expect(aliceProjects.map((item) => item.project.id)).toContain(
        project.project.id,
      );
      expect(bobProjects).toHaveLength(0);
      await expect(
        app.projects.getProject(
          { projectId: project.project.id },
          'user-bob',
        ),
      ).rejects.toThrow(/access denied/i);
    } finally {
      rmSync(storageRoot, { force: true, recursive: true });
    }
  });

  it('uses ProjectMember as the project access boundary', async () => {
    const storageRoot = createStorageRoot();

    try {
      const app = createJixiaApp({ env: { JIXIA_STORAGE_ROOT: storageRoot } });
      const sharedSpace = await app.spaces.createSpace(
        { kind: 'shared', name: 'Member Boundary' },
        'user-alice',
      );
      const project = await app.projects.createProject(
        { name: 'Membership-scoped Project', spaceId: sharedSpace.id },
        'user-alice',
      );

      await app.projects.addProjectMember(
        project.project.id,
        { role: 'viewer', userId: 'user-bob' },
        'user-alice',
      );

      const bobProject = await app.projects.getProject(
        { projectId: project.project.id },
        'user-bob',
      );
      const bobMembers = await app.projects.listProjectMembers(
        { projectId: project.project.id },
        'user-bob',
      );
      const spaceMemberships = await app.spaces.listMemberships({
        spaceId: sharedSpace.id,
      });

      expect(bobProject.membership.role).toBe('viewer');
      expect(bobMembers.map((member) => member.userId)).toEqual([
        'user-alice',
        'user-bob',
      ]);
      expect(spaceMemberships.map((member) => member.userId)).toEqual([
        'user-alice',
      ]);
      await expect(
        app.projects.listProjectMembers(
          { projectId: project.project.id },
          'user-charlie',
        ),
      ).rejects.toThrow(/access denied/i);
    } finally {
      rmSync(storageRoot, { force: true, recursive: true });
    }
  });
});
