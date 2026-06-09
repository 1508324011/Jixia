import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { describe, expect, it } from 'vitest';

import type { ProjectWorkspaceResponse } from '../../src/shared/contracts/projects';

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
              memberCount: number;
              membership: { role: string; userId: string };
              project: { id: string; name: string; spaceId: string };
            }>,
        );

        expect(createdProject.project.spaceId).toBe(createdSpace.id);
        expect(createdProject.memberCount).toBe(1);
        expect(createdProject.membership).toMatchObject({
          role: 'owner',
          userId: 'user-alice',
        });

        const aliceProjects = await fetch(`${server.url}/api/projects`, {
          headers: withSessionCookie(aliceCookie),
        }).then(
          (response) =>
            response.json() as Promise<
              Array<{ memberCount: number; project: { id: string } }>
            >,
        );
        expect(aliceProjects.map((item) => item.project.id)).toContain(
          createdProject.project.id,
        );
        expect(
          aliceProjects.find((item) => item.project.id === createdProject.project.id)
            ?.memberCount,
        ).toBe(1);

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

        await fetch(`${server.url}/api/projects/${createdProject.project.id}/members`, {
          body: JSON.stringify({ role: 'viewer', userId: 'user-bob' }),
          headers: withSessionCookie(aliceCookie, {
            'Content-Type': 'application/json',
          }),
          method: 'POST',
        });
        const bobVisibleProjectResponse = await fetch(
          `${server.url}/api/projects/${createdProject.project.id}`,
          { headers: withSessionCookie(bobCookie) },
        );
        const bobVisibleProject = (await bobVisibleProjectResponse.json()) as {
          memberCount: number;
          membership: { role: string; userId: string };
        };

        expect(bobVisibleProjectResponse.status).toBe(200);
        expect(bobVisibleProject.memberCount).toBe(2);
        expect(bobVisibleProject.membership).toMatchObject({
          role: 'viewer',
          userId: 'user-bob',
        });
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

  it('validates project member mutation DTOs before persistence', async () => {
    const storageRoot = mkdtempSync(join(tmpdir(), 'jixia-http-project-members-'));

    try {
      const server = await startTestServer({
        JIXIA_DATABASE_URL: `file:${join(storageRoot, 'jixia-http-project-members.db')}`,
        JIXIA_STORAGE_ROOT: storageRoot,
      });

      try {
        const aliceCookie = await loginAs(server.url, 'user-alice');

        const createdSpace = await fetch(`${server.url}/api/spaces`, {
          body: JSON.stringify({ kind: 'shared', name: 'HTTP Member Parser' }),
          headers: withSessionCookie(aliceCookie, {
            'Content-Type': 'application/json',
          }),
          method: 'POST',
        }).then((response) => response.json() as Promise<{ id: string }>);
        const createdProject = await fetch(`${server.url}/api/projects`, {
          body: JSON.stringify({
            name: 'Member Parser Project',
            spaceId: createdSpace.id,
          }),
          headers: withSessionCookie(aliceCookie, {
            'Content-Type': 'application/json',
          }),
          method: 'POST',
        }).then(
          (response) => response.json() as Promise<{ project: { id: string } }>,
        );

        const mutationUrl = `${server.url}/api/projects/${createdProject.project.id}/members`;
        const jsonHeaders = withSessionCookie(aliceCookie, {
          'Content-Type': 'application/json',
        });
        const invalidPayloads: Array<{
          body: unknown;
          expectedError: RegExp;
          label: string;
        }> = [
          {
            body: { role: 'admin', userId: 'user-bob' },
            expectedError: /role must be owner, editor, or viewer/i,
            label: 'invalid role',
          },
          {
            body: { userId: 'user-bob' },
            expectedError: /role must be owner, editor, or viewer/i,
            label: 'missing role',
          },
          {
            body: { role: 'viewer' },
            expectedError: /userId is required/i,
            label: 'missing userId',
          },
          {
            body: { role: 'viewer', userId: '   ' },
            expectedError: /userId is required/i,
            label: 'blank userId',
          },
          {
            body: { role: 'viewer', userId: 42 },
            expectedError: /userId is required/i,
            label: 'non-string userId',
          },
          {
            body: { actorUserId: 'user-alice', role: 'viewer', userId: 'user-bob' },
            expectedError: /not accepted for protected routes/i,
            label: 'matching actor residue',
          },
          {
            body: { requestedByUserId: 'user-alice', role: 'viewer', userId: 'user-bob' },
            expectedError: /not accepted for protected routes/i,
            label: 'requested-by residue',
          },
          {
            body: { authorUserId: 'user-alice', role: 'viewer', userId: 'user-bob' },
            expectedError: /not accepted for protected routes/i,
            label: 'author residue',
          },
          {
            body: { startedByUserId: 'user-alice', role: 'viewer', userId: 'user-bob' },
            expectedError: /not accepted for protected routes/i,
            label: 'started-by residue',
          },
          {
            body: { createdByUserId: 'user-alice', role: 'viewer', userId: 'user-bob' },
            expectedError: /not accepted for protected routes/i,
            label: 'created-by residue',
          },
          {
            body: { ownerId: 'user-alice', role: 'viewer', userId: 'user-bob' },
            expectedError: /not accepted for protected routes/i,
            label: 'owner residue',
          },
          {
            body: { actorSpaceId: createdSpace.id, role: 'viewer', userId: 'user-bob' },
            expectedError: /not accepted for protected routes/i,
            label: 'actor-space residue',
          },
          {
            body: { role: 'viewer', scope: { id: createdProject.project.id, type: 'project' }, userId: 'user-bob' },
            expectedError: /not accepted for protected routes/i,
            label: 'scope residue',
          },
          {
            body: { role: 'viewer', scopeType: 'project', userId: 'user-bob' },
            expectedError: /not accepted for protected routes/i,
            label: 'scopeType residue',
          },
          {
            body: { role: 'viewer', scopeId: createdProject.project.id, userId: 'user-bob' },
            expectedError: /not accepted for protected routes/i,
            label: 'scopeId residue',
          },
          {
            body: { role: 'viewer', spaceId: createdSpace.id, userId: 'user-bob' },
            expectedError: /not accepted for protected routes/i,
            label: 'space residue',
          },
          {
            body: { role: 'viewer', userId: 'user-bob', visibility: 'published_to_project' },
            expectedError: /not accepted for protected routes/i,
            label: 'visibility residue',
          },
          {
            body: { projectId: createdProject.project.id, role: 'viewer', userId: 'user-bob' },
            expectedError: /not accepted for protected routes/i,
            label: 'project residue',
          },
          {
            body: { extra: 'ignored-no-more', role: 'viewer', userId: 'user-bob' },
            expectedError: /Project member mutation payload\.extra is not accepted/i,
            label: 'unknown extra field',
          },
        ];

        for (const invalidPayload of invalidPayloads) {
          const response = await fetch(mutationUrl, {
            body: JSON.stringify(invalidPayload.body),
            headers: jsonHeaders,
            method: 'POST',
          });
          const payload = (await response.json()) as { error: string };

          expect(response.status, invalidPayload.label).toBe(400);
          expect(payload.error, invalidPayload.label).toMatch(
            invalidPayload.expectedError,
          );
        }

        const membersAfterInvalidPayloads = await fetch(mutationUrl, {
          headers: withSessionCookie(aliceCookie),
        }).then(
          (response) => response.json() as Promise<Array<{ userId: string }>>,
        );
        expect(membersAfterInvalidPayloads.map((member) => member.userId)).toEqual([
          'user-alice',
        ]);

        const validPayloads = [
          { role: 'viewer', userId: 'user-bob' },
          { role: 'editor', userId: 'user-charlie' },
          { role: 'owner', userId: 'user-diana' },
        ] as const;

        for (const validPayload of validPayloads) {
          const response = await fetch(mutationUrl, {
            body: JSON.stringify(validPayload),
            headers: jsonHeaders,
            method: 'POST',
          });
          const payload = (await response.json()) as {
            role: string;
            userId: string;
          };

          expect(response.status, validPayload.role).toBe(200);
          expect(payload, validPayload.role).toMatchObject(validPayload);
        }
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
            publishState: 'review',
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
          review: ProjectWorkspaceResponse['review'];
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
          summary: 'Project Doc review · version 1',
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
        expect(ownerWorkspace.review.totalCount).toBe(4);
        expect(ownerWorkspace.review.summary).toEqual(
          expect.objectContaining({
            collaborationSignals: 2,
            documentsInReview: 1,
            jobsNeedingAttention: 1,
            totalReviewItems: 4,
          }),
        );
        expect(ownerWorkspace.review.summary.newestReviewTimestamp).toBeDefined();
        expect(ownerWorkspace.review.items.map((item) => item.kind)).toEqual([
          'job-attention',
          'project-doc-review',
          'reader-excerpt',
          'reader-comment',
        ]);
        expect(ownerWorkspace.review.items).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              kind: 'project-doc-review',
              priority: 'review',
              projectId: project.project.id,
              sourceLabel: 'Project Doc',
              summary: 'Project Doc is in review · version 1',
              title: 'Workspace indexed synthesis',
            }),
            expect.objectContaining({
              kind: 'job-attention',
              priority: 'monitor',
              projectId: project.project.id,
              sourceLabel: 'Project job',
              summary: 'Governed project job needs monitoring · queued',
              title: 'ai.summary',
            }),
            expect.objectContaining({
              kind: 'reader-excerpt',
              priority: 'context',
              projectId: project.project.id,
              sourceLabel: 'Reader excerpt',
              title: 'Project reader excerpt quote',
            }),
            expect.objectContaining({
              kind: 'reader-comment',
              priority: 'context',
              projectId: project.project.id,
              sourceLabel: 'Reader comment',
              title: 'Project-scoped reader comment body',
            }),
          ]),
        );
        for (const reviewItem of ownerWorkspace.review.items) {
          expect(reviewItem).not.toHaveProperty('actorUserId');
          expect(reviewItem).not.toHaveProperty('credentialRef');
          expect(reviewItem).not.toHaveProperty('payload');
          expect(reviewItem).not.toHaveProperty('storageKey');
          expect(reviewItem).not.toHaveProperty('checksum');
        }
        const serializedWorkspaceReview = JSON.stringify(ownerWorkspace.review.items);
        expect(serializedWorkspaceReview).not.toContain('workspace-job-secret');
        expect(serializedWorkspaceReview).not.toContain('storageKey');
        expect(serializedWorkspaceReview).not.toContain('checksum');
        for (const sentinel of privateLeakSentinels) {
          expect(serializedWorkspaceReview).not.toContain(sentinel);
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
          subtitle: 'review · version 1',
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
          review: ProjectWorkspaceResponse['review'];
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
        expect(emptyWorkspace.review.items).toEqual([]);
        expect(emptyWorkspace.review.totalCount).toBe(0);
        expect(emptyWorkspace.review.summary).toEqual({
          collaborationSignals: 0,
          documentsInReview: 0,
          jobsNeedingAttention: 0,
          newestReviewTimestamp: undefined,
          totalReviewItems: 0,
        });
        expect(emptyWorkspace.review.emptyState.title).toBe('No project review items yet');
        expect(emptyWorkspace.review.emptyState.body).toMatch(/Project Docs enter review, project jobs need monitoring, or project Reader collaboration/i);
        expect(emptyWorkspace.resources.items).toEqual([]);
        expect(emptyWorkspace.resources.totalCount).toBe(0);
        expect(emptyWorkspace.resources.emptyState.title).toBe('No project resources yet');
        expect(emptyWorkspace.resources.emptyState.body).toMatch(/Project Docs, explicitly adopts literature from Personal Library into the project-scoped Library, captures Reader excerpts, or opens governed jobs/i);
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

  it('rejects legacy actor override headers on project workspace reads', async () => {
    const storageRoot = mkdtempSync(join(tmpdir(), 'jixia-http-project-workspace-legacy-'));

    try {
      const server = await startTestServer({
        JIXIA_ALLOW_LEGACY_ACTOR_OVERRIDE: 'true',
        JIXIA_DATABASE_URL: `file:${join(storageRoot, 'jixia-http-project-workspace-legacy.db')}`,
        JIXIA_STORAGE_ROOT: storageRoot,
      });

      try {
        const aliceCookie = await loginAs(server.url, 'user-alice');

        const createdSpace = await fetch(`${server.url}/api/spaces`, {
          body: JSON.stringify({ kind: 'shared', name: 'Workspace Legacy Override' }),
          headers: withSessionCookie(aliceCookie, {
            'Content-Type': 'application/json',
          }),
          method: 'POST',
        }).then((response) => response.json() as Promise<{ id: string }>);
        const createdProject = await fetch(`${server.url}/api/projects`, {
          body: JSON.stringify({
            name: 'Legacy Override Workspace Project',
            spaceId: createdSpace.id,
          }),
          headers: withSessionCookie(aliceCookie, {
            'Content-Type': 'application/json',
          }),
          method: 'POST',
        }).then(
          (response) => response.json() as Promise<{ project: { id: string } }>,
        );

        const legacyActorHeaderResponse = await fetch(
          `${server.url}/api/projects/${createdProject.project.id}/workspace`,
          { headers: { 'x-jixia-actor': 'user-alice' } },
        );
        const legacyBearerResponse = await fetch(
          `${server.url}/api/projects/${createdProject.project.id}/workspace`,
          { headers: { Authorization: 'Bearer user-alice' } },
        );

        for (const response of [legacyActorHeaderResponse, legacyBearerResponse]) {
          const payload = (await response.json()) as { error: string };

          expect(response.status).toBe(401);
          expect(payload.error).toMatch(/server-derived actor session/i);
        }
      } finally {
        await server.close();
      }
    } finally {
      rmSync(storageRoot, { force: true, recursive: true });
    }
  });
});
