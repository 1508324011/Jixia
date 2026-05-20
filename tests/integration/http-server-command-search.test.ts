import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { describe, expect, it } from 'vitest';

import {
  createJobRepository,
  createLibraryRepository,
  createNotebookRepository,
  createPrismaClient,
  createProjectDocRepository,
} from '../../src/db';
import { commandSearchContract } from '../../src/shared/contracts/command-search';
import {
  loginAs,
  startTestServer,
  withSessionCookie,
} from './http-session-test-helpers';

describe('http server command search api', () => {
  it('requires a session-derived actor and rejects legacy actor query fields', async () => {
    const storageRoot = mkdtempSync(join(tmpdir(), 'jixia-command-search-'));

    try {
      const server = await startTestServer({
        JIXIA_DATABASE_URL: `file:${join(storageRoot, 'jixia-command-search.db')}`,
        JIXIA_STORAGE_ROOT: storageRoot,
      });

      try {
        const missingSessionResponse = await fetch(`${server.url}/api/command-search`);
        const missingSessionPayload = (await missingSessionResponse.json()) as {
          error: string;
        };
        expect(missingSessionResponse.status).toBe(401);
        expect(missingSessionPayload.error).toMatch(/server-derived actor session/i);

        const aliceCookie = await loginAs(server.url, 'user-alice');
        const rejectedFields = [
          'actorUserId',
          'requestedByUserId',
          'userId',
          'authorUserId',
          'startedByUserId',
          'actorSpaceId',
        ];

        for (const fieldName of rejectedFields) {
          const response = await fetch(
            `${server.url}/api/command-search?${fieldName}=user-alice`,
            { headers: withSessionCookie(aliceCookie) },
          );
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

  it('ignores legacy actor override headers even when the global override flag is enabled', async () => {
    const storageRoot = mkdtempSync(join(tmpdir(), 'jixia-command-search-'));

    try {
      const server = await startTestServer({
        JIXIA_ALLOW_LEGACY_ACTOR_OVERRIDE: 'true',
        JIXIA_DATABASE_URL: `file:${join(storageRoot, 'jixia-command-search.db')}`,
        JIXIA_STORAGE_ROOT: storageRoot,
      });

      try {
        const legacyActorHeaders: HeadersInit[] = [
          { 'x-jixia-actor': 'user-alice' },
          { Authorization: 'Bearer user-alice' },
        ];

        for (const headers of legacyActorHeaders) {
          const response = await fetch(`${server.url}/api/command-search`, {
            headers,
          });
          const payload = (await response.json()) as { error: string };

          expect(response.status).toBe(401);
          expect(payload.error).toMatch(/server-derived actor session/i);
        }

        const aliceCookie = await loginAs(server.url, 'user-alice');
        const sessionResponse = await fetch(`${server.url}/api/command-search`, {
          headers: withSessionCookie(aliceCookie),
        });

        expect(sessionResponse.status).toBe(200);
      } finally {
        await server.close();
      }
    } finally {
      rmSync(storageRoot, { force: true, recursive: true });
    }
  });

  it('returns only browser-safe objects visible to the session actor', async () => {
    const storageRoot = mkdtempSync(join(tmpdir(), 'jixia-command-search-'));

    try {
      const databaseUrl = `file:${join(storageRoot, 'jixia-command-search.db')}`;
      const server = await startTestServer({
        JIXIA_DATABASE_URL: databaseUrl,
        JIXIA_STORAGE_ROOT: storageRoot,
      });

      try {
        const aliceCookie = await loginAs(server.url, 'user-alice');
        const bobCookie = await loginAs(server.url, 'user-bob');

        const createdSpace = await fetch(`${server.url}/api/spaces`, {
          body: JSON.stringify({ kind: 'shared', name: 'Command Search Space' }),
          headers: withSessionCookie(aliceCookie, {
            'Content-Type': 'application/json',
          }),
          method: 'POST',
        }).then((response) => response.json() as Promise<{ id: string }>);
        const project = await fetch(`${server.url}/api/projects`, {
          body: JSON.stringify({
            name: 'Command Search Project',
            spaceId: createdSpace.id,
          }),
          headers: withSessionCookie(aliceCookie, {
            'Content-Type': 'application/json',
          }),
          method: 'POST',
        }).then(
          (response) =>
            response.json() as Promise<{ project: { id: string; spaceId: string } }>,
        );
        const bobSpace = await fetch(`${server.url}/api/spaces`, {
          body: JSON.stringify({ kind: 'shared', name: 'Hidden Command Space' }),
          headers: withSessionCookie(bobCookie, {
            'Content-Type': 'application/json',
          }),
          method: 'POST',
        }).then((response) => response.json() as Promise<{ id: string }>);
        const bobProject = await fetch(`${server.url}/api/projects`, {
          body: JSON.stringify({
            name: 'Hidden Command Project',
            spaceId: bobSpace.id,
          }),
          headers: withSessionCookie(bobCookie, {
            'Content-Type': 'application/json',
          }),
          method: 'POST',
        }).then(
          (response) =>
            response.json() as Promise<{ project: { id: string; spaceId: string } }>,
        );
        const bobMembershipResponse = await fetch(
          `${server.url}/api/projects/${project.project.id}/members`,
          {
            body: JSON.stringify({ role: 'viewer', userId: 'user-bob' }),
            headers: withSessionCookie(aliceCookie, {
              'Content-Type': 'application/json',
            }),
            method: 'POST',
          },
        );
        expect(bobMembershipResponse.status).toBe(200);

        const prisma = createPrismaClient({ url: databaseUrl });
        let notebookDocumentId = '';
        let projectDocId = '';

        try {
          const libraryRepository = createLibraryRepository(prisma);
          const projectDocRepository = createProjectDocRepository(prisma);
          const notebookRepository = createNotebookRepository(prisma);
          const jobRepository = createJobRepository(prisma);

          const projectDoc = await projectDocRepository.createDocument({
            createdByUserId: 'user-alice',
            projectId: project.project.id,
            title: 'Command Shared Synthesis',
          });
          projectDocId = projectDoc.id;
          await projectDocRepository.saveVersion({
            citations: [],
            content: 'Sensitive Project Doc snapshot should not be indexed.',
            documentId: projectDoc.id,
          });
          await projectDocRepository.createDocument({
            createdByUserId: 'user-bob',
            projectId: bobProject.project.id,
            title: 'Hidden Bob Command Synthesis',
          });
          await libraryRepository.importScopedEntry({
            asset: {
              abstractText: 'Sensitive abstract should not be indexed.',
              canonicalId: 'doi:10.1000/command-personal',
              importedByUserId: 'user-alice',
              sourceLocator: '10.1000/command-personal',
              sourceType: 'doi',
              storageKey: 'private-storage-key-command.pdf',
              title: 'Command Personal Paper',
            },
            entry: {
              addedByUserId: 'user-alice',
              scope: { id: 'user-alice', type: 'user' },
            },
          });
          await libraryRepository.importScopedEntry({
            asset: {
              abstractText: 'Project abstract should not be indexed.',
              canonicalId: 'doi:10.1000/command-project',
              importedByUserId: 'user-alice',
              sourceLocator: '10.1000/command-project',
              sourceType: 'doi',
              storageKey: 'project-storage-key-command.pdf',
              title: 'Command Project Paper',
            },
            entry: {
              addedByUserId: 'user-alice',
              scope: { id: project.project.id, type: 'project' },
            },
          });
          await libraryRepository.importScopedEntry({
            asset: {
              canonicalId: 'doi:10.1000/hidden-command-paper',
              importedByUserId: 'user-bob',
              sourceLocator: '10.1000/hidden-command-paper',
              sourceType: 'doi',
              storageKey: 'hidden-bob-storage-key.pdf',
              title: 'Hidden Bob Command Paper',
            },
            entry: {
              addedByUserId: 'user-bob',
              scope: { id: bobProject.project.id, type: 'project' },
            },
          });
          const notebookDocument = await notebookRepository.createDocument({
            ownerId: 'user-alice',
            title: 'Command Private Notebook',
          });
          notebookDocumentId = notebookDocument.id;
          await notebookRepository.createDocument({
            ownerId: 'user-bob',
            title: 'Hidden Bob Command Notebook',
          });
          await jobRepository.createProviderCredentialReference({
            credentialRef: 'cred-command-alice',
            provider: 'openrouter',
            secretRef: 'secret-command-alice',
            userId: 'user-alice',
          });
          await jobRepository.createQueuedJobWithAudit({
            audit: {
              action: 'job.created',
              actorUserId: 'user-alice',
              detail: 'Created command job with sensitive audit detail.',
              id: 'audit-command-alice',
              recordedAt: '2026-05-18T00:00:00.000Z',
            },
            event: {
              id: 'job-event-command-alice',
              message: 'Command job queued.',
              recordedAt: '2026-05-18T00:00:00.000Z',
              status: 'queued',
            },
            job: {
              credentialRef: 'cred-command-alice',
              id: 'job-command-alice',
              kind: 'command-index-test',
              payload: JSON.stringify({ secretPayloadShouldNotLeak: true }),
              requestedByUserId: 'user-alice',
              scope: { id: project.project.id, type: 'project' },
              spaceId: createdSpace.id,
            },
          });
        } finally {
          await prisma.$disconnect();
        }

        const response = await fetch(
          `${server.url}/api/command-search?query=Command`,
          { headers: withSessionCookie(aliceCookie) },
        );
        const payload = (await response.json()) as {
          contract: string;
          results: Array<{ id: string; kind: string; route: string; title: string }>;
          totalCount: number;
        };

        expect(response.status).toBe(200);
        expect(payload.contract).toBe(commandSearchContract);
        expect(payload.results.map((result) => result.kind)).toEqual(
          expect.arrayContaining([
            'project',
            'project-doc',
            'library-entry',
            'notebook',
            'job',
          ]),
        );
        expect(payload.results.map((result) => result.title)).toEqual(
          expect.arrayContaining([
            'Command Search Project',
            'Command Shared Synthesis',
            'Command Personal Paper',
            'Command Project Paper',
            'Command Private Notebook',
            'job-command-alice',
          ]),
        );
        expect(payload.results).toContainEqual(
          expect.objectContaining({
            kind: 'project-doc',
            route: `/projects/${project.project.id}/writing/${projectDocId}`,
          }),
        );
        expect(payload.results).toContainEqual(
          expect.objectContaining({
            kind: 'notebook',
            route: `/notebook/${encodeURIComponent(notebookDocumentId)}`,
          }),
        );
        const jobRoute = payload.results.find((result) => result.kind === 'job')?.route;
        expect(jobRoute).toBeTruthy();
        const jobUrl = new URL(jobRoute ?? '', server.url);
        expect(jobUrl.pathname).toBe('/jobs');
        expect(jobUrl.searchParams.get('scopeType')).toBe('project');
        expect(jobUrl.searchParams.get('scopeId')).toBe(project.project.id);
        expect(jobUrl.searchParams.get('jobId')).toBe('job-command-alice');
        expect(jobUrl.searchParams.has('actorUserId')).toBe(false);
        expect(jobUrl.searchParams.has('requestedByUserId')).toBe(false);
        expect(jobUrl.searchParams.has('userId')).toBe(false);
        const serializedPayload = JSON.stringify(payload);
        expect(serializedPayload).not.toContain('Hidden Bob Command');
        expect(serializedPayload).not.toContain('private-storage-key-command.pdf');
        expect(serializedPayload).not.toContain('project-storage-key-command.pdf');
        expect(serializedPayload).not.toContain('secretPayloadShouldNotLeak');
        expect(serializedPayload).not.toContain('Sensitive Project Doc snapshot');
        expect(serializedPayload).not.toContain('sensitive audit detail');

        const projectOnlyResponse = await fetch(
          `${server.url}/api/command-search?projectId=${project.project.id}&query=Command`,
          { headers: withSessionCookie(aliceCookie) },
        );
        const projectOnlyPayload = (await projectOnlyResponse.json()) as {
          results: Array<{ scope: { id: string; type: string }; title: string }>;
        };
        expect(projectOnlyResponse.status).toBe(200);
        expect(projectOnlyPayload.results.every(
          (result) => result.scope.type === 'project' && result.scope.id === project.project.id,
        )).toBe(true);
        expect(JSON.stringify(projectOnlyPayload)).not.toContain('Command Private Notebook');

        const deniedProjectResponse = await fetch(
          `${server.url}/api/command-search?projectId=${bobProject.project.id}&query=Command`,
          { headers: withSessionCookie(aliceCookie) },
        );
        const deniedProjectPayload = (await deniedProjectResponse.json()) as {
          error: string;
        };
        expect(deniedProjectResponse.status).toBe(403);
        expect(deniedProjectPayload.error).toMatch(/access denied/i);

        const bobVisibleResponse = await fetch(
          `${server.url}/api/command-search?query=Command`,
          { headers: withSessionCookie(bobCookie) },
        );
        const bobVisiblePayload = (await bobVisibleResponse.json()) as {
          results: Array<{ title: string }>;
        };
        const bobVisibleTitles = bobVisiblePayload.results.map((result) => result.title);
        const serializedBobVisiblePayload = JSON.stringify(bobVisiblePayload);

        expect(bobVisibleResponse.status).toBe(200);
        expect(bobVisibleTitles).toEqual(
          expect.arrayContaining([
            'Command Search Project',
            'Command Shared Synthesis',
            'Command Project Paper',
            'job-command-alice',
          ]),
        );
        expect(serializedBobVisiblePayload).not.toContain('Command Personal Paper');
        expect(serializedBobVisiblePayload).not.toContain('Command Private Notebook');
        expect(serializedBobVisiblePayload).not.toContain('private-storage-key-command.pdf');
        expect(serializedBobVisiblePayload).not.toContain('Sensitive Project Doc snapshot');
        expect(serializedBobVisiblePayload).not.toContain('secretPayloadShouldNotLeak');
      } finally {
        await server.close();
      }
    } finally {
      rmSync(storageRoot, { force: true, recursive: true });
    }
  });

  it('reports total matching results separately from the returned result cap', async () => {
    const storageRoot = mkdtempSync(join(tmpdir(), 'jixia-command-search-'));

    try {
      const databaseUrl = `file:${join(storageRoot, 'jixia-command-search.db')}`;
      const server = await startTestServer({
        JIXIA_DATABASE_URL: databaseUrl,
        JIXIA_STORAGE_ROOT: storageRoot,
      });

      try {
        const aliceCookie = await loginAs(server.url, 'user-alice');
        const prisma = createPrismaClient({ url: databaseUrl });

        try {
          const notebookRepository = createNotebookRepository(prisma);

          await Promise.all(
            Array.from({ length: 45 }, (_, index) =>
              notebookRepository.createDocument({
                ownerId: 'user-alice',
                title: `Limited Command Notebook ${index.toString().padStart(2, '0')}`,
              }),
            ),
          );
        } finally {
          await prisma.$disconnect();
        }

        const response = await fetch(
          `${server.url}/api/command-search?query=Limited%20Command%20Notebook`,
          { headers: withSessionCookie(aliceCookie) },
        );
        const payload = (await response.json()) as {
          results: Array<{ kind: string; title: string }>;
          totalCount: number;
        };

        expect(response.status).toBe(200);
        expect(payload.results).toHaveLength(40);
        expect(payload.totalCount).toBe(45);
        expect(payload.results.every((result) => result.kind === 'notebook')).toBe(true);
      } finally {
        await server.close();
      }
    } finally {
      rmSync(storageRoot, { force: true, recursive: true });
    }
  });
});
