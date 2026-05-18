import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { describe, expect, it } from 'vitest';

import {
  createPrismaClient,
  createProjectDocRepository,
  createSpaceRepository,
} from '../../src/db';
import {
  loginAs,
  startTestServer,
  withSessionCookie,
} from './http-session-test-helpers';

describe('http server project api', () => {
  it('creates and lists projects from the server-derived session cookie', async () => {
    const storageRoot = mkdtempSync(join(tmpdir(), 'jixia-http-projects-'));

    try {
      const server = await startTestServer({
        JIXIA_DATABASE_URL: `file:${join(storageRoot, 'jixia-http-projects.db')}`,
        JIXIA_STORAGE_ROOT: storageRoot,
      });

      try {
        const aliceCookie = await loginAs(server.url, 'user-alice');
        const bobCookie = await loginAs(server.url, 'user-bob');

        const createdSpace = await fetch(`${server.url}/api/spaces`, {
          body: JSON.stringify({ kind: 'shared', name: 'HTTP Projects' }),
          headers: withSessionCookie(aliceCookie, {
            'Content-Type': 'application/json',
          }),
          method: 'POST',
        }).then((response) => response.json() as Promise<{ id: string }>);

        const createdProject = await fetch(`${server.url}/api/projects`, {
          body: JSON.stringify({
            name: 'HTTP Project-first Recovery',
            spaceId: createdSpace.id,
          }),
          headers: withSessionCookie(aliceCookie, {
            'Content-Type': 'application/json',
          }),
          method: 'POST',
        }).then(
          (response) =>
            response.json() as Promise<{
              membership: { role: string; userId: string };
              project: { id: string; name: string; spaceId: string };
            }>,
        );

        expect(createdProject.project.spaceId).toBe(createdSpace.id);
        expect(createdProject.membership).toMatchObject({
          role: 'owner',
          userId: 'user-alice',
        });

        const aliceProjects = await fetch(`${server.url}/api/projects`, {
          headers: withSessionCookie(aliceCookie),
        }).then(
          (response) =>
            response.json() as Promise<Array<{ project: { id: string } }>>,
        );
        expect(aliceProjects.map((item) => item.project.id)).toContain(
          createdProject.project.id,
        );

        const bobProjects = await fetch(`${server.url}/api/projects`, {
          headers: withSessionCookie(bobCookie),
        }).then(
          (response) =>
            response.json() as Promise<Array<{ project: { id: string } }>>,
        );
        expect(bobProjects).toEqual([]);

        const bobProjectResponse = await fetch(
          `${server.url}/api/projects/${createdProject.project.id}`,
          { headers: withSessionCookie(bobCookie) },
        );
        const bobProjectPayload = (await bobProjectResponse.json()) as { error: string };
        expect(bobProjectResponse.status).toBe(403);
        expect(bobProjectPayload.error).toMatch(/access denied/i);
      } finally {
        await server.close();
      }
    } finally {
      rmSync(storageRoot, { force: true, recursive: true });
    }
  });

  it('rejects body actor impersonation on project creation', async () => {
    const storageRoot = mkdtempSync(join(tmpdir(), 'jixia-http-projects-'));

    try {
      const server = await startTestServer({
        JIXIA_DATABASE_URL: `file:${join(storageRoot, 'jixia-http-projects.db')}`,
        JIXIA_STORAGE_ROOT: storageRoot,
      });

      try {
        const aliceCookie = await loginAs(server.url, 'user-alice');
        const bobCookie = await loginAs(server.url, 'user-bob');

        const createdSpace = await fetch(`${server.url}/api/spaces`, {
          body: JSON.stringify({ kind: 'shared', name: 'HTTP Impersonation' }),
          headers: withSessionCookie(aliceCookie, {
            'Content-Type': 'application/json',
          }),
          method: 'POST',
        }).then((response) => response.json() as Promise<{ id: string }>);

        const response = await fetch(`${server.url}/api/projects`, {
          body: JSON.stringify({
            actorUserId: 'user-alice',
            name: 'Spoofed Project',
            spaceId: createdSpace.id,
          }),
          headers: withSessionCookie(bobCookie, {
            'Content-Type': 'application/json',
          }),
          method: 'POST',
        });
        const payload = (await response.json()) as { error: string };

        expect(response.status).toBe(400);
        expect(payload.error).toMatch(/actor does not match/i);
      } finally {
        await server.close();
      }
    } finally {
      rmSync(storageRoot, { force: true, recursive: true });
    }
  });

  it('rejects matching legacy actor fields on project routes', async () => {
    const storageRoot = mkdtempSync(join(tmpdir(), 'jixia-http-projects-'));

    try {
      const server = await startTestServer({
        JIXIA_DATABASE_URL: `file:${join(storageRoot, 'jixia-http-projects.db')}`,
        JIXIA_STORAGE_ROOT: storageRoot,
      });

      try {
        const aliceCookie = await loginAs(server.url, 'user-alice');

        const createdSpace = await fetch(`${server.url}/api/spaces`, {
          body: JSON.stringify({ kind: 'shared', name: 'HTTP Matching Actor' }),
          headers: withSessionCookie(aliceCookie, {
            'Content-Type': 'application/json',
          }),
          method: 'POST',
        }).then((response) => response.json() as Promise<{ id: string }>);
        const createdProject = await fetch(`${server.url}/api/projects`, {
          body: JSON.stringify({
            name: 'Matching Actor Project',
            spaceId: createdSpace.id,
          }),
          headers: withSessionCookie(aliceCookie, {
            'Content-Type': 'application/json',
          }),
          method: 'POST',
        }).then(
          (response) => response.json() as Promise<{ project: { id: string } }>,
        );

        const matchingResponses = await Promise.all([
          fetch(`${server.url}/api/projects`, {
            body: JSON.stringify({
              actorUserId: 'user-alice',
              name: 'Matching Actor Rejected Project',
              spaceId: createdSpace.id,
            }),
            headers: withSessionCookie(aliceCookie, {
              'Content-Type': 'application/json',
            }),
            method: 'POST',
          }),
          fetch(`${server.url}/api/projects?actorUserId=user-alice`, {
            headers: withSessionCookie(aliceCookie),
          }),
          fetch(
            `${server.url}/api/projects/${createdProject.project.id}?actorUserId=user-alice`,
            { headers: withSessionCookie(aliceCookie) },
          ),
          fetch(
            `${server.url}/api/projects/${createdProject.project.id}/members?actorUserId=user-alice`,
            { headers: withSessionCookie(aliceCookie) },
          ),
          fetch(
            `${server.url}/api/projects/${createdProject.project.id}/workspace?actorUserId=user-alice`,
            { headers: withSessionCookie(aliceCookie) },
          ),
          fetch(
            `${server.url}/api/projects/${createdProject.project.id}/workspace?actorSpaceId=${createdSpace.id}`,
            { headers: withSessionCookie(aliceCookie) },
          ),
        ]);

        for (const response of matchingResponses) {
          const payload = (await response.json()) as { error: string };

          expect(response.status).toBe(400);
          expect(payload.error).toMatch(/not accepted for protected routes/i);
        }
      } finally {
        await server.close();
      }
    } finally {
      rmSync(storageRoot, { force: true, recursive: true });
    }
  });

  it('rejects query actor impersonation on project reads', async () => {
    const storageRoot = mkdtempSync(join(tmpdir(), 'jixia-http-projects-'));

    try {
      const server = await startTestServer({
        JIXIA_DATABASE_URL: `file:${join(storageRoot, 'jixia-http-projects.db')}`,
        JIXIA_STORAGE_ROOT: storageRoot,
      });

      try {
        const aliceCookie = await loginAs(server.url, 'user-alice');
        const bobCookie = await loginAs(server.url, 'user-bob');

        const createdSpace = await fetch(`${server.url}/api/spaces`, {
          body: JSON.stringify({ kind: 'shared', name: 'HTTP Query Mismatch' }),
          headers: withSessionCookie(aliceCookie, {
            'Content-Type': 'application/json',
          }),
          method: 'POST',
        }).then((response) => response.json() as Promise<{ id: string }>);

        const createdProject = await fetch(`${server.url}/api/projects`, {
          body: JSON.stringify({
            name: 'Query Mismatch Project',
            spaceId: createdSpace.id,
          }),
          headers: withSessionCookie(aliceCookie, {
            'Content-Type': 'application/json',
          }),
          method: 'POST',
        }).then(
          (response) => response.json() as Promise<{ project: { id: string } }>,
        );

        const [listResponse, readResponse, membersResponse, workspaceResponse] = await Promise.all([
          fetch(`${server.url}/api/projects?actorUserId=user-alice`, {
            headers: withSessionCookie(bobCookie),
          }),
          fetch(
            `${server.url}/api/projects/${createdProject.project.id}?actorUserId=user-alice`,
            { headers: withSessionCookie(bobCookie) },
          ),
          fetch(
            `${server.url}/api/projects/${createdProject.project.id}/members?actorUserId=user-alice`,
            { headers: withSessionCookie(bobCookie) },
          ),
          fetch(
            `${server.url}/api/projects/${createdProject.project.id}/workspace?actorUserId=user-alice`,
            { headers: withSessionCookie(bobCookie) },
          ),
        ]);

        for (const response of [listResponse, readResponse, membersResponse, workspaceResponse]) {
          const payload = (await response.json()) as { error: string };

          expect(response.status).toBe(400);
          expect(payload.error).toMatch(/actor does not match/i);
        }
      } finally {
        await server.close();
      }
    } finally {
      rmSync(storageRoot, { force: true, recursive: true });
    }
  });

  it('rejects missing project actors before trusting request payload identity', async () => {
    const storageRoot = mkdtempSync(join(tmpdir(), 'jixia-http-projects-'));

    try {
      const server = await startTestServer({
        JIXIA_DATABASE_URL: `file:${join(storageRoot, 'jixia-http-projects.db')}`,
        JIXIA_STORAGE_ROOT: storageRoot,
      });

      try {
        const response = await fetch(`${server.url}/api/projects`, {
          body: JSON.stringify({
            actorUserId: 'user-alice',
            name: 'Missing Actor Project',
            spaceId: 'space-unknown',
          }),
          headers: { 'Content-Type': 'application/json' },
          method: 'POST',
        });
        const payload = (await response.json()) as { error: string };

        expect(response.status).toBe(401);
        expect(payload.error).toMatch(/server-derived actor session/i);
      } finally {
        await server.close();
      }
    } finally {
      rmSync(storageRoot, { force: true, recursive: true });
    }
  });

  it('returns a ProjectMember-authorized workspace read model with populated and empty docs indexes', async () => {
    const storageRoot = mkdtempSync(join(tmpdir(), 'jixia-http-project-workspace-'));

    try {
      const databaseUrl = `file:${join(storageRoot, 'jixia-http-project-workspace.db')}`;
      const server = await startTestServer({
        JIXIA_DATABASE_URL: databaseUrl,
        JIXIA_STORAGE_ROOT: storageRoot,
      });

      try {
        const aliceCookie = await loginAs(server.url, 'user-alice');
        const bobCookie = await loginAs(server.url, 'user-bob');
        const charlieCookie = await loginAs(server.url, 'user-charlie');

        const createdSpace = await fetch(`${server.url}/api/spaces`, {
          body: JSON.stringify({ kind: 'shared', name: 'Workspace Docs' }),
          headers: withSessionCookie(aliceCookie, {
            'Content-Type': 'application/json',
          }),
          method: 'POST',
        }).then((response) => response.json() as Promise<{ id: string }>);
        const project = await fetch(`${server.url}/api/projects`, {
          body: JSON.stringify({
            name: 'Workspace Project',
            spaceId: createdSpace.id,
          }),
          headers: withSessionCookie(aliceCookie, {
            'Content-Type': 'application/json',
          }),
          method: 'POST',
        }).then(
          (response) => response.json() as Promise<{
            project: { id: string; spaceId: string };
          }>,
        );

        const prisma = createPrismaClient({ url: databaseUrl });
        const projectDocRepository = createProjectDocRepository(prisma);
        try {
          const document = await projectDocRepository.createDocument({
            createdByUserId: 'user-alice',
            projectId: project.project.id,
            title: 'Workspace indexed synthesis',
          });
          await projectDocRepository.saveVersion({
            citations: [],
            content: 'Server-owned indexed content.',
            documentId: document.id,
          });
        } finally {
          await prisma.$disconnect();
        }

        const ownerResponse = await fetch(
          `${server.url}/api/projects/${project.project.id}/workspace`,
          { headers: withSessionCookie(aliceCookie) },
        );
        const ownerWorkspace = (await ownerResponse.json()) as {
          actor: { role: string; userId: string };
          docs: {
            canCreate: boolean;
            createDisabledReason?: string;
            documents: Array<{
              createdByUserId: string;
              documentId: string;
              latestVersion: { versionNumber: number } | null;
              openHref: string;
              title: string;
            }>;
            totalCount: number;
          };
          links: { libraryHref: string; projectHref: string; writerHref?: string };
          membership: { role: string; userId: string };
          project: { id: string; spaceId: string };
        };

        expect(ownerResponse.status).toBe(200);
        expect(ownerWorkspace.actor).toEqual({ role: 'owner', userId: 'user-alice' });
        expect(ownerWorkspace.project).toMatchObject(project.project);
        expect(ownerWorkspace.docs.totalCount).toBe(1);
        expect(ownerWorkspace.docs.canCreate).toBe(true);
        expect(ownerWorkspace.docs.createDisabledReason).toBeUndefined();
        expect(ownerWorkspace.docs.documents[0]).toMatchObject({
          latestVersion: { versionNumber: 1 },
          createdByUserId: 'user-alice',
          openHref: `/projects/${project.project.id}/writing/${ownerWorkspace.docs.documents[0]?.documentId}`,
          title: 'Workspace indexed synthesis',
        });
        expect(ownerWorkspace.links).toMatchObject({
          libraryHref: `/projects/${project.project.id}/library`,
          projectHref: `/projects/${project.project.id}`,
          writerHref: ownerWorkspace.docs.documents[0]?.openHref,
        });

        await fetch(`${server.url}/api/projects/${project.project.id}/members`, {
          body: JSON.stringify({ role: 'viewer', userId: 'user-bob' }),
          headers: withSessionCookie(aliceCookie, {
            'Content-Type': 'application/json',
          }),
          method: 'POST',
        });
        await fetch(`${server.url}/api/projects/${project.project.id}/members`, {
          body: JSON.stringify({ role: 'editor', userId: 'user-charlie' }),
          headers: withSessionCookie(aliceCookie, {
            'Content-Type': 'application/json',
          }),
          method: 'POST',
        });
        const viewerResponse = await fetch(
          `${server.url}/api/projects/${project.project.id}/workspace`,
          { headers: withSessionCookie(bobCookie) },
        );
        const viewerWorkspace = (await viewerResponse.json()) as {
          actor: { role: string; userId: string };
          docs: { canCreate: boolean; createDisabledReason?: string; totalCount: number };
        };

        expect(viewerResponse.status).toBe(200);
        expect(viewerWorkspace.actor).toEqual({ role: 'viewer', userId: 'user-bob' });
        expect(viewerWorkspace.docs.totalCount).toBe(1);
        expect(viewerWorkspace.docs.canCreate).toBe(false);
        expect(viewerWorkspace.docs.createDisabledReason).toMatch(/viewers can read/i);

        const editorResponse = await fetch(
          `${server.url}/api/projects/${project.project.id}/workspace`,
          { headers: withSessionCookie(charlieCookie) },
        );
        const editorWorkspace = (await editorResponse.json()) as {
          actor: { role: string; userId: string };
          docs: { canCreate: boolean; createDisabledReason?: string; totalCount: number };
        };

        expect(editorResponse.status).toBe(200);
        expect(editorWorkspace.actor).toEqual({ role: 'editor', userId: 'user-charlie' });
        expect(editorWorkspace.docs.totalCount).toBe(1);
        expect(editorWorkspace.docs.canCreate).toBe(true);
        expect(editorWorkspace.docs.createDisabledReason).toBeUndefined();

        const emptyProject = await fetch(`${server.url}/api/projects`, {
          body: JSON.stringify({
            name: 'Empty Workspace Project',
            spaceId: createdSpace.id,
          }),
          headers: withSessionCookie(aliceCookie, {
            'Content-Type': 'application/json',
          }),
          method: 'POST',
        }).then((response) => response.json() as Promise<{ project: { id: string } }>);
        const emptyResponse = await fetch(
          `${server.url}/api/projects/${emptyProject.project.id}/workspace`,
          { headers: withSessionCookie(aliceCookie) },
        );
        const emptyWorkspace = (await emptyResponse.json()) as {
          docs: {
            canCreate: boolean;
            documents: unknown[];
            emptyState: { body: string; title: string };
            totalCount: number;
          };
          links: { writerHref?: string };
        };

        expect(emptyResponse.status).toBe(200);
        expect(emptyWorkspace.docs.documents).toEqual([]);
        expect(emptyWorkspace.docs.totalCount).toBe(0);
        expect(emptyWorkspace.docs.canCreate).toBe(true);
        expect(emptyWorkspace.docs.emptyState.title).toBe('No Project Docs yet');
        expect(emptyWorkspace.links.writerHref).toBeUndefined();
      } finally {
        await server.close();
      }
    } finally {
      rmSync(storageRoot, { force: true, recursive: true });
    }
  });

  it('denies workspace reads for non-members even when they belong to the governance space', async () => {
    const storageRoot = mkdtempSync(join(tmpdir(), 'jixia-http-project-workspace-auth-'));

    try {
      const databaseUrl = `file:${join(storageRoot, 'jixia-http-project-workspace-auth.db')}`;
      const server = await startTestServer({
        JIXIA_DATABASE_URL: databaseUrl,
        JIXIA_STORAGE_ROOT: storageRoot,
      });

      try {
        const aliceCookie = await loginAs(server.url, 'user-alice');
        const charlieCookie = await loginAs(server.url, 'user-charlie');

        const createdSpace = await fetch(`${server.url}/api/spaces`, {
          body: JSON.stringify({ kind: 'shared', name: 'Workspace Space Gate' }),
          headers: withSessionCookie(aliceCookie, {
            'Content-Type': 'application/json',
          }),
          method: 'POST',
        }).then((response) => response.json() as Promise<{ id: string }>);
        const project = await fetch(`${server.url}/api/projects`, {
          body: JSON.stringify({
            name: 'ProjectMember Only Workspace',
            spaceId: createdSpace.id,
          }),
          headers: withSessionCookie(aliceCookie, {
            'Content-Type': 'application/json',
          }),
          method: 'POST',
        }).then((response) => response.json() as Promise<{ project: { id: string } }>);

        const prisma = createPrismaClient({ url: databaseUrl });
        try {
          await createSpaceRepository(prisma).addMembership(createdSpace.id, {
            role: 'viewer',
            userId: 'user-charlie',
          });
        } finally {
          await prisma.$disconnect();
        }

        const response = await fetch(
          `${server.url}/api/projects/${project.project.id}/workspace`,
          { headers: withSessionCookie(charlieCookie) },
        );
        const payload = (await response.json()) as { error: string };

        expect(response.status).toBe(403);
        expect(payload.error).toMatch(/access denied/i);
      } finally {
        await server.close();
      }
    } finally {
      rmSync(storageRoot, { force: true, recursive: true });
    }
  });

  it('requires the session actor for project workspace reads before trusting query identity', async () => {
    const storageRoot = mkdtempSync(join(tmpdir(), 'jixia-http-project-workspace-session-'));

    try {
      const server = await startTestServer({
        JIXIA_DATABASE_URL: `file:${join(storageRoot, 'jixia-http-project-workspace-session.db')}`,
        JIXIA_STORAGE_ROOT: storageRoot,
      });

      try {
        const response = await fetch(
          `${server.url}/api/projects/project-unknown/workspace?actorUserId=user-alice`,
        );
        const payload = (await response.json()) as { error: string };

        expect(response.status).toBe(401);
        expect(payload.error).toMatch(/server-derived actor session/i);
      } finally {
        await server.close();
      }
    } finally {
      rmSync(storageRoot, { force: true, recursive: true });
    }
  });
});
