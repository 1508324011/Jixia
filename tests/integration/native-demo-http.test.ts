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

describe('native demo http surface', () => {
  it('exposes a browser-callable walkthrough route', async () => {
    await withServer({}, async (baseUrl) => {
      const response = await fetch(`${baseUrl}/api/spaces`);

      expect(response.status).toBe(200);
      expect(response.headers.get('content-type')).toContain('application/json');

      const result = (await response.json()) as {
        spaces: Array<{
          importLocator: string;
          projectId: string;
          spaceId: string;
        }>;
      };

      expect(result.spaces).toContainEqual(
        expect.objectContaining({
          importLocator: 'pmid:123456',
          projectId: 'tumor-board',
          spaceId: 'shared-space',
        }),
      );

      const importResponse = await fetch(`${baseUrl}/api/spaces/shared-space/import`, {
        body: JSON.stringify({
          sourceLocator: '654321',
          sourceType: 'pmid',
        }),
        headers: {
          'Content-Type': 'application/json',
        },
        method: 'POST',
      });
      expect(importResponse.status).toBe(201);

      const libraryResponse = await fetch(
        `${baseUrl}/api/spaces/shared-space/projects/tumor-board/library`,
      );
      expect(libraryResponse.status).toBe(200);

      const libraryResult = (await libraryResponse.json()) as {
        entries: Array<{ entryId: string; title: string }>;
      };
      expect(libraryResult.entries[0]?.entryId).toBeTruthy();
      expect(libraryResult.entries).toContainEqual(
        expect.objectContaining({ title: 'Imported PMID paper 654321' }),
      );

      const entryId = libraryResult.entries[0]?.entryId;
      const entryResponse = await fetch(`${baseUrl}/api/library/${entryId}`);
      expect(entryResponse.status).toBe(200);

      const readingResponse = await fetch(`${baseUrl}/api/reading/${entryId}`);
      expect(readingResponse.status).toBe(200);

      const noteResponse = await fetch(`${baseUrl}/api/reading/${entryId}/notes`, {
        body: JSON.stringify({
          body: 'Key mutation note',
          visibility: 'space_shared',
        }),
        headers: {
          'Content-Type': 'application/json',
        },
        method: 'POST',
      });
      expect(noteResponse.status).toBe(201);

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
        expect.objectContaining({ body: 'Key mutation note' }),
      );
      expect(refreshedReadingResult.insights).toContainEqual(
        expect.objectContaining({ summary: 'Evidence-backed summary for board prep.' }),
      );

      const writingResponse = await fetch(
        `${baseUrl}/api/writing/shared-space/projects/tumor-board/document`,
      );
      expect(writingResponse.status).toBe(200);

      const writingResult = (await writingResponse.json()) as {
        document: { documentId: string };
      };
      expect(writingResult.document.documentId).toBeTruthy();

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

      const refreshedWritingResponse = await fetch(
        `${baseUrl}/api/writing/shared-space/projects/tumor-board/document`,
      );
      expect(refreshedWritingResponse.status).toBe(200);

      const refreshedWritingResult = (await refreshedWritingResponse.json()) as {
        document: {
          documentId: string;
          latestSnapshot: null | { content: string };
          publishState: string;
        };
      };
      expect(refreshedWritingResult.document.latestSnapshot?.content).toBe(
        'Tumor board synthesis',
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

      const publishedWritingResponse = await fetch(
        `${baseUrl}/api/writing/shared-space/projects/tumor-board/document`,
      );
      expect(publishedWritingResponse.status).toBe(200);

      const publishedWritingResult = (await publishedWritingResponse.json()) as {
        document: { publishState: string };
      };
      expect(publishedWritingResult.document.publishState).toBe('published');

      const initialGovernedSummaryResponse = await fetch(
        `${baseUrl}/api/spaces/shared-space/governed-summary`,
      );
      expect(initialGovernedSummaryResponse.status).toBe(200);

      const initialGovernedSummaryResult =
        (await initialGovernedSummaryResponse.json()) as {
          governedJob: null | { job: { status: string } };
        };
      expect(initialGovernedSummaryResult.governedJob).toBeNull();

      const governedSummaryResponse = await fetch(
        `${baseUrl}/api/spaces/shared-space/governed-summary`,
        {
          method: 'POST',
        },
      );
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
});
