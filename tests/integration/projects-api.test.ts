import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { describe, expect, it } from 'vitest';

import { createJixiaApp } from '../../src/server/app';

function createStorageRoot(): string {
  return mkdtempSync(join(tmpdir(), 'jixia-projects-api-'));
}

function createProjectTestEnv(storageRoot: string) {
  return {
    JIXIA_DATABASE_URL: `file:${join(storageRoot, 'jixia-projects.db')}`,
    JIXIA_STORAGE_ROOT: storageRoot,
  };
}

describe('projects api', () => {
  it('creates projects and lists only actor project memberships', async () => {
    const storageRoot = createStorageRoot();

    try {
      const app = createJixiaApp({ env: createProjectTestEnv(storageRoot) });
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
      const app = createJixiaApp({ env: createProjectTestEnv(storageRoot) });
      const sharedSpace = await app.spaces.createSpace(
        { kind: 'shared', name: 'Member Boundary' },
        'user-alice',
      );
      const project = await app.projects.createProject(
        { name: 'Membership-scoped Project', spaceId: sharedSpace.id },
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
      const restartedAppWithCharlieSpaceMembership = createJixiaApp({
        env: createProjectTestEnv(storageRoot),
      });

      expect(
        await restartedAppWithCharlieSpaceMembership.projects.listProjects(
          'user-charlie',
        ),
      ).toEqual([]);
      await expect(
        restartedAppWithCharlieSpaceMembership.projects.getProject(
          { projectId: project.project.id },
          'user-charlie',
        ),
      ).rejects.toThrow(/access denied/i);
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

  it('returns existing memberships on duplicate member add and denies non-owner management', async () => {
    const storageRoot = createStorageRoot();

    try {
      const app = createJixiaApp({ env: createProjectTestEnv(storageRoot) });
      const sharedSpace = await app.spaces.createSpace(
        { kind: 'shared', name: 'Duplicate Members' },
        'user-alice',
      );
      const project = await app.projects.createProject(
        { name: 'Duplicate-safe Project', spaceId: sharedSpace.id },
        'user-alice',
      );

      const firstBobMembership = await app.projects.addProjectMember(
        project.project.id,
        { role: 'viewer', userId: 'user-bob' },
        'user-alice',
      );
      const duplicateBobMembership = await app.projects.addProjectMember(
        project.project.id,
        { role: 'editor', userId: 'user-bob' },
        'user-alice',
      );
      const members = await app.projects.listProjectMembers(
        { projectId: project.project.id },
        'user-alice',
      );

      expect(duplicateBobMembership).toEqual(firstBobMembership);
      expect(
        members.filter((membership) => membership.userId === 'user-bob'),
      ).toHaveLength(1);
      expect(members.find((membership) => membership.userId === 'user-bob')).toMatchObject({
        role: 'viewer',
      });
      await expect(
        app.projects.addProjectMember(
          project.project.id,
          { role: 'viewer', userId: 'user-charlie' },
          'user-bob',
        ),
      ).rejects.toThrow(/membership management/i);
    } finally {
      rmSync(storageRoot, { force: true, recursive: true });
    }
  });

  it('survives app restarts using the same sqlite database', async () => {
    const storageRoot = createStorageRoot();

    try {
      const env = createProjectTestEnv(storageRoot);
      const firstApp = createJixiaApp({ env });
      const sharedSpace = await firstApp.spaces.createSpace(
        { kind: 'shared', name: 'Restart Persistence' },
        'user-alice',
      );
      const project = await firstApp.projects.createProject(
        { name: 'Restart-backed Project', spaceId: sharedSpace.id },
        'user-alice',
      );
      await firstApp.projects.addProjectMember(
        project.project.id,
        { role: 'viewer', userId: 'user-bob' },
        'user-alice',
      );

      const secondApp = createJixiaApp({ env });
      const aliceProjects = await secondApp.projects.listProjects('user-alice');
      const bobProject = await secondApp.projects.getProject(
        { projectId: project.project.id },
        'user-bob',
      );
      const secondProject = await secondApp.projects.createProject(
        { name: 'Post-restart Project', spaceId: sharedSpace.id },
        'user-alice',
      );
      const postRestartAliceProjects = await secondApp.projects.listProjects(
        'user-alice',
      );

      expect(aliceProjects.map((item) => item.project.id)).toContain(
        project.project.id,
      );
      expect(bobProject).toMatchObject({
        membership: {
          projectId: project.project.id,
          role: 'viewer',
          userId: 'user-bob',
        },
        project: {
          id: project.project.id,
          name: 'Restart-backed Project',
        },
      });
      expect(secondProject.project.id).not.toBe(project.project.id);
      expect(
        postRestartAliceProjects.map((item) => item.project.id),
      ).toEqual(expect.arrayContaining([
        project.project.id,
        secondProject.project.id,
      ]));
    } finally {
      rmSync(storageRoot, { force: true, recursive: true });
    }
  });
});
