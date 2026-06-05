import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { describe, expect, it } from 'vitest';

import {
  createPrismaClient,
  createProjectRepository,
  createSpaceRepository,
} from '../../src/db';
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
      expect(detail?.excerpts).toEqual([]);

      await expect(
        app.reading.createProjectComment({
          actorUserId: 'user-bob',
          actorSpaceId: bobPersonal.id,
          body: 'This should not be visible here.',
          libraryEntryId: imported.entry.id,
          projectId: project.project.id,
        }),
      ).rejects.toThrow(/access denied/i);

      const comment = await app.reading.createProjectComment({
        actorUserId: 'user-alice',
        actorSpaceId: aliceShared.id,
        body: 'This paper matters for the shared review.',
        libraryEntryId: imported.entry.id,
        projectId: project.project.id,
      });

      expect(comment.libraryEntryId).toBe(imported.entry.id);
      expect(comment.kind).toBe('project_comment');
      expect(comment.projectId).toBe(project.project.id);

      const excerpt = await app.reading.createReaderExcerpt({
        actorSpaceId: aliceShared.id,
        actorUserId: 'user-alice',
        endOffset: 23,
        libraryEntryId: imported.entry.id,
        locator: 'p. 4',
        note: 'Durable excerpt for later citation.',
        quote: 'shared durable evidence',
        startOffset: 1,
      });

      expect(excerpt).toMatchObject({
        createdByUserId: 'user-alice',
        libraryEntryId: imported.entry.id,
        paperAssetId: imported.asset.id,
        quote: 'shared durable evidence',
      });
      expect(
        await app.reading.listReaderExcerpts({
          actorSpaceId: aliceShared.id,
          actorUserId: 'user-alice',
          libraryEntryId: imported.entry.id,
        }),
      ).toEqual([excerpt]);

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
      expect(updatedDetail?.notes).toHaveLength(0);
      expect(updatedDetail?.projectComments).toHaveLength(1);
      expect(updatedDetail?.excerpts).toEqual([excerpt]);
      expect(updatedDetail?.insights).toHaveLength(1);
      expect(updatedDetail?.insights[0].summary).toContain('shared review');

      const captured = await app.notebooks.captureEvidence(
        {
          notebookTitle: 'Reader evidence notebook',
          source: {
            generatedInsightId: insight.id,
            libraryEntryId: imported.entry.id,
            note: 'Keep this quote distinct from the editable interpretation.',
            type: 'generatedInsight',
          },
        },
        'user-alice',
      );

      expect(captured.document).toMatchObject({
        ownerId: 'user-alice',
        title: 'Reader evidence notebook',
      });
      expect(captured.snapshot.content).not.toContain('Generated insight:');
      expect(captured.snapshot.content).toContain('The imported paper supports the shared review workflow.');
      expect(captured.snapshot.content).toContain('> shared review data');
      expect(captured.snapshot.documentContent).toMatchObject({
        blocks: expect.arrayContaining([
          {
            level: 2,
            text: 'Captured reader evidence',
            type: 'heading',
          },
          expect.objectContaining({
            evidenceSpan: 'shared review data',
            libraryEntryId: imported.entry.id,
            paperAssetId: imported.asset.id,
            quote: 'shared review data',
            type: 'sourceExcerpt',
          }),
        ]),
        schemaVersion: 1,
      });
      expect(captured.snapshot.citations).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            evidenceSpan: 'shared review data',
            paperAssetId: imported.asset.id,
          }),
        ]),
      );

      const capturedReaderExcerpt = await app.notebooks.captureEvidence(
        {
          notebookTitle: 'Reader excerpt notebook',
          source: {
            libraryEntryId: imported.entry.id,
            note: 'Capture the reader-selected quote into private synthesis.',
            readerExcerptId: excerpt.id,
            type: 'readerExcerpt',
          },
        },
        'user-alice',
      );

      expect(capturedReaderExcerpt.document).toMatchObject({
        ownerId: 'user-alice',
        title: 'Reader excerpt notebook',
      });
      expect(capturedReaderExcerpt.snapshot.content).toContain('Captured reader excerpt');
      expect(capturedReaderExcerpt.snapshot.content).toContain('> shared durable evidence');
      expect(capturedReaderExcerpt.snapshot.documentContent).toMatchObject({
        blocks: expect.arrayContaining([
          {
            level: 2,
            text: 'Captured reader excerpt',
            type: 'heading',
          },
          expect.objectContaining({
            evidenceSpan: 'shared durable evidence',
            libraryEntryId: imported.entry.id,
            paperAssetId: imported.asset.id,
            quote: 'shared durable evidence',
            readerExcerptId: excerpt.id,
            type: 'sourceExcerpt',
          }),
        ]),
        schemaVersion: 1,
      });
      expect(capturedReaderExcerpt.snapshot.citations).toEqual([
        expect.objectContaining({
          evidenceSpan: 'shared durable evidence',
          paperAssetId: imported.asset.id,
          readerExcerptId: excerpt.id,
        }),
      ]);

      await expect(
        app.notebooks.captureEvidence(
          {
            notebookTitle: 'Mismatched reader excerpt notebook',
            source: {
              libraryEntryId: 'entry-mismatch',
              readerExcerptId: excerpt.id,
              type: 'readerExcerpt',
            },
          },
          'user-alice',
        ),
      ).rejects.toThrow(/does not match library entry/i);

      await expect(
        app.notebooks.captureEvidence(
          {
            notebookTitle: 'Should not be created for unauthorized capture',
            source: {
              generatedInsightId: insight.id,
              libraryEntryId: imported.entry.id,
              type: 'generatedInsight',
            },
          },
          'user-bob',
        ),
      ).rejects.toThrow(/access denied/i);
      await expect(
        app.notebooks.captureEvidence(
          {
            notebookDocumentId: captured.document.id,
            source: {
              generatedInsightId: 'missing-insight',
              libraryEntryId: imported.entry.id,
              type: 'generatedInsight',
            },
          },
          'user-alice',
        ),
      ).rejects.toThrow(/does not exist/i);

      await app.projects.addProjectMember(
        project.project.id,
        { role: 'viewer', userId: 'user-bob' },
        'user-alice',
      );

      expect(
        await app.reading.listReaderExcerpts({
          actorSpaceId: aliceShared.id,
          actorUserId: 'user-bob',
          libraryEntryId: imported.entry.id,
        }),
      ).toEqual([excerpt]);

      await expect(
        app.notebooks.getDocument({ documentId: captured.document.id }, 'user-bob'),
      ).rejects.toThrow(/access denied/i);
      await expect(
        app.notebooks.getDocument({ documentId: capturedReaderExcerpt.document.id }, 'user-bob'),
      ).rejects.toThrow(/access denied/i);
      await expect(
        app.notebooks.saveDocument(
          {
            citations: [],
            content: 'Project membership must not open Alice Notebook.',
            documentId: captured.document.id,
          },
          'user-bob',
        ),
      ).rejects.toThrow(/access denied/i);
      await expect(
        app.reading.listReaderExcerpts({
          actorSpaceId: bobPersonal.id,
          actorUserId: 'user-charlie',
          libraryEntryId: imported.entry.id,
        }),
      ).rejects.toThrow(/access denied/i);
      await expect(
        app.notebooks.captureEvidence(
          {
            notebookDocumentId: captured.document.id,
            source: {
              generatedInsightId: insight.id,
              libraryEntryId: imported.entry.id,
              type: 'generatedInsight',
            },
          },
          'user-bob',
        ),
      ).rejects.toThrow(/access denied/i);

      const projectDoc = await app.projectDocs.createDocument(
        {
          projectId: project.project.id,
          title: 'Reader excerpt shared synthesis',
        },
        'user-alice',
      );
      const projectDocSnapshot = await app.projectDocs.saveDocument(
        {
          citations: [
            {
              evidenceSpan: excerpt.quote,
              libraryEntryId: imported.entry.id,
              paperAssetId: imported.asset.id,
              readerExcerptId: excerpt.id,
            },
          ],
          documentContent: {
            blocks: [
              {
                level: 2,
                text: 'Reader evidence synthesis',
                type: 'heading',
              },
              {
                evidenceSpan: excerpt.quote,
                libraryEntryId: imported.entry.id,
                locator: excerpt.locator,
                paperAssetId: imported.asset.id,
                quote: excerpt.quote,
                readerExcerptId: excerpt.id,
                type: 'sourceExcerpt',
              },
            ],
            schemaVersion: 1,
          },
          documentId: projectDoc.id,
        },
        'user-alice',
      );
      const bobProjectDocSnapshot = await app.projectDocs.getDocument(
        { documentId: projectDoc.id },
        'user-bob',
      );

      expect(projectDocSnapshot.citations).toEqual([
        expect.objectContaining({
          evidenceSpan: excerpt.quote,
          paperAssetId: imported.asset.id,
          readerExcerptId: excerpt.id,
        }),
      ]);
      expect(bobProjectDocSnapshot.citations[0]?.readerExcerptId).toBe(excerpt.id);
      await expect(
        app.projectDocs.getDocument({ documentId: projectDoc.id }, 'user-charlie'),
      ).rejects.toThrow(/access denied/i);
    } finally {
      rmSync(storageRoot, { force: true, recursive: true });
    }
  }, 30_000);

  it('authorizes reading flows through persisted space memberships without legacy mirrors', async () => {
    const storageRoot = mkdtempSync(join(tmpdir(), 'jixia-reading-prisma-space-'));
    const databaseUrl = `file:${join(storageRoot, 'jixia-reading-space.db')}`;
    const env = {
      JIXIA_DATABASE_URL: databaseUrl,
      JIXIA_STORAGE_ROOT: storageRoot,
    };
      const prisma = createPrismaClient({ url: databaseUrl });
      const repository = createSpaceRepository(prisma);
      createProjectRepository(prisma);

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
      });

      expect(note.authorUserId).toBe('user-alice');
      expect(note.kind).toBe('private_note');

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

  it('reopens private notes and governed insights for the personal workbench reader', async () => {
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
      const sharedSpace = await app.spaces.createSpace(
        { kind: 'shared', name: 'Workbench Reopen Space' },
        'user-alice',
      );
      const project = await app.projects.createProject(
        { name: 'Workbench Reopen Project', spaceId: sharedSpace.id },
        'user-alice',
      );
      const imported = await app.imports.importPaper(
        {
          scope: { id: project.project.id, type: 'project' },
          requestedByUserId: 'user-alice',
          sourceLocator: '654321',
          sourceType: 'pmid',
          spaceId: sharedSpace.id,
          visibility: 'published_to_project',
        },
        'user-alice',
      );

      await app.reading.createWorkbenchNote({
        authorUserId: 'user-alice',
        body: 'Private note for later synthesis.',
        libraryEntryId: imported.entry.id,
        visibility: 'private',
      });
      await app.reading.createWorkbenchProjectComment({
        actorSpaceId: sharedSpace.id,
        authorUserId: 'user-alice',
        body: 'Project-visible comment for the tumor board.',
        libraryEntryId: imported.entry.id,
        projectId: project.project.id,
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
        summary: 'Governed insight ready for Project Doc drafting.',
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
            kind: 'private_note',
          }),
        ]),
      );
      expect(reopenedDetail?.projectComments).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            body: 'Project-visible comment for the tumor board.',
            kind: 'project_comment',
            projectId: project.project.id,
          }),
        ]),
      );
      expect(reopenedDetail?.insights).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            summary: 'Governed insight ready for Project Doc drafting.',
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

  it('skips orphaned legacy generated insights instead of synthesizing actor attribution', async () => {
    const storageRoot = mkdtempSync(join(tmpdir(), 'jixia-reading-orphan-insight-'));
    const env = {
      JIXIA_DATABASE_URL: `file:${join(storageRoot, 'jixia-reading-orphan-insight.db')}`,
      JIXIA_STORAGE_ROOT: storageRoot,
    };
    const statePath = join(storageRoot, 'server-state.json');
    const now = new Date().toISOString();
    let seededApp: ReturnType<typeof createJixiaApp> | null = null;
    let restartedApp: ReturnType<typeof createJixiaApp> | null = null;

    try {
      seededApp = createJixiaApp({
        connectors: {
          pubmed: createStubPubmedConnector(),
        },
        env,
      });
      const imported = await seededApp.imports.importToPersonalLibrary(
        {
          requestedByUserId: 'user-bob',
          sourceLocator: '777002',
          sourceType: 'pmid',
        },
        'user-bob',
      );

      writeFileSync(
        statePath,
        JSON.stringify(
          {
            insights: [
              {
                conversationId: 'missing-legacy-conversation',
                createdAt: now,
                evidenceSpans: [
                  {
                    endOffset: 23,
                    paperAssetId: imported.asset.id,
                    quote: 'orphaned legacy evidence',
                    startOffset: 0,
                  },
                ],
                id: 'insight-orphaned-legacy-bootstrap',
                libraryEntryId: imported.entry.id,
                summary: 'This orphaned insight must not be attributed to Alice.',
              },
            ],
          },
          null,
          2,
        ),
      );

      await seededApp.close();
      seededApp = null;

      restartedApp = createJixiaApp({
        connectors: {
          pubmed: createStubPubmedConnector(),
        },
        env,
      });
      const reopenedDetail = await restartedApp.reading.getWorkbenchDetail({
        actorUserId: 'user-bob',
        libraryEntryId: imported.entry.id,
      });

      expect(reopenedDetail?.insights).toEqual([]);

      const scrubbedState = JSON.parse(readFileSync(statePath, 'utf8')) as {
        insights?: Array<unknown>;
      };
      expect(scrubbedState.insights ?? []).toEqual([]);

      const prisma = createPrismaClient({ url: env.JIXIA_DATABASE_URL });
      try {
        const generatedInsight = await prisma.generatedInsight.findUnique({
          where: { id: 'insight-orphaned-legacy-bootstrap' },
        });
        const syntheticAlice = await prisma.user.findUnique({
          where: { id: 'user-alice' },
        });

        expect(generatedInsight).toBeNull();
        expect(syntheticAlice).toBeNull();
      } finally {
        await prisma.$disconnect().catch(() => undefined);
      }
    } finally {
      await restartedApp?.close();
      await seededApp?.close();
      rmSync(storageRoot, { force: true, recursive: true });
    }
  });

  it('keeps private notes owner-only while sharing project comments with project members', async () => {
    const storageRoot = mkdtempSync(join(tmpdir(), 'jixia-reading-authority-split-'));
    const env = {
      JIXIA_DATABASE_URL: `file:${join(storageRoot, 'jixia-reading-authority-split.db')}`,
      JIXIA_STORAGE_ROOT: storageRoot,
    };

    try {
      const app = createJixiaApp({
        connectors: {
          pubmed: createStubPubmedConnector(),
        },
        env,
      });
      const sharedSpace = await app.spaces.createSpace(
        { kind: 'shared', name: 'Authority Split Space' },
        'user-alice',
      );
      const project = await app.projects.createProject(
        { name: 'Authority Split Project', spaceId: sharedSpace.id },
        'user-alice',
      );

      await app.projects.addProjectMember(
        project.project.id,
        { role: 'viewer', userId: 'user-bob' },
        'user-alice',
      );
      const imported = await app.imports.importPaper(
        {
          scope: { id: project.project.id, type: 'project' },
          requestedByUserId: 'user-alice',
          sourceLocator: '10.1000/authority-split',
          sourceType: 'doi',
          spaceId: sharedSpace.id,
          visibility: 'published_to_project',
        },
        'user-alice',
      );
      const personal = await app.imports.importToPersonalLibrary(
        {
          requestedByUserId: 'user-alice',
          sourceLocator: '10.1000/personal-comment-denied',
          sourceType: 'doi',
        },
        'user-alice',
      );

      await app.reading.createNote({
        actorSpaceId: sharedSpace.id,
        actorUserId: 'user-alice',
        body: 'Alice private note on project entry.',
        libraryEntryId: imported.entry.id,
      });
      await app.reading.createProjectComment({
        actorSpaceId: sharedSpace.id,
        actorUserId: 'user-alice',
        body: 'Project comment visible to members.',
        libraryEntryId: imported.entry.id,
        projectId: project.project.id,
      });

      const aliceDetail = await app.reading.getDetail({
        actorSpaceId: sharedSpace.id,
        actorUserId: 'user-alice',
        libraryEntryId: imported.entry.id,
      });
      const bobDetail = await app.reading.getDetail({
        actorSpaceId: sharedSpace.id,
        actorUserId: 'user-bob',
        libraryEntryId: imported.entry.id,
      });

      expect(aliceDetail?.notes.map((note) => note.body)).toContain(
        'Alice private note on project entry.',
      );
      expect(aliceDetail?.projectComments.map((comment) => comment.body)).toContain(
        'Project comment visible to members.',
      );
      expect(bobDetail?.notes.map((note) => note.body)).not.toContain(
        'Alice private note on project entry.',
      );
      expect(bobDetail?.projectComments.map((comment) => comment.body)).toContain(
        'Project comment visible to members.',
      );

      await expect(
        app.reading.createProjectComment({
          actorSpaceId: sharedSpace.id,
          actorUserId: 'user-alice',
          body: 'Wrong project assertion.',
          libraryEntryId: imported.entry.id,
          projectId: 'project-wrong',
        }),
      ).rejects.toThrow(/project context/i);
      await expect(
        app.reading.createProjectComment({
          actorSpaceId: sharedSpace.id,
          actorUserId: 'user-alice',
          body: 'No project comment on personal entries.',
          libraryEntryId: personal.entry.id,
        }),
      ).rejects.toThrow(/project-scoped library entry/i);
      await expect(
        app.reading.getDetail({
          actorSpaceId: sharedSpace.id,
          actorUserId: 'user-charlie',
          libraryEntryId: imported.entry.id,
        }),
      ).rejects.toThrow(/access denied/i);
    } finally {
      rmSync(storageRoot, { force: true, recursive: true });
    }
  });
});
