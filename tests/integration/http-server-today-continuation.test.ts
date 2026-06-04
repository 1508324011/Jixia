import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { describe, expect, it } from 'vitest';

import {
  createLibraryRepository,
  createPrismaClient,
  createReadingRepository,
} from '../../src/db';
import type { TodayContinuationResponse } from '../../src/shared/contracts/today-continuation';

import {
  createHttpTestPubmedConnector,
  loginAs,
  startTestServer,
  withSessionCookie,
} from './http-session-test-helpers';

async function readJson<T>(response: Response): Promise<T> {
  return (await response.json()) as T;
}

describe('http server Today continuation API', () => {
  it('builds an actor-scoped browser-safe continuation read model', async () => {
    const storageRoot = mkdtempSync(join(tmpdir(), 'jixia-http-today-continuation-'));

    try {
      const databaseUrl = `file:${join(storageRoot, 'jixia-http-today-continuation.db')}`;
      const server = await startTestServer(
        {
          JIXIA_DATABASE_URL: databaseUrl,
          JIXIA_STORAGE_ROOT: storageRoot,
        },
        { connectors: { pubmed: createHttpTestPubmedConnector() } },
      );

      try {
        const aliceCookie = await loginAs(server.url, 'user-alice');
        const bobCookie = await loginAs(server.url, 'user-bob');

        const visibleSpace = await fetch(`${server.url}/api/spaces`, {
          body: JSON.stringify({ kind: 'shared', name: 'Today Continuation Visible Space' }),
          headers: withSessionCookie(aliceCookie, {
            'Content-Type': 'application/json',
          }),
          method: 'POST',
        }).then((response) => readJson<{ id: string }>(response));
        const visibleProject = await fetch(`${server.url}/api/projects`, {
          body: JSON.stringify({
            name: 'Today Continuation Project',
            spaceId: visibleSpace.id,
          }),
          headers: withSessionCookie(aliceCookie, {
            'Content-Type': 'application/json',
          }),
          method: 'POST',
        }).then(
          (response) =>
            readJson<{ project: { id: string; name: string; spaceId: string } }>(
              response,
            ),
        );
        const hiddenSpace = await fetch(`${server.url}/api/spaces`, {
          body: JSON.stringify({ kind: 'shared', name: 'Hidden Bob Continuation Space' }),
          headers: withSessionCookie(bobCookie, {
            'Content-Type': 'application/json',
          }),
          method: 'POST',
        }).then((response) => readJson<{ id: string }>(response));
        const hiddenProject = await fetch(`${server.url}/api/projects`, {
          body: JSON.stringify({
            name: 'Hidden Bob Continuation Project',
            spaceId: hiddenSpace.id,
          }),
          headers: withSessionCookie(bobCookie, {
            'Content-Type': 'application/json',
          }),
          method: 'POST',
        }).then(
          (response) =>
            readJson<{ project: { id: string; name: string; spaceId: string } }>(
              response,
            ),
        );

        const partialImport = await fetch(`${server.url}/api/library/personal/import`, {
          body: JSON.stringify({
            sourceLocator: '111111',
            sourceType: 'pmid',
          }),
          headers: withSessionCookie(aliceCookie, {
            'Content-Type': 'application/json',
          }),
          method: 'POST',
        }).then(
          (response) =>
            readJson<{
              asset: { canonicalId: string; title: string };
              entry: { id: string };
            }>(response),
        );
        const unreadImport = await fetch(`${server.url}/api/library/personal/import`, {
          body: JSON.stringify({
            sourceLocator: '222222',
            sourceType: 'pmid',
          }),
          headers: withSessionCookie(aliceCookie, {
            'Content-Type': 'application/json',
          }),
          method: 'POST',
        }).then(
          (response) =>
            readJson<{
              asset: { canonicalId: string; title: string };
              entry: { id: string };
            }>(response),
        );
        await fetch(`${server.url}/api/library/personal/import`, {
          body: JSON.stringify({
            sourceLocator: '333333',
            sourceType: 'pmid',
          }),
          headers: withSessionCookie(bobCookie, {
            'Content-Type': 'application/json',
          }),
          method: 'POST',
        });

        const visibleReviewDoc = await fetch(`${server.url}/api/project-docs`, {
          body: JSON.stringify({
            projectId: visibleProject.project.id,
            publishState: 'review',
            title: 'Visible Project Review Draft',
          }),
          headers: withSessionCookie(aliceCookie, {
            'Content-Type': 'application/json',
          }),
          method: 'POST',
        }).then((response) => readJson<{ id: string; title: string }>(response));
        await fetch(`${server.url}/api/project-docs`, {
          body: JSON.stringify({
            projectId: hiddenProject.project.id,
            publishState: 'review',
            title: 'Hidden Bob Review Draft',
          }),
          headers: withSessionCookie(bobCookie, {
            'Content-Type': 'application/json',
          }),
          method: 'POST',
        });

        const aliceCredential = await fetch(`${server.url}/api/credentials`, {
          body: JSON.stringify({
            provider: 'openrouter',
            rawSecret: 'today-continuation-alice-secret',
          }),
          headers: withSessionCookie(aliceCookie, {
            'Content-Type': 'application/json',
          }),
          method: 'POST',
        }).then((response) => readJson<{ credentialRef: string }>(response));
        const personalJob = await fetch(`${server.url}/api/jobs`, {
          body: JSON.stringify({
            credentialRef: aliceCredential.credentialRef,
            kind: 'today.personal.summary',
            payload: { instruction: 'summarize personal continuation' },
            scope: { id: 'user-alice', type: 'user' },
            spaceId: visibleSpace.id,
          }),
          headers: withSessionCookie(aliceCookie, {
            'Content-Type': 'application/json',
          }),
          method: 'POST',
        }).then((response) => readJson<{ id: string; status: string }>(response));
        const projectJob = await fetch(`${server.url}/api/jobs`, {
          body: JSON.stringify({
            credentialRef: aliceCredential.credentialRef,
            kind: 'today.project.summary',
            payload: { instruction: 'summarize project continuation' },
            scope: { id: visibleProject.project.id, type: 'project' },
            spaceId: visibleProject.project.spaceId,
          }),
          headers: withSessionCookie(aliceCookie, {
            'Content-Type': 'application/json',
          }),
          method: 'POST',
        }).then((response) => readJson<{ id: string; status: string }>(response));

        const notebook = await fetch(`${server.url}/api/notebooks`, {
          body: JSON.stringify({ title: 'Alice Private Continuation Notebook' }),
          headers: withSessionCookie(aliceCookie, {
            'Content-Type': 'application/json',
          }),
          method: 'POST',
        }).then((response) => readJson<{ id: string; title: string }>(response));
        await fetch(`${server.url}/api/notebooks`, {
          body: JSON.stringify({ title: 'Hidden Bob Private Notebook' }),
          headers: withSessionCookie(bobCookie, {
            'Content-Type': 'application/json',
          }),
          method: 'POST',
        });

        const prisma = createPrismaClient({ url: databaseUrl });
        try {
          const readingRepository = createReadingRepository(prisma);
          const libraryRepository = createLibraryRepository(prisma);
          await readingRepository.touchReadingState({
            lastReadAt: '2026-06-04T08:30:00.000Z',
            libraryEntryId: partialImport.entry.id,
            progressPercent: 64,
            userId: 'user-alice',
          });
          await libraryRepository.importScopedEntry({
            asset: {
              canonicalId: 'doi:10.1000/today-sensitive-storage',
              checksum: 'today-sensitive-checksum-value',
              importedByUserId: 'user-alice',
              sourceLocator: '10.1000/today-sensitive-storage',
              sourceType: 'doi',
              storageKey: 'papers/today-sensitive-storage.pdf',
              title: 'Storage-backed paper with safe continuation projection',
            },
            entry: {
              addedByUserId: 'user-alice',
              scope: { id: 'user-alice', type: 'user' },
            },
          });
        } finally {
          await prisma.$disconnect();
        }

        const response = await fetch(`${server.url}/api/today/continuation`, {
          headers: withSessionCookie(aliceCookie),
        });
        const continuation = await readJson<TodayContinuationResponse>(response);

        expect(response.status).toBe(200);
        expect(continuation).toMatchObject({
          contract: 'jixia.today.continuation.v1',
          summary: {
            aiJobsNeedingAction: 2,
            inProgressReadings: 1,
            notebookDrafts: 1,
          },
        });
        expect(continuation.emptyState.title).toBe('No continuation items for today');
        expect(continuation.sections.map((section) => section.kind)).toEqual([
          'in_progress_reading',
          'new_imports',
          'notebook_drafts',
          'project_review',
          'ai_jobs',
        ]);

        const inProgressSection = continuation.sections.find(
          (section) => section.kind === 'in_progress_reading',
        );
        const unreadImportSection = continuation.sections.find(
          (section) => section.kind === 'new_imports',
        );
        const notebookSection = continuation.sections.find(
          (section) => section.kind === 'notebook_drafts',
        );
        const projectReviewSection = continuation.sections.find(
          (section) => section.kind === 'project_review',
        );
        const aiJobsSection = continuation.sections.find(
          (section) => section.kind === 'ai_jobs',
        );

        expect(inProgressSection?.items).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              href: `/library/${partialImport.entry.id}/reader`,
              id: `reader:${partialImport.entry.id}`,
              priority: 'high',
              title: partialImport.asset.title,
            }),
          ]),
        );
        expect(unreadImportSection?.items).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              href: `/library/${unreadImport.entry.id}/reader`,
              id: `import:${unreadImport.entry.id}`,
              title: unreadImport.asset.title,
            }),
          ]),
        );
        expect(notebookSection?.items).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              href: `/notebook/${notebook.id}`,
              title: 'Alice Private Continuation Notebook',
            }),
          ]),
        );
        expect(projectReviewSection?.items).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              href: `/projects/${visibleProject.project.id}/writing/${visibleReviewDoc.id}`,
              kind: 'project_review',
              title: 'Visible Project Review Draft',
            }),
          ]),
        );
        expect(aiJobsSection?.items).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              href: `/jobs?jobId=${personalJob.id}`,
              title: 'today.personal.summary',
            }),
            expect.objectContaining({
              href: `/jobs?scopeType=project&scopeId=${visibleProject.project.id}&jobId=${projectJob.id}`,
              title: 'today.project.summary',
            }),
          ]),
        );
        expect(continuation.nextActions.length).toBeGreaterThan(0);
        expect(continuation.nextActions[0]).toEqual(
          expect.objectContaining({
            href: expect.any(String),
            source: expect.stringMatching(/reader|library|notebook|project|ai_job/),
          }),
        );

        const serializedContinuation = JSON.stringify(continuation);
        expect(serializedContinuation).toContain('Storage-backed paper with safe continuation projection');
        expect(serializedContinuation).not.toContain('Hidden Bob');
        expect(serializedContinuation).not.toContain(hiddenProject.project.id);
        expect(serializedContinuation).not.toContain('today-continuation-alice-secret');
        expect(serializedContinuation).not.toContain(aliceCredential.credentialRef);
        for (const forbidden of [
          'actorUserId',
          'apiKey',
          'actorSpaceId',
          'authorUserId',
          'checksum',
          'createdByUserId',
          'credentialRef',
          'encryptedSecret',
          'ownerId',
          'payload',
          'projectId',
          'rawSecret',
          'requestedByUserId',
          'scope',
          'scopeId',
          'scopeType',
          'spaceId',
          'startedByUserId',
          'storageKey',
          'visibility',
        ]) {
          expect(serializedContinuation).not.toContain(`"${forbidden}"`);
        }
        expect(serializedContinuation).not.toContain('JIXIA_STORAGE_ROOT');
        expect(serializedContinuation).not.toContain('papers/');
        expect(serializedContinuation).not.toContain('today-sensitive-checksum-value');
      } finally {
        await server.close();
      }
    } finally {
      rmSync(storageRoot, { force: true, recursive: true });
    }
  }, 30_000);

  it('returns deterministic empty state for a valid actor with no continuation facts', async () => {
    const storageRoot = mkdtempSync(join(tmpdir(), 'jixia-http-today-continuation-empty-'));

    try {
      const server = await startTestServer({
        JIXIA_DATABASE_URL: `file:${join(storageRoot, 'jixia-http-today-continuation-empty.db')}`,
        JIXIA_STORAGE_ROOT: storageRoot,
      });

      try {
        const charlieCookie = await loginAs(server.url, 'user-charlie');
        const response = await fetch(`${server.url}/api/today/continuation`, {
          headers: withSessionCookie(charlieCookie),
        });
        const continuation = await readJson<TodayContinuationResponse>(response);

        expect(response.status).toBe(200);
        expect(continuation.contract).toBe('jixia.today.continuation.v1');
        expect(continuation.summary).toEqual({
          aiJobsNeedingAction: 0,
          inProgressReadings: 0,
          notebookDrafts: 0,
          projectReviewItems: 0,
          unreadImports: 0,
        });
        expect(continuation.nextActions).toEqual([]);
        expect(continuation.emptyState).toEqual({
          body: expect.stringContaining('No personal reading'),
          href: '/search',
          title: 'No continuation items for today',
        });
        expect(continuation.sections.every((section) => section.totalCount === 0)).toBe(true);
      } finally {
        await server.close();
      }
    } finally {
      rmSync(storageRoot, { force: true, recursive: true });
    }
  });

  it('rejects missing sessions and legacy actor or context query fields', async () => {
    const storageRoot = mkdtempSync(join(tmpdir(), 'jixia-http-today-continuation-boundary-'));

    try {
      const server = await startTestServer({
        JIXIA_DATABASE_URL: `file:${join(storageRoot, 'jixia-http-today-continuation-boundary.db')}`,
        JIXIA_STORAGE_ROOT: storageRoot,
      });

      try {
        const missingSessionResponse = await fetch(`${server.url}/api/today/continuation`);
        const missingSessionPayload = await readJson<{ error: string }>(missingSessionResponse);
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
          'ownerId',
          'createdByUserId',
          'scope',
          'scopeId',
          'scopeType',
          'spaceId',
          'projectId',
          'visibility',
        ];

        for (const fieldName of rejectedFields) {
          const matchingResponse = await fetch(
            `${server.url}/api/today/continuation?${fieldName}=user-alice`,
            { headers: withSessionCookie(aliceCookie) },
          );
          const matchingPayload = await readJson<{ error: string }>(matchingResponse);

          expect(matchingResponse.status).toBe(400);
          expect(matchingPayload.error).toMatch(/not accepted for protected routes/i);
        }

        const mismatchedResponse = await fetch(
          `${server.url}/api/today/continuation?actorUserId=user-bob`,
          { headers: withSessionCookie(aliceCookie) },
        );
        const mismatchedPayload = await readJson<{ error: string }>(mismatchedResponse);
        expect(mismatchedResponse.status).toBe(400);
        expect(mismatchedPayload.error).toMatch(/does not match the server-derived actor/i);
      } finally {
        await server.close();
      }
    } finally {
      rmSync(storageRoot, { force: true, recursive: true });
    }
  });
});
