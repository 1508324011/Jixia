import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { describe, expect, it } from 'vitest';

import { createHttpServer } from '../../src/server/http-server';

function createStorageRoot(): string {
  return mkdtempSync(join(tmpdir(), 'jixia-native-demo-http-'));
}

async function withServer(
  options: {
    prepareStorageRoot?: (storageRoot: string) => void;
  },
  run: (baseUrl: string) => Promise<void>,
): Promise<void> {
  const storageRoot = createStorageRoot();

  options.prepareStorageRoot?.(storageRoot);

  const httpServer = createHttpServer({
    env: {
      JIXIA_DATABASE_URL: `file:${join(storageRoot, 'jixia-demo.db')}`,
      JIXIA_HOST: '127.0.0.1',
      JIXIA_PORT: '3000',
      JIXIA_STORAGE_ROOT: storageRoot,
    },
  });

  await new Promise<void>((resolve, reject) => {
    httpServer.server.once('error', reject);
    httpServer.server.listen(0, '127.0.0.1', () => {
      httpServer.server.off('error', reject);
      resolve();
    });
  });

  const address = httpServer.server.address() as AddressInfo;

  try {
    await run(`http://127.0.0.1:${address.port}`);
  } finally {
    await new Promise<void>((resolve, reject) => {
      httpServer.server.close((error) => {
        if (error) {
          reject(error);
          return;
        }

        resolve();
      });
    });
    rmSync(storageRoot, { force: true, recursive: true });
  }
}

async function startServer(storageRoot: string): Promise<{
  baseUrl: string;
  close: () => Promise<void>;
}> {
  const httpServer = createHttpServer({
    env: {
      JIXIA_DATABASE_URL: `file:${join(storageRoot, 'jixia-demo.db')}`,
      JIXIA_HOST: '127.0.0.1',
      JIXIA_PORT: '3000',
      JIXIA_STORAGE_ROOT: storageRoot,
    },
  });

  await new Promise<void>((resolve, reject) => {
    httpServer.server.once('error', reject);
    httpServer.server.listen(0, '127.0.0.1', () => {
      httpServer.server.off('error', reject);
      resolve();
    });
  });

  const address = httpServer.server.address() as AddressInfo;

  return {
    baseUrl: `http://127.0.0.1:${address.port}`,
    close: () =>
      new Promise<void>((resolve, reject) => {
        httpServer.server.close((error) => {
          if (error) {
            reject(error);
            return;
          }

          resolve();
        });
      }),
  };
}

describe('native demo http surface', () => {
  it('exposes a workbench summary route for home and projects resumption surfaces', async () => {
    await withServer({}, async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/workbench/summary`);

      expect(response.status).toBe(200);

      const result = (await response.json()) as {
        recentProjects: Array<{ projectId: string; title: string }>;
        resumeTargets: Array<{ title: string; to: string }>;
      };

      expect(result.recentProjects).toContainEqual(
        expect.objectContaining({
          projectId: 'tumor-board',
          title: 'Tumor board workspace',
        }),
      );
      expect(result.resumeTargets).toContainEqual(
        expect.objectContaining({
          title: 'Resume notebook',
          to: '/projects/tumor-board/library/entry-1/notes',
        }),
      );
    });
  });

  it('honors explicit caller identity for seeded shared-space writing reads', async () => {
    await withServer({}, async (baseUrl) => {
      const response = await fetch(
        `${baseUrl}/api/writing/shared-space/projects/tumor-board/document?userId=user-alice`,
      );

      expect(response.status).toBe(200);

      const result = (await response.json()) as {
        document: { documentId: string; projectId: string; spaceId: string };
      };

      expect(result.document).toMatchObject({
        documentId: 'doc-1',
        projectId: 'tumor-board',
        spaceId: 'shared-space',
      });
    });
  });

  it('exposes seeded workbench APIs for the feeder-surface reader, ai workspace, notebook, and project-doc walkthrough', async () => {
    await withServer({}, async (baseUrl) => {
      const summaryResponse = await fetch(`${baseUrl}/api/workbench/summary`);

      expect(summaryResponse.status).toBe(200);
      expect(summaryResponse.headers.get('content-type')).toContain('application/json');

      const summaryResult = (await summaryResponse.json()) as {
        recentProjects: Array<{ projectId: string; title: string }>;
        resumeTargets: Array<{ title: string; to: string }>;
      };

      expect(summaryResult.recentProjects).toContainEqual(
        expect.objectContaining({
          projectId: 'tumor-board',
          title: 'Tumor board workspace',
        }),
      );
      expect(summaryResult.resumeTargets).toContainEqual(
        expect.objectContaining({
          title: 'Resume notebook',
          to: '/projects/tumor-board/library/entry-1/notes',
        }),
      );

      const entryId = 'entry-1';
      const readingResponse = await fetch(`${baseUrl}/api/reading/${entryId}`);
      expect(readingResponse.status).toBe(200);

      const readingResult = (await readingResponse.json()) as {
        asset: { abstractText: string; id: string; title: string };
        document: {
          sections: Array<{ body: string; title: string }>;
          title: string;
        };
        retrieval: {
          fullTextAvailable: boolean;
          state: string;
          summary: string;
        };
        workspace: {
          companion?: {
            notebookPath: string;
            projectDocsPath?: string;
            projectPath?: string;
            readerPath: string;
          };
          notebookId: string;
        };
      };
      expect(readingResult.workspace.companion).toEqual(
        expect.objectContaining({
          notebookPath: `/projects/tumor-board/library/${entryId}/notes`,
          projectDocsPath: '/projects/tumor-board/writing/doc-1',
          projectPath: '/projects/tumor-board',
          readerPath: `/projects/tumor-board/library/${entryId}/reader`,
        }),
      );
      expect(readingResult.retrieval).toEqual(
        expect.objectContaining({
          fullTextAvailable: true,
          state: 'document-ready',
          summary: 'Reading document ready',
        }),
      );
      expect(readingResult.document).toEqual(
        expect.objectContaining({
          title: readingResult.asset.title,
          sections: expect.arrayContaining([
            expect.objectContaining({
              title: 'Overview',
              body: expect.stringContaining(readingResult.asset.abstractText),
            }),
          ]),
        }),
      );

      const aiWorkspaceResponse = await fetch(`${baseUrl}/api/ai/workspace?entryId=${entryId}`);
      expect(aiWorkspaceResponse.status).toBe(200);

      const aiWorkspaceResult = (await aiWorkspaceResponse.json()) as {
        workspace: {
          activeSessionId: string | null;
          sessions: Array<{
            attachedEntries: Array<{ canonicalId: string; entryId: string; title: string }>;
            title: string;
          }>;
        };
      };
      expect(aiWorkspaceResult.workspace.activeSessionId).toBeTruthy();
      expect(aiWorkspaceResult.workspace.sessions).toContainEqual(
        expect.objectContaining({
          attachedEntries: expect.arrayContaining([
            expect.objectContaining({
              entryId,
            }),
          ]),
        }),
      );

      const notebookSummaryResponse = await fetch(
        `${baseUrl}/api/notebooks/${readingResult.workspace.notebookId}`,
      );
      expect(notebookSummaryResponse.status).toBe(200);

      const notebookSummaryResult = (await notebookSummaryResponse.json()) as {
        notebook: { notebookId: string; title: string };
      };
      expect(notebookSummaryResult.notebook).toEqual(
        expect.objectContaining({ notebookId: readingResult.workspace.notebookId }),
      );

      const notebookDocumentResponse = await fetch(
        `${baseUrl}/api/notebooks/${readingResult.workspace.notebookId}/document`,
      );
      expect(notebookDocumentResponse.status).toBe(200);

      const notebookDocumentResult = (await notebookDocumentResponse.json()) as {
        document: {
          latestSnapshot: null | { content: string };
          ownerType: string;
          visibility: string;
        };
      };
      expect(notebookDocumentResult.document).toEqual(
        expect.objectContaining({
          latestSnapshot: null,
          ownerType: 'user',
          visibility: 'private',
        }),
      );

      const saveNotebookDocumentResponse = await fetch(
        `${baseUrl}/api/notebooks/${readingResult.workspace.notebookId}/document`,
        {
          body: JSON.stringify({
            content: 'Private notebook body about key mutation and next experiments.',
            title: 'Tumor board notebook',
          }),
          headers: {
            'Content-Type': 'application/json',
          },
          method: 'POST',
        },
      );
      expect(saveNotebookDocumentResponse.status).toBe(200);

      const savedNotebookDocumentResult = (await saveNotebookDocumentResponse.json()) as {
        document: { latestSnapshot: null | { content: string } };
      };
      expect(savedNotebookDocumentResult.document.latestSnapshot?.content).toBe(
        'Private notebook body about key mutation and next experiments.',
      );

      const noteResponse = await fetch(`${baseUrl}/api/reading/${entryId}/notes`, {
        body: JSON.stringify({
          body: 'Private notebook body about key mutation and next experiments.',
          visibility: 'private',
        }),
        headers: {
          'Content-Type': 'application/json',
        },
        method: 'POST',
      });
      expect(noteResponse.status).toBe(201);

      const noteResult = (await noteResponse.json()) as {
        note: { id: string };
      };

      const insightResponse = await fetch(`${baseUrl}/api/reading/${entryId}/insights`, {
        body: JSON.stringify({
          evidenceSpans: [
            {
              endOffset: 24,
              quote: 'Key mutation evidence',
              startOffset: 0,
            },
          ],
          summary: 'Evidence-backed summary for board prep.',
          title: 'Tumor board summary',
        }),
        headers: {
          'Content-Type': 'application/json',
        },
        method: 'POST',
      });
      expect(insightResponse.status).toBe(201);

      const refreshedReadingResponse = await fetch(`${baseUrl}/api/reading/${entryId}`);
      expect(refreshedReadingResponse.status).toBe(200);

      const refreshedReadingResult = (await refreshedReadingResponse.json()) as {
        insights: Array<{ summary: string }>;
        notes: Array<{ body: string }>;
      };
      expect(refreshedReadingResult.notes).toContainEqual(
        expect.objectContaining({ body: 'Private notebook body about key mutation and next experiments.' }),
      );
      expect(refreshedReadingResult.insights).toContainEqual(
        expect.objectContaining({ summary: 'Evidence-backed summary for board prep.' }),
      );

      const writingResponse = await fetch(`${baseUrl}/api/writing/shared-space/projects/tumor-board/document`);
      expect(writingResponse.status).toBe(200);

      const writingResult = (await writingResponse.json()) as {
        document: { documentId: string };
      };
      expect(writingResult.document.documentId).toBeTruthy();

      const projectReferenceResponse = await fetch(
        `${baseUrl}/api/projects/tumor-board/docs/${writingResult.document.documentId}/references`,
        {
          body: JSON.stringify({
            noteId: noteResult.note.id,
            notebookId: readingResult.workspace.notebookId,
            paperAssetId: readingResult.asset.id,
            selectedText: 'Key mutation excerpt',
            spaceId: 'shared-space',
            sourceType: 'notebook-note',
          }),
          headers: {
            'Content-Type': 'application/json',
          },
          method: 'POST',
        },
      );
      expect(projectReferenceResponse.status).toBe(201);

      const projectReferenceResult = (await projectReferenceResponse.json()) as {
        reference: {
          documentId: string;
          ownerType: string;
          selectedText: string;
          sourceKind: string;
        };
      };
      expect(projectReferenceResult.reference).toEqual(
        expect.objectContaining({
          documentId: writingResult.document.documentId,
          ownerType: 'project',
          selectedText: 'Key mutation excerpt',
          sourceKind: 'projection',
        }),
      );

      const saveDocumentResponse = await fetch(
        `${baseUrl}/api/writing/shared-space/projects/tumor-board/document`,
        {
          body: JSON.stringify({
            content: 'Tumor board synthesis',
            title: 'Tumor board synthesis',
          }),
          headers: {
            'Content-Type': 'application/json',
          },
          method: 'POST',
        },
      );
      expect(saveDocumentResponse.status).toBe(200);

      const refreshedWritingResponse = await fetch(`${baseUrl}/api/writing/shared-space/projects/tumor-board/document`);
      expect(refreshedWritingResponse.status).toBe(200);

      const refreshedWritingResult = (await refreshedWritingResponse.json()) as {
        document: {
          documentId: string;
          latestSnapshot: null | { content: string };
          publishState: string;
          references: Array<{ selectedText: string }>;
        };
      };
      expect(refreshedWritingResult.document.latestSnapshot?.content).toBe('Tumor board synthesis');
      expect(refreshedWritingResult.document.references).toContainEqual(
        expect.objectContaining({ selectedText: 'Key mutation excerpt' }),
      );
      expect(JSON.stringify(refreshedWritingResult.document.references)).not.toContain(
        'Private notebook body about key mutation and next experiments.',
      );

      const publishResponse = await fetch(
        `${baseUrl}/api/writing/${refreshedWritingResult.document.documentId}/publish`,
        {
          body: JSON.stringify({ publishState: 'published' }),
          headers: {
            'Content-Type': 'application/json',
          },
          method: 'POST',
        },
      );
      expect(publishResponse.status).toBe(200);

      const publishedWritingResponse = await fetch(`${baseUrl}/api/writing/shared-space/projects/tumor-board/document`);
      expect(publishedWritingResponse.status).toBe(200);

      const publishedWritingResult = (await publishedWritingResponse.json()) as {
        document: { publishState: string };
      };
      expect(publishedWritingResult.document.publishState).toBe('published');

      const initialGovernedSummaryResponse = await fetch(`${baseUrl}/api/spaces/shared-space/governed-summary`);
      expect(initialGovernedSummaryResponse.status).toBe(200);

      const initialGovernedSummaryResult = (await initialGovernedSummaryResponse.json()) as {
        governedJob: null | { job: { status: string } };
      };
      expect(initialGovernedSummaryResult.governedJob).toBeNull();

      const governedSummaryResponse = await fetch(`${baseUrl}/api/spaces/shared-space/governed-summary`, {
        method: 'POST',
      });
      expect(governedSummaryResponse.status).toBe(200);

      const governedSummaryResult = (await governedSummaryResponse.json()) as {
        governedJob: {
          audits: Array<{ action: string }>;
          events: Array<{ status: string }>;
          job: { status: string };
        };
      };
      expect(governedSummaryResult.governedJob.job.status).toBe('succeeded');
      expect(governedSummaryResult.governedJob.events.map((event) => event.status)).toEqual(
        expect.arrayContaining(['queued', 'running', 'succeeded']),
      );
      expect(governedSummaryResult.governedJob.audits.map((audit) => audit.action)).toEqual(
        expect.arrayContaining(['job.created', 'job.completed']),
      );
    });
  });

  it('lists only spaces accessible to the seeded demo operator', async () => {
    await withServer(
      {
        prepareStorageRoot(storageRoot) {
          writeFileSync(
            join(storageRoot, 'server-state.json'),
            JSON.stringify(
              {
                memberships: [],
                nextSequence: 1,
                spaces: [
                  {
                    createdAt: '2026-03-22T00:00:00.000Z',
                    id: 'private-space',
                    kind: 'shared',
                    name: 'Private Space',
                    ownerUserId: 'other-user',
                  },
                ],
              },
              null,
              2,
            ),
          );
        },
      },
      async (baseUrl) => {
        const response = await fetch(`${baseUrl}/api/spaces`);
        expect(response.status).toBe(200);

        const result = (await response.json()) as {
          spaces: Array<{ name: string; spaceId: string }>;
        };

        expect(result.spaces).toContainEqual(
          expect.objectContaining({
            name: 'Shared Space',
            spaceId: 'shared-space',
          }),
        );
        expect(result.spaces).not.toContainEqual(
          expect.objectContaining({
            name: 'Private Space',
            spaceId: 'private-space',
          }),
        );
      },
    );
  });

  it('creates a personal space and keeps it visible after restart', async () => {
    const storageRoot = createStorageRoot();

    let createdSpaceId = '';

    try {
      const firstServer = await startServer(storageRoot);

      try {
        const createResponse = await fetch(`${firstServer.baseUrl}/api/spaces`, {
          body: JSON.stringify({
            kind: 'personal',
            name: 'Genomics Sandbox',
          }),
          headers: {
            'Content-Type': 'application/json',
          },
          method: 'POST',
        });

        expect(createResponse.status).toBe(201);

        const createResult = (await createResponse.json()) as {
          space: {
            kind: 'personal' | 'shared';
            name: string;
            projectId: string;
            spaceId: string;
          };
        };

        createdSpaceId = createResult.space.spaceId;
        expect(createResult.space).toEqual(
          expect.objectContaining({
            kind: 'personal',
            name: 'Genomics Sandbox',
            projectId: 'tumor-board',
          }),
        );

        const listedSpacesResponse = await fetch(`${firstServer.baseUrl}/api/spaces`);
        expect(listedSpacesResponse.status).toBe(200);

        const listedSpacesResult = (await listedSpacesResponse.json()) as {
          spaces: Array<{ name: string; spaceId: string }>;
        };

        expect(listedSpacesResult.spaces).toContainEqual(
          expect.objectContaining({
            name: 'Genomics Sandbox',
            spaceId: createdSpaceId,
          }),
        );
      } finally {
        await firstServer.close();
      }

      const restartedServer = await startServer(storageRoot);

      try {
        const reopenedSpacesResponse = await fetch(`${restartedServer.baseUrl}/api/spaces`);
        expect(reopenedSpacesResponse.status).toBe(200);

        const reopenedSpacesResult = (await reopenedSpacesResponse.json()) as {
          spaces: Array<{ name: string; spaceId: string }>;
        };

        expect(reopenedSpacesResult.spaces).toContainEqual(
          expect.objectContaining({
            name: 'Genomics Sandbox',
            spaceId: createdSpaceId,
          }),
        );
      } finally {
        await restartedServer.close();
      }
    } finally {
      rmSync(storageRoot, { force: true, recursive: true });
    }
  });

  it('imports multiple papers into a created space and reopens one entry after restart', async () => {
    const storageRoot = createStorageRoot();

    let createdSpaceId = '';
    let importedEntryId = '';

    try {
      const firstServer = await startServer(storageRoot);

      try {
        const createResponse = await fetch(`${firstServer.baseUrl}/api/spaces`, {
          body: JSON.stringify({
            kind: 'personal',
            name: 'Genomics Sandbox',
          }),
          headers: {
            'Content-Type': 'application/json',
          },
          method: 'POST',
        });
        expect(createResponse.status).toBe(201);

        const createResult = (await createResponse.json()) as {
          space: { spaceId: string };
        };
        createdSpaceId = createResult.space.spaceId;

        for (const sourceLocator of ['654321', '789012']) {
          const importResponse = await fetch(
            `${firstServer.baseUrl}/api/spaces/${createdSpaceId}/import`,
            {
              body: JSON.stringify({
                sourceLocator,
                sourceType: 'pmid',
              }),
              headers: {
                'Content-Type': 'application/json',
              },
              method: 'POST',
            },
          );

          expect(importResponse.status).toBe(201);
        }

        const libraryResponse = await fetch(
          `${firstServer.baseUrl}/api/spaces/${createdSpaceId}/projects/tumor-board/library`,
        );
        expect(libraryResponse.status).toBe(200);

        const libraryResult = (await libraryResponse.json()) as {
          entries: Array<{ entryId: string; title: string }>;
        };

        expect(libraryResult.entries).toEqual(
          expect.arrayContaining([
            expect.objectContaining({ title: 'Imported PMID paper 654321' }),
            expect.objectContaining({ title: 'Imported PMID paper 789012' }),
          ]),
        );

        importedEntryId =
          libraryResult.entries.find((entry) => entry.title === 'Imported PMID paper 789012')
            ?.entryId ?? '';
        expect(importedEntryId).toBeTruthy();

        const entryResponse = await fetch(
          `${firstServer.baseUrl}/api/library/${importedEntryId}?spaceId=${createdSpaceId}`,
        );
        expect(entryResponse.status).toBe(200);

        const entryResult = (await entryResponse.json()) as {
          asset: { title: string };
          entry: { spaceId: string };
        };
        expect(entryResult.asset.title).toBe('Imported PMID paper 789012');
        expect(entryResult.entry.spaceId).toBe(createdSpaceId);

        const readingResponse = await fetch(
          `${firstServer.baseUrl}/api/reading/${importedEntryId}?spaceId=${createdSpaceId}`,
        );
        expect(readingResponse.status).toBe(200);

        const readingResult = (await readingResponse.json()) as {
          asset: { canonicalId: string; title: string };
          entry: { spaceId: string };
        };
        expect(readingResult.asset.title).toBe('Imported PMID paper 789012');
        expect(readingResult.asset.canonicalId).toBe('pmid:789012');
        expect(readingResult.entry.spaceId).toBe(createdSpaceId);
      } finally {
        await firstServer.close();
      }

      const restartedServer = await startServer(storageRoot);

      try {
        const reopenedLibraryResponse = await fetch(
          `${restartedServer.baseUrl}/api/spaces/${createdSpaceId}/projects/tumor-board/library`,
        );
        expect(reopenedLibraryResponse.status).toBe(200);

        const reopenedLibraryResult = (await reopenedLibraryResponse.json()) as {
          entries: Array<{ entryId: string; title: string }>;
        };
        expect(reopenedLibraryResult.entries).toEqual(
          expect.arrayContaining([
            expect.objectContaining({ title: 'Imported PMID paper 654321' }),
            expect.objectContaining({
              entryId: importedEntryId,
              title: 'Imported PMID paper 789012',
            }),
          ]),
        );

        const reopenedReadingResponse = await fetch(
          `${restartedServer.baseUrl}/api/reading/${importedEntryId}?spaceId=${createdSpaceId}`,
        );
        expect(reopenedReadingResponse.status).toBe(200);

        const reopenedReadingResult = (await reopenedReadingResponse.json()) as {
          asset: { title: string };
          entry: { spaceId: string };
        };
        expect(reopenedReadingResult.asset.title).toBe('Imported PMID paper 789012');
        expect(reopenedReadingResult.entry.spaceId).toBe(createdSpaceId);
      } finally {
        await restartedServer.close();
      }
    } finally {
      rmSync(storageRoot, { force: true, recursive: true });
    }
  });

  it('saves, publishes, and reopens a created-space writing document after restart', async () => {
    const storageRoot = createStorageRoot();

    let createdSpaceId = '';
    let createdDocumentId = '';

    try {
      const firstServer = await startServer(storageRoot);

      try {
        const createResponse = await fetch(`${firstServer.baseUrl}/api/spaces`, {
          body: JSON.stringify({
            kind: 'personal',
            name: 'Writing Sandbox',
          }),
          headers: {
            'Content-Type': 'application/json',
          },
          method: 'POST',
        });
        expect(createResponse.status).toBe(201);

        const createResult = (await createResponse.json()) as {
          space: { spaceId: string };
        };
        createdSpaceId = createResult.space.spaceId;

        const initialWritingResponse = await fetch(
          `${firstServer.baseUrl}/api/writing/${createdSpaceId}/projects/tumor-board/document`,
        );
        expect(initialWritingResponse.status).toBe(404);

        const saveResponse = await fetch(
          `${firstServer.baseUrl}/api/writing/${createdSpaceId}/projects/tumor-board/document`,
          {
            body: JSON.stringify({
              content: 'Created-space writing synthesis',
              title: 'Created-space writing synthesis',
            }),
            headers: {
              'Content-Type': 'application/json',
            },
            method: 'POST',
          },
        );
        expect(saveResponse.status).toBe(200);

        const saveResult = (await saveResponse.json()) as {
          document: {
            documentId: string;
            latestSnapshot: null | { content: string };
            publishState: string;
            spaceId: string;
          };
        };
        createdDocumentId = saveResult.document.documentId;
        expect(createdDocumentId).toBeTruthy();
        expect(saveResult.document.spaceId).toBe(createdSpaceId);
        expect(saveResult.document.latestSnapshot?.content).toBe(
          'Created-space writing synthesis',
        );
        expect(saveResult.document.publishState).toBe('draft');

        const reloadResponse = await fetch(
          `${firstServer.baseUrl}/api/writing/${createdSpaceId}/projects/tumor-board/document`,
        );
        expect(reloadResponse.status).toBe(200);

        const reloadResult = (await reloadResponse.json()) as {
          document: {
            documentId: string;
            latestSnapshot: null | { content: string };
            publishState: string;
          };
        };
        expect(reloadResult.document.documentId).toBe(createdDocumentId);
        expect(reloadResult.document.latestSnapshot?.content).toBe(
          'Created-space writing synthesis',
        );

        const publishResponse = await fetch(
          `${firstServer.baseUrl}/api/writing/${createdDocumentId}/publish?spaceId=${createdSpaceId}`,
          {
            body: JSON.stringify({ publishState: 'published' }),
            headers: {
              'Content-Type': 'application/json',
            },
            method: 'POST',
          },
        );
        expect(publishResponse.status).toBe(200);

        const publishResult = (await publishResponse.json()) as {
          document: {
            documentId: string;
            publishState: string;
            spaceId: string;
          };
        };
        expect(publishResult.document.documentId).toBe(createdDocumentId);
        expect(publishResult.document.publishState).toBe('published');
        expect(publishResult.document.spaceId).toBe(createdSpaceId);
      } finally {
        await firstServer.close();
      }

      const restartedServer = await startServer(storageRoot);

      try {
        const reopenedWritingResponse = await fetch(
          `${restartedServer.baseUrl}/api/writing/${createdSpaceId}/projects/tumor-board/document`,
        );
        expect(reopenedWritingResponse.status).toBe(200);

        const reopenedWritingResult = (await reopenedWritingResponse.json()) as {
          document: {
            documentId: string;
            latestSnapshot: null | { content: string };
            publishState: string;
            spaceId: string;
          };
        };
        expect(reopenedWritingResult.document.documentId).toBe(createdDocumentId);
        expect(reopenedWritingResult.document.latestSnapshot?.content).toBe(
          'Created-space writing synthesis',
        );
        expect(reopenedWritingResult.document.publishState).toBe('published');
        expect(reopenedWritingResult.document.spaceId).toBe(createdSpaceId);
      } finally {
        await restartedServer.close();
      }
    } finally {
      rmSync(storageRoot, { force: true, recursive: true });
    }
  });
});
