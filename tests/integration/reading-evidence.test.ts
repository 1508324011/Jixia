import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { describe, expect, it } from 'vitest';

import { createPrismaClient, createSpaceRepository } from '../../src/db';
import type { PubmedConnector } from '../../src/server/connectors/pubmed.connector';
import { createJixiaApp } from '../../src/server/app';

function createStubPubmedConnector(): PubmedConnector {
  return {
    async lookup(locator, sourceType) {
      return {
        abstractText: `External ${sourceType.toUpperCase()} abstract for ${locator}`,
        canonicalId: `${sourceType}:${locator}`,
        title: `Imported ${sourceType.toUpperCase()} paper ${locator}`,
      };
    },
    async search(query) {
      return [
        {
          abstractText: `PubMed search result for ${query}`,
          canonicalId: 'pmid:654321',
          reason: 'PubMed query matched tumor-board biomarker curation work.',
          sourceLabel: 'PubMed',
          sourceLocator: '654321',
          sourceType: 'pmid',
          title: 'Tumor board biomarkers for rapid review',
        },
      ];
    },
  };
}

describe('reading evidence', () => {
  it('stores evidence links with generated insights', async () => {
    const storageRoot = mkdtempSync(join(tmpdir(), 'jixia-reading-evidence-'));

    try {
      const app = createJixiaApp({
        connectors: {
          pubmed: createStubPubmedConnector(),
        },
        env: { JIXIA_STORAGE_ROOT: storageRoot },
      });
      const aliceShared = await app.spaces.createSpace(
        { kind: 'shared', name: 'Alice Shared' },
        'user-alice',
      );
      const project = await app.projects.createProject(
        { name: 'Alice Reading Project', spaceId: aliceShared.id },
        'user-alice',
      );
      const bobPersonal = await app.spaces.createSpace(
        { kind: 'personal', name: 'Bob Personal' },
        'user-bob',
      );
      const imported = await app.imports.importPaper({
        scope: { id: project.project.id, type: 'project' },
        requestedByUserId: 'user-alice',
        sourceLocator: '10.1000/reading-demo',
        sourceType: 'doi',
        spaceId: aliceShared.id,
        visibility: 'space_shared',
      }, 'user-alice');

      const detail = await app.reading.getDetail({
        actorSpaceId: aliceShared.id,
        actorUserId: 'user-alice',
        libraryEntryId: imported.entry.id,
      });
      expect(detail?.entry.id).toBe(imported.entry.id);
      expect(detail?.asset.canonicalId).toBe('doi:10.1000/reading-demo');

      await expect(
        app.reading.createNote({
          actorUserId: 'user-bob',
          actorSpaceId: bobPersonal.id,
          authorUserId: 'user-bob',
          body: 'This should not be visible here.',
          libraryEntryId: imported.entry.id,
          visibility: 'space_shared',
        }),
      ).rejects.toThrow(/access denied/i);

      const note = await app.reading.createNote({
        actorUserId: 'user-alice',
        actorSpaceId: aliceShared.id,
        authorUserId: 'user-alice',
        body: 'This paper matters for the shared review.',
        libraryEntryId: imported.entry.id,
        visibility: 'space_shared',
      });

      expect(note.libraryEntryId).toBe(imported.entry.id);

      const insight = await app.reading.saveGeneratedInsight({
        actorUserId: 'user-alice',
        actorSpaceId: aliceShared.id,
        evidenceSpans: [
          {
            endOffset: 18,
            quote: 'shared review data',
            startOffset: 0,
          },
        ],
        libraryEntryId: imported.entry.id,
        startedByUserId: 'user-alice',
        summary: 'The imported paper supports the shared review workflow.',
        title: 'AI summary',
      });

      expect(insight.evidenceSpans[0].paperAssetId).toBe(imported.asset.id);

      const updatedDetail = await app.reading.getDetail({
        actorSpaceId: aliceShared.id,
        actorUserId: 'user-alice',
        libraryEntryId: imported.entry.id,
      });
      expect(updatedDetail?.notes).toHaveLength(1);
      expect(updatedDetail?.insights).toHaveLength(1);
      expect(updatedDetail?.insights[0].summary).toContain('shared review');
    } finally {
      rmSync(storageRoot, { force: true, recursive: true });
    }
  });

  it('authorizes reading flows through persisted space memberships without legacy mirrors', async () => {
    const storageRoot = mkdtempSync(join(tmpdir(), 'jixia-reading-prisma-space-'));
    const databaseUrl = `file:${join(storageRoot, 'jixia-reading-space.db')}`;
    const env = {
      JIXIA_DATABASE_URL: databaseUrl,
      JIXIA_STORAGE_ROOT: storageRoot,
    };
    const prisma = createPrismaClient({ url: databaseUrl });
    const repository = createSpaceRepository(prisma);

    try {
      const persistedSpace = await repository.createSpace(
        { id: 'space-reading', kind: 'shared', name: 'Persisted Reading Space' },
        'user-alice',
      );
      const app = createJixiaApp({
        connectors: {
          pubmed: createStubPubmedConnector(),
        },
        env,
      });
      const project = await app.projects.createProject(
        { name: 'Persisted Reading Project', spaceId: persistedSpace.id },
        'user-alice',
      );
      const imported = await app.imports.importPaper(
        {
          scope: { id: project.project.id, type: 'project' },
          requestedByUserId: 'user-alice',
          sourceLocator: '10.1000/persisted-reading',
          sourceType: 'doi',
          spaceId: persistedSpace.id,
          visibility: 'space_shared',
        },
        'user-alice',
      );

      const detail = await app.reading.getDetail({
        actorSpaceId: persistedSpace.id,
        actorUserId: 'user-alice',
        libraryEntryId: imported.entry.id,
      });

      expect(detail?.entry.id).toBe(imported.entry.id);

      const note = await app.reading.createNote({
        actorSpaceId: persistedSpace.id,
        actorUserId: 'user-alice',
        body: 'Repository-backed access works.',
        libraryEntryId: imported.entry.id,
        visibility: 'space_shared',
      });

      expect(note.authorUserId).toBe('user-alice');

      await expect(
        app.reading.getDetail({
          actorSpaceId: persistedSpace.id,
          actorUserId: 'user-charlie',
          libraryEntryId: imported.entry.id,
        }),
      ).rejects.toThrow(/access denied/i);
    } finally {
      await prisma.$disconnect().catch(() => undefined);
      rmSync(storageRoot, { force: true, recursive: true });
    }
  });

  it('reopens private notes, shared comments, and governed insights for the workbench reader', async () => {
    const storageRoot = mkdtempSync(join(tmpdir(), 'jixia-reading-reopen-'));
    const env = {
      JIXIA_DATABASE_URL: `file:${join(storageRoot, 'jixia-reading-reopen.db')}`,
      JIXIA_STORAGE_ROOT: storageRoot,
    };

    try {
      const app = createJixiaApp({
        connectors: {
          pubmed: createStubPubmedConnector(),
        },
        env,
      });
      const imported = await app.imports.importToPersonalLibrary(
        {
          requestedByUserId: 'user-alice',
          sourceLocator: '654321',
          sourceType: 'pmid',
        },
        'user-alice',
      );

      await app.reading.createWorkbenchNote({
        authorUserId: 'user-alice',
        body: 'Private note for later synthesis.',
        libraryEntryId: imported.entry.id,
        visibility: 'private',
      });
      await app.reading.createWorkbenchNote({
        authorUserId: 'user-alice',
        body: 'Project-visible comment for the tumor board.',
        libraryEntryId: imported.entry.id,
        visibility: 'space_shared',
      });
      await app.reading.saveWorkbenchGeneratedInsight({
        evidenceSpans: [
          {
            endOffset: 24,
            quote: 'Tumor board evidence',
            startOffset: 0,
          },
        ],
        libraryEntryId: imported.entry.id,
        startedByUserId: 'user-alice',
        summary: 'Governed insight ready for Writer promotion.',
        title: 'Tumor board governed insight',
      });

      const reopenedApp = createJixiaApp({
        connectors: {
          pubmed: createStubPubmedConnector(),
        },
        env,
      });
      const reopenedDetail = await reopenedApp.reading.getWorkbenchDetail({
        actorUserId: 'user-alice',
        libraryEntryId: imported.entry.id,
      });

      expect(reopenedDetail?.notes).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            body: 'Private note for later synthesis.',
            visibility: 'private',
          }),
          expect.objectContaining({
            body: 'Project-visible comment for the tumor board.',
            visibility: 'space_shared',
          }),
        ]),
      );
      expect(reopenedDetail?.insights).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            summary: 'Governed insight ready for Writer promotion.',
          }),
        ]),
      );
    } finally {
      rmSync(storageRoot, { force: true, recursive: true });
    }
  });

  it('bootstraps legacy reading json into Prisma once and then scrubs compatibility arrays', async () => {
    const storageRoot = mkdtempSync(join(tmpdir(), 'jixia-reading-bootstrap-once-'));
    const env = {
      JIXIA_DATABASE_URL: `file:${join(storageRoot, 'jixia-reading-bootstrap.db')}`,
      JIXIA_STORAGE_ROOT: storageRoot,
    };
    const statePath = join(storageRoot, 'server-state.json');
    const now = new Date().toISOString();

    try {
      const seededApp = createJixiaApp({
        connectors: {
          pubmed: createStubPubmedConnector(),
        },
        env,
      });
      const imported = await seededApp.imports.importToPersonalLibrary(
        {
          requestedByUserId: 'user-alice',
          sourceLocator: '777001',
          sourceType: 'pmid',
        },
        'user-alice',
      );

      writeFileSync(
        statePath,
        JSON.stringify(
          {
            conversations: [
              {
                createdAt: now,
                id: 'conversation-legacy-bootstrap',
                libraryEntryId: imported.entry.id,
                startedByUserId: 'user-alice',
                title: 'Legacy governed insight conversation',
              },
            ],
            insights: [
              {
                conversationId: 'conversation-legacy-bootstrap',
                createdAt: now,
                evidenceSpans: [
                  {
                    endOffset: 21,
                    paperAssetId: imported.asset.id,
                    quote: 'legacy governed evidence',
                    startOffset: 0,
                  },
                ],
                id: 'insight-legacy-bootstrap',
                libraryEntryId: imported.entry.id,
                summary: 'Legacy governed insight restored from JSON.',
              },
            ],
            notes: [
              {
                authorUserId: 'user-alice',
                body: 'Legacy private reader note.',
                createdAt: now,
                id: 'note-legacy-bootstrap',
                libraryEntryId: imported.entry.id,
                visibility: 'private',
              },
            ],
          },
          null,
          2,
        ),
      );

      const restartedApp = createJixiaApp({
        connectors: {
          pubmed: createStubPubmedConnector(),
        },
        env,
      });
      const reopenedDetail = await restartedApp.reading.getWorkbenchDetail({
        actorUserId: 'user-alice',
        libraryEntryId: imported.entry.id,
      });

      expect(reopenedDetail?.notes).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            body: 'Legacy private reader note.',
          }),
        ]),
      );
      expect(reopenedDetail?.insights).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            summary: 'Legacy governed insight restored from JSON.',
          }),
        ]),
      );

      const scrubbedState = JSON.parse(readFileSync(statePath, 'utf8')) as {
        conversations?: Array<unknown>;
        insights?: Array<unknown>;
        notes?: Array<unknown>;
      };

      expect(scrubbedState.conversations ?? []).toEqual([]);
      expect(scrubbedState.insights ?? []).toEqual([]);
      expect(scrubbedState.notes ?? []).toEqual([]);
    } finally {
      rmSync(storageRoot, { force: true, recursive: true });
    }
  });
});
