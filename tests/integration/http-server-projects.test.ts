import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { describe, expect, it } from 'vitest';

import {
  createLibraryRepository,
  createNotebookRepository,
  createPrismaClient,
  createProjectDocRepository,
  createReadingRepository,
  createSpaceRepository,
} from '../../src/db';
import { createJixiaApp } from '../../src/server/app';
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
        const privateLeakSentinels = [
          'Private reader leak title',
          'Private reader leak abstract',
          'Private reader leak note body',
          'Private reader leak insight conversation',
          'Private reader leak insight summary',
          'Private reader leak evidence quote',
          'Private notebook leak title',
          'Private notebook leak content',
        ];
        const projectDocRepository = createProjectDocRepository(prisma);
        try {
          const privateLibraryEntry = await createLibraryRepository(prisma).importScopedEntry({
            asset: {
              abstractText: 'Private reader leak abstract',
              canonicalId: 'doi:10.1000/private-reader-leak',
              importedByUserId: 'user-alice',
              sourceLocator: '10.1000/private-reader-leak',
              sourceType: 'doi',
              title: 'Private reader leak title',
            },
            entry: {
              addedByUserId: 'user-alice',
              scope: { id: 'user-alice', type: 'user' },
            },
          });
          const projectLibraryEntry = await createLibraryRepository(prisma).importScopedEntry({
            asset: {
              abstractText: 'Project reader entry abstract',
              canonicalId: 'doi:10.1000/project-reader-entry',
              importedByUserId: 'user-alice',
              sourceLocator: '10.1000/project-reader-entry',
              sourceType: 'doi',
              title: 'Project reader entry title',
            },
            entry: {
              addedByUserId: 'user-alice',
              scope: { id: project.project.id, type: 'project' },
            },
          });
          const readingRepository = createReadingRepository(prisma);
          await readingRepository.createProjectComment({
            authorUserId: 'user-alice',
            body: 'Project-scoped reader comment body',
            libraryEntryId: projectLibraryEntry.entry.id,
            projectId: project.project.id,
          });
          await readingRepository.createReaderExcerpt({
            createdByUserId: 'user-alice',
            endOffset: 44,
            libraryEntryId: projectLibraryEntry.entry.id,
            locator: 'reader-loc-1',
            note: 'Project reader excerpt note',
            paperAssetId: projectLibraryEntry.asset.id,
            quote: 'Project reader excerpt quote',
            startOffset: 0,
          });
          await readingRepository.createPrivateNote({
            authorUserId: 'user-alice',
            body: 'Private reader leak note body',
            libraryEntryId: privateLibraryEntry.entry.id,
          });
          const privateConversation = await readingRepository.createConversation({
            libraryEntryId: privateLibraryEntry.entry.id,
            startedByUserId: 'user-alice',
            title: 'Private reader leak insight conversation',
          });
          await readingRepository.saveGeneratedInsight({
            conversationId: privateConversation.id,
            createdByUserId: 'user-alice',
            evidenceSpans: [
              {
                endOffset: 34,
                orderIndex: 0,
                paperAssetId: privateLibraryEntry.asset.id,
                quote: 'Private reader leak evidence quote',
                startOffset: 0,
              },
            ],
            libraryEntryId: privateLibraryEntry.entry.id,
            summary: 'Private reader leak insight summary',
          });
          const privateNotebook = await createNotebookRepository(prisma).createDocument({
            ownerId: 'user-alice',
            title: 'Private notebook leak title',
          });
          await createNotebookRepository(prisma).saveVersion({
            citations: [],
            content: 'Private notebook leak content',
            documentId: privateNotebook.id,
          });
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
          const workspaceSeederApp = createJixiaApp({
            env: {
              JIXIA_DATABASE_URL: databaseUrl,
              JIXIA_STORAGE_ROOT: storageRoot,
            },
          });
          try {
            const credential = await workspaceSeederApp.credentials.createCredential({
              provider: 'openai',
              rawSecret: 'workspace-job-secret',
              userId: 'user-alice',
            }, 'user-alice');
            await workspaceSeederApp.jobs.createJob({
              credentialRef: credential.credentialRef,
              kind: 'ai.summary',
              payload: { prompt: 'Summarize the project workspace.' },
              requestedByUserId: 'user-alice',
              scope: { id: project.project.id, type: 'project' },
              spaceId: project.project.spaceId,
            }, 'user-alice');
          } finally {
            await workspaceSeederApp.close();
          }
        } finally {
          await prisma.$disconnect();
        }

        const ownerResponse = await fetch(
          `${server.url}/api/projects/${project.project.id}/workspace`,
          { headers: withSessionCookie(aliceCookie) },
        );
        const ownerWorkspace = (await ownerResponse.json()) as {
          actor: { role: string; userId: string };
          activity: {
            emptyState: { body: string; title: string };
            items: Array<{
              href?: string;
              id: string;
              kind: string;
              occurredAt: string;
              projectId: string;
              sourceId?: string;
              sourceLabel?: string;
              summary: string;
              title: string;
            }>;
            totalCount: number;
          };
          docs: {
            canCreate: boolean;
            createDisabledReason?: string;
            documents: Array<{
              createdByUserId: string;
              documentId: string;
              latestVersion: { capturedAt: string; versionNumber: number } | null;
              openHref: string;
              title: string;
            }>;
            totalCount: number;
          };
          links: { libraryHref: string; projectHref: string; writerHref?: string };
          membership: { role: string; userId: string };
          project: { id: string; spaceId: string };
          resources: {
            emptyState: { body: string; title: string };
            items: Array<{
              href?: string;
              id: string;
              kind: string;
              projectId: string;
              sourceId?: string;
              subtitle?: string;
              title: string;
              updatedAt?: string;
            }>;
            totalCount: number;
          };
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
        expect(ownerWorkspace.activity.totalCount).toBe(5);
        expect(ownerWorkspace.activity.items).toHaveLength(5);
        expect(ownerWorkspace.activity.items.map((item) => item.kind)).toEqual([
          'job',
          'project-doc',
          'reader-excerpt',
          'reader-comment',
          'library-entry',
        ]);
        expect(ownerWorkspace.activity.items[0]).toMatchObject({
          kind: 'job',
          projectId: project.project.id,
          sourceLabel: 'Project job',
          summary: 'Job status · queued',
          title: 'ai.summary',
        });
        expect(ownerWorkspace.activity.items[1]).toMatchObject({
          href: ownerWorkspace.docs.documents[0]?.openHref,
          kind: 'project-doc',
          occurredAt: ownerWorkspace.docs.documents[0]?.latestVersion?.capturedAt,
          projectId: project.project.id,
          sourceId: ownerWorkspace.docs.documents[0]?.documentId,
          sourceLabel: 'Project Doc',
          summary: 'Project Doc draft · version 1',
          title: 'Workspace indexed synthesis',
        });
        expect(ownerWorkspace.activity.items[2]).toMatchObject({
          kind: 'reader-excerpt',
          projectId: project.project.id,
          sourceLabel: 'Reader excerpt',
        });
        expect(ownerWorkspace.activity.items[3]).toMatchObject({
          kind: 'reader-comment',
          projectId: project.project.id,
          sourceLabel: 'Reader comment',
        });
        expect(ownerWorkspace.activity.items[4]).toMatchObject({
          kind: 'library-entry',
          projectId: project.project.id,
          sourceLabel: 'Project Library',
        });
        for (const activity of ownerWorkspace.activity.items) {
          expect(activity).not.toHaveProperty('actorUserId');
        }
        const serializedWorkspaceActivity = JSON.stringify(ownerWorkspace.activity.items);
        for (const sentinel of privateLeakSentinels) {
          expect(serializedWorkspaceActivity).not.toContain(sentinel);
        }
        expect(ownerWorkspace.resources.totalCount).toBe(4);
        expect(ownerWorkspace.resources.items.map((item) => item.kind)).toEqual([
          'job',
          'project-doc',
          'reader-excerpt',
          'library-entry',
        ]);
        expect(ownerWorkspace.resources.items[0]).toMatchObject({
          kind: 'job',
          projectId: project.project.id,
          subtitle: 'Project job · queued',
          title: 'ai.summary',
        });
        expect(ownerWorkspace.resources.items[1]).toMatchObject({
          href: ownerWorkspace.docs.documents[0]?.openHref,
          kind: 'project-doc',
          projectId: project.project.id,
          sourceId: ownerWorkspace.docs.documents[0]?.documentId,
          subtitle: 'draft · version 1',
          title: 'Workspace indexed synthesis',
        });
        expect(ownerWorkspace.resources.items[2]).toMatchObject({
          kind: 'reader-excerpt',
          projectId: project.project.id,
          subtitle: 'Reader excerpt · Project reader entry title · reader-loc-1',
          title: 'Project reader excerpt quote',
        });
        expect(ownerWorkspace.resources.items[3]).toMatchObject({
          kind: 'library-entry',
          projectId: project.project.id,
          subtitle: 'Project Library · doi:10.1000/project-reader-entry',
          title: 'Project reader entry title',
        });
        const serializedWorkspaceResources = JSON.stringify(ownerWorkspace.resources.items);
        for (const sentinel of privateLeakSentinels) {
          expect(serializedWorkspaceResources).not.toContain(sentinel);
        }
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
          activity: {
            emptyState: { body: string; title: string };
            items: unknown[];
            totalCount: number;
          };
          links: { writerHref?: string };
          resources: {
            emptyState: { body: string; title: string };
            items: unknown[];
            totalCount: number;
          };
        };

        expect(emptyResponse.status).toBe(200);
        expect(emptyWorkspace.docs.documents).toEqual([]);
        expect(emptyWorkspace.docs.totalCount).toBe(0);
        expect(emptyWorkspace.docs.canCreate).toBe(true);
        expect(emptyWorkspace.docs.emptyState.title).toBe('No Project Docs yet');
        expect(emptyWorkspace.activity.items).toEqual([]);
        expect(emptyWorkspace.activity.totalCount).toBe(0);
        expect(emptyWorkspace.activity.emptyState.title).toBe('No project activity yet');
        expect(emptyWorkspace.activity.emptyState.body).toMatch(/Project Docs, project Library entries, Reader comments or excerpts, and governed project jobs/i);
        expect(emptyWorkspace.resources.items).toEqual([]);
        expect(emptyWorkspace.resources.totalCount).toBe(0);
        expect(emptyWorkspace.resources.emptyState.title).toBe('No project resources yet');
        expect(emptyWorkspace.resources.emptyState.body).toMatch(/Project Docs, adopts literature into the project-scoped Library, captures Reader excerpts, or opens governed jobs/i);
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
