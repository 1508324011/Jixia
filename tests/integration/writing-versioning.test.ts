import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { describe, expect, it } from 'vitest';

import type { DocumentBlockDocument } from '../../src/shared/contracts/document-content';

import {
  createPrismaClient,
  createNotebookRepository,
  createProjectDocRepository,
  createSpaceRepository,
} from '../../src/db';
import { createJixiaApp, type CreateJixiaAppOptions } from '../../src/server/app';
import type { PubmedConnector } from '../../src/server/connectors/pubmed.connector';

const EMPTY_DOCUMENT_CONTENT: DocumentBlockDocument = {
  blocks: [],
  schemaVersion: 1,
};

function expectLegacyParagraphDocument(
  documentContent: DocumentBlockDocument | undefined,
  content: string,
): void {
  expect(documentContent).toEqual(
    content
      ? {
          blocks: [
            {
              text: content,
              type: 'paragraph',
            },
          ],
          schemaVersion: 1,
        }
      : EMPTY_DOCUMENT_CONTENT,
  );
}

function createStorageRoot(prefix: string): string {
  return mkdtempSync(join(tmpdir(), prefix));
}

function createWritingEnv(storageRoot: string) {
  return {
    JIXIA_DATABASE_URL: `file:${join(storageRoot, 'jixia-writing.db')}`,
    JIXIA_STORAGE_ROOT: storageRoot,
  };
}

function createWritingPubmedConnector(): PubmedConnector {
  return {
    async lookup(locator, sourceType) {
      return {
        abstractText: `Writing fixture ${sourceType.toUpperCase()} abstract for ${locator}.`,
        canonicalId: `${sourceType}:${locator}`,
        title: `Writing fixture ${sourceType.toUpperCase()} paper ${locator}`,
      };
    },
    async search() {
      return [];
    },
  };
}

function createWritingTestApp(options: CreateJixiaAppOptions) {
  return createJixiaApp({
    ...options,
    connectors: {
      ...options.connectors,
      pubmed: options.connectors?.pubmed ?? createWritingPubmedConnector(),
    },
  });
}

describe('notebook and project document persistence', () => {
  it('creates owner-only notebook snapshots and persists them across restarts', async () => {
    const storageRoot = createStorageRoot('jixia-notebook-versioning-');

    try {
      const env = createWritingEnv(storageRoot);
      const firstApp = createWritingTestApp({ env });
      const personalSpace = await firstApp.spaces.createSpace(
        { kind: 'personal', name: 'Alice Notebook Space' },
        'user-alice',
      );
      const imported = await firstApp.imports.importPaper(
        {
          requestedByUserId: 'user-alice',
          scope: { id: 'user-alice', type: 'user' },
          sourceLocator: '10.1000/notebook-demo',
          sourceType: 'doi',
          spaceId: personalSpace.id,
          visibility: 'private',
        },
        'user-alice',
      );

      const notebook = await firstApp.notebooks.createDocument(
        {
          ownerId: 'user-alice',
          title: 'Alice Private Notebook',
        },
        'user-alice',
      );
      const firstSnapshot = await firstApp.notebooks.saveDocument(
        {
          citations: [
            {
              evidenceSpan: 'intro paragraph',
              paperAssetId: imported.asset.id,
            },
          ],
          content: 'Notebook version one',
          documentId: notebook.id,
        },
        'user-alice',
      );

      expect(firstSnapshot.versionNumber).toBe(1);
      expect(firstSnapshot.content).toBe('Notebook version one');
      expectLegacyParagraphDocument(
        firstSnapshot.documentContent,
        'Notebook version one',
      );
      expect(firstSnapshot.citations[0]?.paperAssetId).toBe(imported.asset.id);

      await expect(
        firstApp.notebooks.getDocument({ documentId: notebook.id }, 'user-bob'),
      ).rejects.toThrow(/access denied/i);
      await expect(
        firstApp.notebooks.saveDocument(
          {
            citations: [],
            content: 'Bob intrusion attempt',
            documentId: notebook.id,
          },
          'user-bob',
        ),
      ).rejects.toThrow(/access denied/i);

      await firstApp.close();

      const secondApp = createWritingTestApp({ env });
      const secondSnapshot = await secondApp.notebooks.saveDocument(
        {
          citations: [
            {
              evidenceSpan: 'results paragraph',
              paperAssetId: imported.entry.id,
            },
          ],
          content: 'Notebook version two',
          documentId: notebook.id,
        },
        'user-alice',
      );

      expect(secondSnapshot.document.id).toBe(notebook.id);
      expect(secondSnapshot.versionNumber).toBe(2);
      expect(secondSnapshot.content).toBe('Notebook version two');
      expectLegacyParagraphDocument(
        secondSnapshot.documentContent,
        'Notebook version two',
      );
      expect(secondSnapshot.citations[0]?.paperAssetId).toBe(imported.asset.id);
      await secondApp.close();
    } finally {
      rmSync(storageRoot, { force: true, recursive: true });
    }
  }, 60_000);

  it('persists notebook citations that reference durable reader excerpts', async () => {
    const storageRoot = createStorageRoot('jixia-notebook-reader-excerpt-citations-');

    try {
      const env = createWritingEnv(storageRoot);
      const app = createWritingTestApp({ env });
      const imported = await app.imports.importToPersonalLibrary(
        {
          sourceLocator: '10.1000/notebook-reader-excerpt',
          sourceType: 'doi',
        },
        'user-alice',
      );
      const excerpt = await app.reading.createReaderExcerpt({
        actorUserId: 'user-alice',
        endOffset: 24,
        libraryEntryId: imported.entry.id,
        quote: 'notebook reader excerpt',
        startOffset: 1,
      });
      const notebook = await app.notebooks.createDocument(
        { title: 'Excerpt Notebook' },
        'user-alice',
      );

      const snapshot = await app.notebooks.saveDocument(
        {
          citations: [
            {
              paperAssetId: imported.asset.id,
              readerExcerptId: excerpt.id,
            },
          ],
          content: 'Notebook cites a durable reader excerpt.',
          documentId: notebook.id,
        },
        'user-alice',
      );

      expect(snapshot.citations).toEqual([
        expect.objectContaining({
          evidenceSpan: excerpt.quote,
          paperAssetId: imported.asset.id,
          readerExcerptId: excerpt.id,
        }),
      ]);
      await expect(
        app.notebooks.saveDocument(
          {
            citations: [
              {
                paperAssetId: imported.asset.id,
                readerExcerptId: excerpt.id,
              },
            ],
            content: 'Bob must not cite Alice personal excerpt.',
            documentId: notebook.id,
          },
          'user-bob',
        ),
      ).rejects.toThrow(/access denied/i);
      await app.close();
    } finally {
      rmSync(storageRoot, { force: true, recursive: true });
    }
  });

  it('persists project-doc reader excerpt citations only when the source is project-available', async () => {
    const storageRoot = createStorageRoot('jixia-project-doc-reader-excerpt-citations-');

    try {
      const env = createWritingEnv(storageRoot);
      const app = createWritingTestApp({ env });
      const sharedSpace = await app.spaces.createSpace(
        { kind: 'shared', name: 'Reader Excerpt Project Space' },
        'user-alice',
      );
      const targetProject = await app.projects.createProject(
        { name: 'Reader Excerpt Target Project', spaceId: sharedSpace.id },
        'user-alice',
      );
      const sourceProject = await app.projects.createProject(
        { name: 'Reader Excerpt Source Project', spaceId: sharedSpace.id },
        'user-alice',
      );
      await app.projects.addProjectMember(
        targetProject.project.id,
        { role: 'editor', userId: 'user-bob' },
        'user-alice',
      );
      await app.projects.addProjectMember(
        sourceProject.project.id,
        { role: 'editor', userId: 'user-bob' },
        'user-alice',
      );

      const targetProjectImport = await app.imports.importPaper(
        {
          scope: { id: targetProject.project.id, type: 'project' },
          sourceLocator: '10.1000/project-reader-excerpt-target',
          sourceType: 'doi',
          spaceId: sharedSpace.id,
          visibility: 'published_to_project',
        },
        'user-alice',
      );
      const targetProjectExcerpt = await app.reading.createReaderExcerpt({
        actorUserId: 'user-alice',
        endOffset: 31,
        libraryEntryId: targetProjectImport.entry.id,
        locator: 'p. 2',
        quote: 'target project reader excerpt',
        startOffset: 3,
      });
      const sourceProjectImport = await app.imports.importPaper(
        {
          scope: { id: sourceProject.project.id, type: 'project' },
          sourceLocator: '10.1000/project-reader-excerpt-adopted',
          sourceType: 'doi',
          spaceId: sharedSpace.id,
          visibility: 'published_to_project',
        },
        'user-alice',
      );
      const sourceProjectExcerpt = await app.reading.createReaderExcerpt({
        actorUserId: 'user-alice',
        endOffset: 34,
        libraryEntryId: sourceProjectImport.entry.id,
        quote: 'source project adopted excerpt',
        startOffset: 5,
      });
      const personalOnlyImport = await app.imports.importPaper(
        {
          scope: { id: 'user-alice', type: 'user' },
          sourceLocator: '10.1000/project-reader-excerpt-personal-only',
          sourceType: 'doi',
          spaceId: sharedSpace.id,
          visibility: 'private',
        },
        'user-alice',
      );
      const personalOnlyExcerpt = await app.reading.createReaderExcerpt({
        actorUserId: 'user-alice',
        endOffset: 29,
        libraryEntryId: personalOnlyImport.entry.id,
        quote: 'personal only reader excerpt',
        startOffset: 2,
      });
      const projectDoc = await app.projectDocs.createDocument(
        {
          projectId: targetProject.project.id,
          title: 'Project excerpt citation draft',
        },
        'user-alice',
      );

      await expect(
        app.projectDocs.saveDocument(
          {
            citations: [
              {
                paperAssetId: personalOnlyImport.asset.id,
                readerExcerptId: personalOnlyExcerpt.id,
              },
            ],
            content: 'Personal-only excerpt is not target project evidence.',
            documentId: projectDoc.id,
          },
          'user-alice',
        ),
      ).rejects.toThrow(/not available in project/i);
      await expect(
        app.projectDocs.saveDocument(
          {
            citations: [
              {
                paperAssetId: sourceProjectImport.asset.id,
                readerExcerptId: sourceProjectExcerpt.id,
              },
            ],
            content: 'Other-project excerpt needs target adoption.',
            documentId: projectDoc.id,
          },
          'user-alice',
        ),
      ).rejects.toThrow(/not available in project/i);
      await expect(
        app.projectDocs.saveDocument(
          {
            citations: [
              {
                paperAssetId: targetProjectImport.asset.id,
                readerExcerptId: personalOnlyExcerpt.id,
              },
            ],
            content: 'Mismatched excerpt asset should fail closed.',
            documentId: projectDoc.id,
          },
          'user-alice',
        ),
      ).rejects.toThrow(/does not match reader excerpt/i);

      const targetProjectSnapshot = await app.projectDocs.saveDocument(
        {
          citations: [
            {
              paperAssetId: targetProjectImport.asset.id,
              readerExcerptId: targetProjectExcerpt.id,
            },
          ],
          content: 'Target project excerpt citation succeeds.',
          documentId: projectDoc.id,
        },
        'user-alice',
      );
      const targetProjectStructuredSnapshot = await app.projectDocs.saveDocument(
        {
          citations: [],
          documentContent: {
            blocks: [
              {
                evidenceSpan: 'explicit override evidence',
                libraryEntryId: targetProjectImport.entry.id,
                paperAssetId: targetProjectImport.asset.id,
                quote: 'explicit override evidence',
                readerExcerptId: targetProjectExcerpt.id,
                type: 'sourceExcerpt',
              },
            ],
            schemaVersion: 1,
          },
          documentId: projectDoc.id,
        },
        'user-alice',
      );
      const adoption = await app.library.adoptProjectLibraryEntry({
        actorUserId: 'user-alice',
        projectId: targetProject.project.id,
        sourceLibraryEntryId: sourceProjectImport.entry.id,
      });
      const adoptedSourceSnapshot = await app.projectDocs.saveDocument(
        {
          citations: [
            {
              paperAssetId: sourceProjectImport.asset.id,
              readerExcerptId: sourceProjectExcerpt.id,
            },
          ],
          content: 'Adopted source project excerpt citation succeeds.',
          documentId: projectDoc.id,
        },
        'user-alice',
      );
      const bobVisibleSnapshot = await app.projectDocs.getDocument(
        { documentId: projectDoc.id },
        'user-bob',
      );
      const bobResavedSnapshot = await app.projectDocs.saveDocument(
        {
          citations: bobVisibleSnapshot.citations.map((citation) => ({
            evidenceSpan: citation.evidenceSpan,
            paperAssetId: citation.paperAssetId,
            readerExcerptId: citation.readerExcerptId,
          })),
          documentContent: bobVisibleSnapshot.documentContent,
          documentId: projectDoc.id,
        },
        'user-bob',
      );

      expect(targetProjectSnapshot.citations).toEqual([
        expect.objectContaining({
          evidenceSpan: targetProjectExcerpt.quote,
          paperAssetId: targetProjectImport.asset.id,
          readerExcerptId: targetProjectExcerpt.id,
        }),
      ]);
      expect(targetProjectStructuredSnapshot.citations).toEqual([
        expect.objectContaining({
          evidenceSpan: 'explicit override evidence',
          paperAssetId: targetProjectImport.asset.id,
          readerExcerptId: targetProjectExcerpt.id,
        }),
      ]);
      expect(adoption.entry.asset.id).toBe(sourceProjectImport.asset.id);
      expect(adoptedSourceSnapshot.citations).toEqual([
        expect.objectContaining({
          evidenceSpan: sourceProjectExcerpt.quote,
          paperAssetId: sourceProjectImport.asset.id,
          readerExcerptId: sourceProjectExcerpt.id,
        }),
      ]);
      expect(bobVisibleSnapshot.citations[0]?.readerExcerptId).toBe(
        sourceProjectExcerpt.id,
      );
      expect(bobVisibleSnapshot.documentContent).toBeDefined();
      expect(bobResavedSnapshot.citations).toEqual([
        expect.objectContaining({
          evidenceSpan: sourceProjectExcerpt.quote,
          paperAssetId: sourceProjectImport.asset.id,
          readerExcerptId: sourceProjectExcerpt.id,
        }),
      ]);
      await expect(
        app.projectDocs.getDocument({ documentId: projectDoc.id }, 'user-charlie'),
      ).rejects.toThrow(/access denied/i);
      await app.close();
    } finally {
      rmSync(storageRoot, { force: true, recursive: true });
    }
  });

  it('enforces ProjectMember-gated project docs and persists versions/citations', async () => {
    const storageRoot = createStorageRoot('jixia-project-doc-versioning-');
    const env = createWritingEnv(storageRoot);
    const prisma = createPrismaClient({ url: env.JIXIA_DATABASE_URL });
    const spaceRepository = createSpaceRepository(prisma);

    try {
      const firstApp = createWritingTestApp({ env });
      const sharedSpace = await firstApp.spaces.createSpace(
        { kind: 'shared', name: 'Project Writing Space' },
        'user-alice',
      );
      const project = await firstApp.projects.createProject(
        { name: 'Project Writing Recovery', spaceId: sharedSpace.id },
        'user-alice',
      );
      await firstApp.projects.addProjectMember(
        project.project.id,
        { role: 'viewer', userId: 'user-bob' },
        'user-alice',
      );
      await spaceRepository.addMembership(sharedSpace.id, {
        role: 'viewer',
        userId: 'user-charlie',
      });

      const imported = await firstApp.imports.importPaper(
        {
          requestedByUserId: 'user-alice',
          scope: { id: project.project.id, type: 'project' },
          sourceLocator: '10.1000/project-doc-demo',
          sourceType: 'doi',
          spaceId: sharedSpace.id,
          visibility: 'published_to_project',
        },
        'user-alice',
      );
      const secondSpace = await firstApp.spaces.createSpace(
        { kind: 'shared', name: 'Other Writing Space' },
        'user-alice',
      );
      const secondProject = await firstApp.projects.createProject(
        { name: 'Other Project', spaceId: secondSpace.id },
        'user-alice',
      );
      const outOfScopeImport = await firstApp.imports.importPaper(
        {
          requestedByUserId: 'user-alice',
          scope: { id: secondProject.project.id, type: 'project' },
          sourceLocator: '10.1000/out-of-scope-project-doc',
          sourceType: 'doi',
          spaceId: secondSpace.id,
          visibility: 'published_to_project',
        },
        'user-alice',
      );

      const projectDoc = await firstApp.projectDocs.createDocument(
        {
          projectId: project.project.id,
          title: 'Collaborative Draft',
        },
        'user-alice',
      );

      const bobReadable = await firstApp.projectDocs.getDocument(
        { documentId: projectDoc.id },
        'user-bob',
      );
      expect(bobReadable.document.projectId).toBe(project.project.id);
      expect(bobReadable).toMatchObject({
        content: '',
        documentContent: EMPTY_DOCUMENT_CONTENT,
        versionNumber: 0,
      });

      await expect(
        firstApp.projectDocs.getDocument({ documentId: projectDoc.id }, 'user-charlie'),
      ).rejects.toThrow(/access denied/i);
      await expect(
        firstApp.projectDocs.saveDocument(
          {
            citations: [],
            content: 'Viewer write attempt',
            documentId: projectDoc.id,
          },
          'user-bob',
        ),
      ).rejects.toThrow(/mutation/i);
      await expect(
        firstApp.projectDocs.saveDocument(
          {
            citations: [{ paperAssetId: outOfScopeImport.asset.id }],
            content: 'Cross-space citation should fail',
            documentId: projectDoc.id,
          },
          'user-alice',
        ),
      ).rejects.toThrow(/paper asset/i);

      const firstSnapshot = await firstApp.projectDocs.saveDocument(
        {
          citations: [
            {
              evidenceSpan: 'methods paragraph',
              paperAssetId: imported.entry.id,
            },
          ],
          content: 'Project doc version one',
          documentId: projectDoc.id,
        },
        'user-alice',
      );
      const reviewed = await firstApp.projectDocs.transitionPublishState(
        {
          documentId: projectDoc.id,
          publishState: 'review',
        },
        'user-alice',
      );

      expect(firstSnapshot.versionNumber).toBe(1);
      expect(firstSnapshot.content).toBe('Project doc version one');
      expectLegacyParagraphDocument(
        firstSnapshot.documentContent,
        'Project doc version one',
      );
      expect(firstSnapshot.citations[0]?.paperAssetId).toBe(imported.asset.id);
      expect(reviewed.publishState).toBe('review');

      await firstApp.close();

      const secondApp = createWritingTestApp({ env });
      const secondSnapshot = await secondApp.projectDocs.saveDocument(
        {
          citations: [{ paperAssetId: imported.asset.id }],
          content: 'Project doc version two',
          documentId: projectDoc.id,
        },
        'user-alice',
      );

      expect(secondSnapshot.document.id).toBe(projectDoc.id);
      expect(secondSnapshot.document.publishState).toBe('review');
      expect(secondSnapshot.versionNumber).toBe(2);
      expect(secondSnapshot.content).toBe('Project doc version two');
      expectLegacyParagraphDocument(
        secondSnapshot.documentContent,
        'Project doc version two',
      );
      await secondApp.close();
    } finally {
      await prisma.$disconnect();
      rmSync(storageRoot, { force: true, recursive: true });
    }
  });

  it('keeps project-doc citations bound to canonical project-scoped library entries', async () => {
    const storageRoot = createStorageRoot('jixia-project-doc-scope-citations-');
    const env = createWritingEnv(storageRoot);

    try {
      const app = createWritingTestApp({ env });
      const canonicalSpace = await app.spaces.createSpace(
        { kind: 'shared', name: 'Canonical Citation Space' },
        'user-alice',
      );
      const staleSpace = await app.spaces.createSpace(
        { kind: 'shared', name: 'Stale Citation Space' },
        'user-alice',
      );
      const canonicalProject = await app.projects.createProject(
        { name: 'Canonical Citation Project', spaceId: canonicalSpace.id },
        'user-alice',
      );
      const staleProject = await app.projects.createProject(
        { name: 'Stale Citation Project', spaceId: staleSpace.id },
        'user-alice',
      );
      const personalOnlyImport = await app.imports.importPaper(
        {
          projectId: staleProject.project.id,
          requestedByUserId: 'user-alice',
          scope: { id: 'user-alice', type: 'user' },
          sourceLocator: '10.1000/personal-only-citation',
          sourceType: 'doi',
          spaceId: staleSpace.id,
          visibility: 'published_to_project',
        },
        'user-alice',
      );
      const canonicalProjectImport = await app.imports.importPaper(
        {
          projectId: staleProject.project.id,
          requestedByUserId: 'user-alice',
          scope: { id: canonicalProject.project.id, type: 'project' },
          sourceLocator: '10.1000/canonical-project-citation',
          sourceType: 'doi',
          spaceId: canonicalSpace.id,
          visibility: 'private',
        },
        'user-alice',
      );
      const projectDoc = await app.projectDocs.createDocument(
        {
          projectId: canonicalProject.project.id,
          title: 'Canonical citation draft',
        },
        'user-alice',
      );

      await expect(
        app.projectDocs.saveDocument(
          {
            citations: [{ paperAssetId: personalOnlyImport.asset.id }],
            content: 'Personal-only citation must not enter project docs.',
            documentId: projectDoc.id,
          },
          'user-alice',
        ),
      ).rejects.toThrow(/not available in project/i);

      const saved = await app.projectDocs.saveDocument(
        {
          citations: [{ paperAssetId: canonicalProjectImport.asset.id }],
          content: 'Canonical project citation is accepted.',
          documentId: projectDoc.id,
        },
        'user-alice',
      );

      expect(canonicalProjectImport.entry).toMatchObject({
        scope: { id: canonicalProject.project.id, type: 'project' },
        spaceId: canonicalSpace.id,
        visibility: 'published_to_project',
      });
      expect(saved.citations[0]?.paperAssetId).toBe(canonicalProjectImport.asset.id);
      expect(saved.document.projectId).toBe(canonicalProject.project.id);

      await app.close();
    } finally {
      rmSync(storageRoot, { force: true, recursive: true });
    }
  });

  it('round-trips structured notebook document content and validates structured references', async () => {
    const storageRoot = createStorageRoot('jixia-notebook-structured-content-');
    const env = createWritingEnv(storageRoot);

    try {
      const app = createWritingTestApp({ env });
      const personalSpace = await app.spaces.createSpace(
        { kind: 'personal', name: 'Structured Notebook Space' },
        'user-alice',
      );
      const imported = await app.imports.importPaper(
        {
          scope: { id: 'user-alice', type: 'user' },
          sourceLocator: '10.1000/notebook-structured-content',
          sourceType: 'doi',
          spaceId: personalSpace.id,
          visibility: 'private',
        },
        'user-alice',
      );
      const notebook = await app.notebooks.createDocument(
        { title: 'Structured Notebook' },
        'user-alice',
      );
      const documentContent: DocumentBlockDocument = {
        blocks: [
          {
            level: 2,
            text: 'Structured notebook evidence',
            type: 'heading',
          },
          {
            text: 'Interpretation stays editable.',
            type: 'paragraph',
          },
          {
            evidenceSpan: 'structured quote',
            libraryEntryId: imported.entry.id,
            locator: 'p. 7',
            paperAssetId: imported.asset.id,
            quote: 'structured quote',
            title: imported.asset.title,
            type: 'sourceExcerpt',
          },
        ],
        schemaVersion: 1,
      };

      await expect(
        app.notebooks.saveDocument(
          {
            citations: [],
            documentContent: {
              blocks: [{ text: 'bad block', type: 'not-a-block' }],
              schemaVersion: 1,
            } as unknown as DocumentBlockDocument,
            documentId: notebook.id,
          },
          'user-alice',
        ),
      ).rejects.toThrow(/supported Jixia document block type/i);
      await expect(
        app.notebooks.saveDocument(
          {
            citations: [],
            documentContent: {
              blocks: [
                {
                  libraryEntryId: imported.entry.id,
                  text: 'quote with incomplete source metadata',
                  type: 'quote',
                },
              ],
              schemaVersion: 1,
            } as unknown as DocumentBlockDocument,
            documentId: notebook.id,
          },
          'user-alice',
        ),
      ).rejects.toThrow(/paperAssetId is required/);
      await expect(
        app.notebooks.saveDocument(
          {
            citations: [],
            documentContent,
            documentId: notebook.id,
          },
          'user-bob',
        ),
      ).rejects.toThrow(/access denied/i);

      const saved = await app.notebooks.saveDocument(
        {
          citations: [],
          documentContent,
          documentId: notebook.id,
        },
        'user-alice',
      );
      const legacyShadowed = await app.notebooks.saveDocument(
        {
          citations: [],
          content: 'Legacy notebook text should be shadowed by structured content.',
          documentContent,
          documentId: notebook.id,
        },
        'user-alice',
      );
      const reloaded = await app.notebooks.getLatestSnapshot(
        { documentId: notebook.id },
        'user-alice',
      );

      expect(saved.documentContent).toEqual(documentContent);
      expect(legacyShadowed.content).toBe(saved.content);
      expect(legacyShadowed.documentContent).toEqual(documentContent);
      expect(reloaded.documentContent).toEqual(documentContent);
      expect(saved.content).toBe(
        [
          '## Structured notebook evidence',
          'Interpretation stays editable.',
          `> structured quote\n\nSource: ${imported.asset.title} (p. 7)`,
        ].join('\n\n'),
      );
      expect(saved.citations).toEqual([
        expect.objectContaining({
          evidenceSpan: 'structured quote',
          paperAssetId: imported.asset.id,
        }),
      ]);
      await app.close();
    } finally {
      rmSync(storageRoot, { force: true, recursive: true });
    }
  });

  it('round-trips structured project docs and rejects inaccessible structured references', async () => {
    const storageRoot = createStorageRoot('jixia-project-doc-structured-content-');
    const env = createWritingEnv(storageRoot);

    try {
      const app = createWritingTestApp({ env });
      const sharedSpace = await app.spaces.createSpace(
        { kind: 'shared', name: 'Structured Project Space' },
        'user-alice',
      );
      const project = await app.projects.createProject(
        { name: 'Structured Project', spaceId: sharedSpace.id },
        'user-alice',
      );
      await app.projects.addProjectMember(
        project.project.id,
        { role: 'viewer', userId: 'user-bob' },
        'user-alice',
      );
      const projectImport = await app.imports.importPaper(
        {
          scope: { id: project.project.id, type: 'project' },
          sourceLocator: '10.1000/project-structured-content',
          sourceType: 'doi',
          spaceId: sharedSpace.id,
          visibility: 'published_to_project',
        },
        'user-alice',
      );
      const personalImport = await app.imports.importPaper(
        {
          scope: { id: 'user-alice', type: 'user' },
          sourceLocator: '10.1000/project-structured-personal-only',
          sourceType: 'doi',
          spaceId: sharedSpace.id,
          visibility: 'private',
        },
        'user-alice',
      );
      const projectDoc = await app.projectDocs.createDocument(
        {
          projectId: project.project.id,
          title: 'Structured Project Draft',
        },
        'user-alice',
      );
      const documentContent: DocumentBlockDocument = {
        blocks: [
          {
            level: 1,
            text: 'Structured Project Draft',
            type: 'heading',
          },
          {
            label: 'Project evidence',
            libraryEntryId: projectImport.entry.id,
            paperAssetId: projectImport.asset.id,
            type: 'citation',
          },
          {
            evidenceSpan: 'project-scoped quote',
            libraryEntryId: projectImport.entry.id,
            paperAssetId: projectImport.asset.id,
            quote: 'project-scoped quote',
            title: projectImport.asset.title,
            type: 'sourceExcerpt',
          },
        ],
        schemaVersion: 1,
      };
      const personalOnlyDocumentContent: DocumentBlockDocument = {
        blocks: [
          {
            evidenceSpan: 'private quote',
            libraryEntryId: personalImport.entry.id,
            paperAssetId: personalImport.asset.id,
            quote: 'private quote',
            type: 'sourceExcerpt',
          },
        ],
        schemaVersion: 1,
      };
      const incompleteQuoteReference: DocumentBlockDocument = {
        blocks: [
          {
            libraryEntryId: personalImport.entry.id,
            text: 'private quote with incomplete source metadata',
            type: 'quote',
          },
        ],
        schemaVersion: 1,
      } as unknown as DocumentBlockDocument;
      const incompleteAiSuggestionReference: DocumentBlockDocument = {
        blocks: [
          {
            libraryEntryId: personalImport.entry.id,
            status: 'proposed',
            text: 'private suggestion with incomplete source metadata',
            type: 'aiSuggestion',
          },
        ],
        schemaVersion: 1,
      } as unknown as DocumentBlockDocument;

      await expect(
        app.projectDocs.saveDocument(
          {
            citations: [],
            documentContent: personalOnlyDocumentContent,
            documentId: projectDoc.id,
          },
          'user-alice',
        ),
      ).rejects.toThrow(/not available in project/i);
      await expect(
        app.projectDocs.saveDocument(
          {
            citations: [],
            documentContent: incompleteQuoteReference,
            documentId: projectDoc.id,
          },
          'user-alice',
        ),
      ).rejects.toThrow(/paperAssetId is required/);
      await expect(
        app.projectDocs.saveDocument(
          {
            citations: [],
            documentContent: incompleteAiSuggestionReference,
            documentId: projectDoc.id,
          },
          'user-alice',
        ),
      ).rejects.toThrow(/paperAssetId is required/);
      await expect(
        app.projectDocs.saveDocument(
          {
            citations: [],
            documentContent,
            documentId: projectDoc.id,
          },
          'user-bob',
        ),
      ).rejects.toThrow(/mutation/i);

      const saved = await app.projectDocs.saveDocument(
        {
          citations: [],
          documentContent,
          documentId: projectDoc.id,
        },
        'user-alice',
      );
      const legacyShadowed = await app.projectDocs.saveDocument(
        {
          citations: [],
          content: 'Legacy project text should be shadowed by structured content.',
          documentContent,
          documentId: projectDoc.id,
        },
        'user-alice',
      );
      const reloaded = await app.projectDocs.getDocument(
        { documentId: projectDoc.id },
        'user-bob',
      );

      expect(saved.documentContent).toEqual(documentContent);
      expect(legacyShadowed.content).toBe(saved.content);
      expect(legacyShadowed.documentContent).toEqual(documentContent);
      expect(reloaded.documentContent).toEqual(documentContent);
      expect(saved.content).toContain('# Structured Project Draft');
      expect(saved.content).toContain('[Citation: Project evidence]');
      expect(saved.citations).toEqual([
        expect.objectContaining({
          evidenceSpan: 'project-scoped quote',
          paperAssetId: projectImport.asset.id,
        }),
      ]);
      await app.close();
    } finally {
      rmSync(storageRoot, { force: true, recursive: true });
    }
  });

  it('reads old plain-text persisted rows as structured legacy documents', async () => {
    const storageRoot = createStorageRoot('jixia-legacy-plain-text-snapshots-');
    const env = createWritingEnv(storageRoot);
    const prisma = createPrismaClient({ url: env.JIXIA_DATABASE_URL });
    const notebookRepository = createNotebookRepository(prisma);
    const projectDocRepository = createProjectDocRepository(prisma);

    try {
      const app = createWritingTestApp({ env });
      const notebook = await app.notebooks.createDocument(
        { title: 'Legacy Plain Notebook' },
        'user-alice',
      );
      await notebookRepository.saveVersion({
        citations: [],
        content: 'Legacy notebook plain text row',
        documentId: notebook.id,
      });

      const sharedSpace = await app.spaces.createSpace(
        { kind: 'shared', name: 'Legacy Plain Project Space' },
        'user-alice',
      );
      const project = await app.projects.createProject(
        { name: 'Legacy Plain Project', spaceId: sharedSpace.id },
        'user-alice',
      );
      const projectDoc = await app.projectDocs.createDocument(
        {
          projectId: project.project.id,
          title: 'Legacy Plain Project Doc',
        },
        'user-alice',
      );
      await projectDocRepository.saveVersion({
        citations: [],
        content: '{"legacy":"json-looking text"}',
        documentId: projectDoc.id,
      });

      const notebookSnapshot = await app.notebooks.getLatestSnapshot(
        { documentId: notebook.id },
        'user-alice',
      );
      const projectSnapshot = await app.projectDocs.getDocument(
        { documentId: projectDoc.id },
        'user-alice',
      );

      expect(notebookSnapshot.content).toBe('Legacy notebook plain text row');
      expectLegacyParagraphDocument(
        notebookSnapshot.documentContent,
        'Legacy notebook plain text row',
      );
      expect(projectSnapshot.content).toBe('{"legacy":"json-looking text"}');
      expectLegacyParagraphDocument(
        projectSnapshot.documentContent,
        '{"legacy":"json-looking text"}',
      );
      await app.close();
    } finally {
      await prisma.$disconnect();
      rmSync(storageRoot, { force: true, recursive: true });
    }
  });

  it('rejects direct asset citations until the asset is adopted by the target project', async () => {
    const storageRoot = createStorageRoot('jixia-project-doc-cross-project-asset-');
    const env = createWritingEnv(storageRoot);

    try {
      const app = createWritingTestApp({ env });
      const targetSpace = await app.spaces.createSpace(
        { kind: 'shared', name: 'Target Citation Space' },
        'user-alice',
      );
      const targetProject = await app.projects.createProject(
        { name: 'Target Citation Project', spaceId: targetSpace.id },
        'user-alice',
      );
      const sourceProject = await app.projects.createProject(
        { name: 'Source Citation Project', spaceId: targetSpace.id },
        'user-alice',
      );
      const sourceProjectImport = await app.imports.importPaper(
        {
          scope: { id: sourceProject.project.id, type: 'project' },
          sourceLocator: '10.1000/shared-cross-project-citation',
          sourceType: 'doi',
          spaceId: targetSpace.id,
          visibility: 'published_to_project',
        },
        'user-alice',
      );
      const personalImport = await app.imports.importPaper(
        {
          scope: { id: 'user-alice', type: 'user' },
          sourceLocator: '10.1000/shared-cross-project-citation',
          sourceType: 'doi',
          spaceId: targetSpace.id,
          visibility: 'private',
        },
        'user-alice',
      );
      const projectDoc = await app.projectDocs.createDocument(
        {
          projectId: targetProject.project.id,
          title: 'Target citation draft',
        },
        'user-alice',
      );

      expect(personalImport.asset.id).toBe(sourceProjectImport.asset.id);
      await expect(
        app.projectDocs.saveDocument(
          {
            citations: [{ paperAssetId: sourceProjectImport.asset.id }],
            content: 'Shared asset is not target-project evidence yet.',
            documentId: projectDoc.id,
          },
          'user-alice',
        ),
      ).rejects.toThrow(/not available in project/i);
      await expect(
        app.projectDocs.saveDocument(
          {
            citations: [{ paperAssetId: sourceProjectImport.entry.id }],
            content: 'Source project entry cannot stand in for target adoption.',
            documentId: projectDoc.id,
          },
          'user-alice',
        ),
      ).rejects.toThrow(/not available in project/i);

      const targetProjectAdoption = await app.library.adoptProjectLibraryEntry({
        actorUserId: 'user-alice',
        projectId: targetProject.project.id,
        sourceLibraryEntryId: personalImport.entry.id,
      });
      const saved = await app.projectDocs.saveDocument(
        {
          citations: [{ paperAssetId: sourceProjectImport.asset.id }],
          content: 'Target project adoption makes the shared asset valid evidence.',
          documentId: projectDoc.id,
        },
        'user-alice',
      );

      expect(targetProjectAdoption.entry.asset.id).toBe(sourceProjectImport.asset.id);
      expect(targetProjectAdoption.entry.entry.scope).toEqual({
        id: targetProject.project.id,
        type: 'project',
      });
      expect(targetProjectAdoption.reused).toBe(false);
      expect(saved.citations[0]?.paperAssetId).toBe(sourceProjectImport.asset.id);

      await app.close();
    } finally {
      rmSync(storageRoot, { force: true, recursive: true });
    }
  });

  it('accepts project-doc citations after explicit project library adoption', async () => {
    const storageRoot = createStorageRoot('jixia-project-doc-adoption-citation-');
    const env = createWritingEnv(storageRoot);

    try {
      const app = createWritingTestApp({ env });
      const targetSpace = await app.spaces.createSpace(
        { kind: 'shared', name: 'Adopted Citation Space' },
        'user-alice',
      );
      const targetProject = await app.projects.createProject(
        { name: 'Adopted Citation Project', spaceId: targetSpace.id },
        'user-alice',
      );
      const personalSource = await app.imports.importPaper(
        {
          scope: { id: 'user-alice', type: 'user' },
          sourceLocator: '10.1000/adopted-project-doc-citation',
          sourceType: 'doi',
          spaceId: targetSpace.id,
          visibility: 'private',
        },
        'user-alice',
      );
      const projectDoc = await app.projectDocs.createDocument(
        {
          projectId: targetProject.project.id,
          title: 'Adopted citation draft',
        },
        'user-alice',
      );

      await expect(
        app.projectDocs.saveDocument(
          {
            citations: [{ paperAssetId: personalSource.asset.id }],
            content: 'Personal-only citation should fail before adoption.',
            documentId: projectDoc.id,
          },
          'user-alice',
        ),
      ).rejects.toThrow(/not available in project/i);

      const adoption = await app.library.adoptProjectLibraryEntry({
        actorUserId: 'user-alice',
        projectId: targetProject.project.id,
        sourceLibraryEntryId: personalSource.entry.id,
      });
      const savedWithAssetId = await app.projectDocs.saveDocument(
        {
          citations: [{ paperAssetId: personalSource.asset.id }],
          content: 'Asset id citation succeeds after project adoption.',
          documentId: projectDoc.id,
        },
        'user-alice',
      );
      const savedWithProjectEntryId = await app.projectDocs.saveDocument(
        {
          citations: [{ paperAssetId: adoption.entry.entry.id }],
          content: 'Project entry id citation also succeeds after adoption.',
          documentId: projectDoc.id,
        },
        'user-alice',
      );

      expect(adoption.entry.entry.scope).toEqual({
        id: targetProject.project.id,
        type: 'project',
      });
      expect(savedWithAssetId.citations[0]?.paperAssetId).toBe(personalSource.asset.id);
      expect(savedWithProjectEntryId.citations[0]?.paperAssetId).toBe(personalSource.asset.id);
      await app.close();
    } finally {
      rmSync(storageRoot, { force: true, recursive: true });
    }
  });

  it('validates explicit and structured project-doc references against target project entries', async () => {
    const storageRoot = createStorageRoot('jixia-project-doc-reference-pairs-');
    const env = createWritingEnv(storageRoot);

    try {
      const app = createWritingTestApp({ env });
      const sharedSpace = await app.spaces.createSpace(
        { kind: 'shared', name: 'Reference Pair Space' },
        'user-alice',
      );
      const targetProject = await app.projects.createProject(
        { name: 'Target Reference Project', spaceId: sharedSpace.id },
        'user-alice',
      );
      const sourceProject = await app.projects.createProject(
        { name: 'Source Reference Project', spaceId: sharedSpace.id },
        'user-alice',
      );
      const targetProjectImport = await app.imports.importPaper(
        {
          scope: { id: targetProject.project.id, type: 'project' },
          sourceLocator: '10.1000/target-reference-entry',
          sourceType: 'doi',
          spaceId: sharedSpace.id,
          visibility: 'published_to_project',
        },
        'user-alice',
      );
      const otherTargetProjectImport = await app.imports.importPaper(
        {
          scope: { id: targetProject.project.id, type: 'project' },
          sourceLocator: '10.1000/other-target-reference-entry',
          sourceType: 'doi',
          spaceId: sharedSpace.id,
          visibility: 'published_to_project',
        },
        'user-alice',
      );
      const sourceProjectImport = await app.imports.importPaper(
        {
          scope: { id: sourceProject.project.id, type: 'project' },
          sourceLocator: '10.1000/source-project-reference-entry',
          sourceType: 'doi',
          spaceId: sharedSpace.id,
          visibility: 'published_to_project',
        },
        'user-alice',
      );
      const projectDoc = await app.projectDocs.createDocument(
        {
          projectId: targetProject.project.id,
          title: 'Reference pair validation draft',
        },
        'user-alice',
      );

      await expect(
        app.projectDocs.saveDocument(
          {
            citations: [
              {
                libraryEntryId: targetProjectImport.entry.id,
                paperAssetId: otherTargetProjectImport.asset.id,
              },
            ],
            content: 'Mismatched explicit project reference should fail.',
            documentId: projectDoc.id,
          },
          'user-alice',
        ),
      ).rejects.toThrow(/does not match library entry/i);
      await expect(
        app.projectDocs.saveDocument(
          {
            citations: [],
            documentContent: {
              blocks: [
                {
                  label: 'Mismatched structured citation',
                  libraryEntryId: targetProjectImport.entry.id,
                  paperAssetId: otherTargetProjectImport.asset.id,
                  type: 'citation',
                },
              ],
              schemaVersion: 1,
            },
            documentId: projectDoc.id,
          },
          'user-alice',
        ),
      ).rejects.toThrow(/does not match library entry/i);
      await expect(
        app.projectDocs.saveDocument(
          {
            citations: [],
            documentContent: {
              blocks: [
                {
                  libraryEntryId: sourceProjectImport.entry.id,
                  paperAssetId: sourceProjectImport.asset.id,
                  quote: 'Source-project evidence cannot stand in for target adoption.',
                  type: 'sourceExcerpt',
                },
              ],
              schemaVersion: 1,
            },
            documentId: projectDoc.id,
          },
          'user-alice',
        ),
      ).rejects.toThrow(/not available in project/i);

      const adoption = await app.library.adoptProjectLibraryEntry({
        actorUserId: 'user-alice',
        projectId: targetProject.project.id,
        sourceLibraryEntryId: sourceProjectImport.entry.id,
      });
      const savedWithStructuredAssetId = await app.projectDocs.saveDocument(
        {
          citations: [],
          documentContent: {
            blocks: [
              {
                paperAssetId: sourceProjectImport.asset.id,
                title: sourceProjectImport.asset.title,
                type: 'paperReference',
              },
            ],
            schemaVersion: 1,
          },
          documentId: projectDoc.id,
        },
        'user-alice',
      );
      const savedWithStructuredTargetEntry = await app.projectDocs.saveDocument(
        {
          citations: [],
          documentContent: {
            blocks: [
              {
                evidenceSpan: 'Adopted project-scoped quote',
                libraryEntryId: adoption.entry.entry.id,
                paperAssetId: sourceProjectImport.asset.id,
                quote: 'Adopted project-scoped quote',
                title: sourceProjectImport.asset.title,
                type: 'sourceExcerpt',
              },
            ],
            schemaVersion: 1,
          },
          documentId: projectDoc.id,
        },
        'user-alice',
      );

      expect(adoption.entry.entry.scope).toEqual({
        id: targetProject.project.id,
        type: 'project',
      });
      expect(savedWithStructuredAssetId.citations).toEqual(
        expect.arrayContaining([
          expect.objectContaining({ paperAssetId: sourceProjectImport.asset.id }),
        ]),
      );
      expect(savedWithStructuredTargetEntry.citations).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            evidenceSpan: 'Adopted project-scoped quote',
            paperAssetId: sourceProjectImport.asset.id,
          }),
        ]),
      );
      await app.close();
    } finally {
      rmSync(storageRoot, { force: true, recursive: true });
    }
  });

  it('ignores legacy server-state writing arrays for new document authority', async () => {
    const storageRoot = createStorageRoot('jixia-legacy-writing-ignore-');
    const statePath = join(storageRoot, 'server-state.json');

    try {
      writeFileSync(
        statePath,
        JSON.stringify(
          {
            citationLinks: [
              {
                docVersionId: 'legacy-version',
                id: 'legacy-citation',
                paperAssetId: 'legacy-asset',
              },
            ],
            docVersions: [
              {
                content: 'legacy content',
                createdAt: '2026-05-05T00:00:00.000Z',
                id: 'legacy-version',
                versionNumber: 1,
                writingDocId: 'legacy-doc',
              },
            ],
            nextSequence: 4,
            writingDocs: [
              {
                createdAt: '2026-05-05T00:00:00.000Z',
                id: 'legacy-doc',
                ownerUserId: 'user-alice',
                publishState: 'draft',
                spaceId: 'space-legacy',
                title: 'Legacy JSON draft',
              },
            ],
          },
          null,
          2,
        ),
      );

      const app = createWritingTestApp({ env: createWritingEnv(storageRoot) });
      const persistedState = readFileSync(statePath, 'utf8');

      expect(persistedState).not.toContain('legacy-doc');
      expect(persistedState).not.toContain('writingDocs');
      expect(persistedState).not.toContain('docVersions');
      expect(persistedState).not.toContain('citationLinks');
      await expect(
        app.notebooks.getDocument({ documentId: 'legacy-doc' }, 'user-alice'),
      ).rejects.toThrow(/does not exist/i);

      const notebook = await app.notebooks.createDocument(
        { title: 'Fresh Notebook' },
        'user-alice',
      );

      expect(notebook.id).not.toBe('legacy-doc');
      await app.close();
    } finally {
      rmSync(storageRoot, { force: true, recursive: true });
    }
  });

  it('promotes persisted workbench artifacts into a project doc draft that reopens after restart', async () => {
    const storageRoot = mkdtempSync(join(tmpdir(), 'jixia-writing-reopen-'));
    const env = createWritingEnv(storageRoot);

    try {
      const app = createWritingTestApp({ env });
      const sharedSpace = await app.spaces.createSpace(
        { kind: 'shared', name: 'Workbench Writer Space' },
        'user-alice',
      );
      const project = await app.projects.createProject(
        { name: 'Tumor Board Writer Project', spaceId: sharedSpace.id },
        'user-alice',
      );
      const imported = await app.imports.importPaper(
        {
          requestedByUserId: 'user-alice',
          scope: { id: project.project.id, type: 'project' },
          sourceLocator: '10.1000/workbench-writer',
          sourceType: 'doi',
          spaceId: sharedSpace.id,
          visibility: 'space_shared',
        },
        'user-alice',
      );
      const document = await app.projectDocs.createDocument(
        {
          projectId: project.project.id,
          title: 'Tumor board literature synthesis',
        },
        'user-alice',
      );

      const savedDocument = await app.projectDocs.saveDocument(
        {
          citations: [
            {
              evidenceSpan: 'Tumor board evidence',
              paperAssetId: imported.asset.id,
            },
          ],
          content: 'Promoted governed insight paragraph.',
          documentId: document.id,
        },
        'user-alice',
      );

      expect(savedDocument.content).toBe('Promoted governed insight paragraph.');
      expect(savedDocument.citations).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            paperAssetId: imported.asset.id,
          }),
        ]),
      );

      await app.close();

      const reopenedApp = createWritingTestApp({ env });
      const reopenedDocument = await reopenedApp.projectDocs.getDocument(
        { documentId: document.id },
        'user-alice',
      );

      expect(reopenedDocument).toMatchObject({
        content: 'Promoted governed insight paragraph.',
        document: {
          id: document.id,
          projectId: project.project.id,
          title: 'Tumor board literature synthesis',
        },
        versionNumber: 1,
      });

      const reopenedSnapshot = await reopenedApp.projectDocs.saveDocument(
        {
          citations: [
            {
              evidenceSpan: 'Tumor board evidence',
              paperAssetId: imported.asset.id,
            },
          ],
          content: 'Reopened writer draft with persisted edits.',
          documentId: document.id,
        },
        'user-alice',
      );

      expect(reopenedSnapshot.versionNumber).toBe(2);
      expect(reopenedSnapshot.content).toBe('Reopened writer draft with persisted edits.');
      await reopenedApp.close();
    } finally {
      rmSync(storageRoot, { force: true, recursive: true });
    }
  });

  it('adopts a private notebook into a versioned project doc with server provenance', async () => {
    const storageRoot = createStorageRoot('jixia-notebook-project-doc-adoption-');
    const env = createWritingEnv(storageRoot);
    const prisma = createPrismaClient({ url: env.JIXIA_DATABASE_URL });
    const spaceRepository = createSpaceRepository(prisma);

    try {
      const app = createWritingTestApp({ env });
      const sharedSpace = await app.spaces.createSpace(
        { kind: 'shared', name: 'Notebook Adoption Space' },
        'user-alice',
      );
      const project = await app.projects.createProject(
        { name: 'Notebook Adoption Project', spaceId: sharedSpace.id },
        'user-alice',
      );
      await app.projects.addProjectMember(
        project.project.id,
        { role: 'editor', userId: 'user-bob' },
        'user-alice',
      );
      await spaceRepository.addMembership(sharedSpace.id, {
        role: 'viewer',
        userId: 'user-charlie',
      });

      const personalSource = await app.imports.importPaper(
        {
          scope: { id: 'user-alice', type: 'user' },
          sourceLocator: '10.1000/notebook-project-adoption',
          sourceType: 'doi',
          spaceId: sharedSpace.id,
          visibility: 'private',
        },
        'user-alice',
      );
      const readerExcerpt = await app.reading.createReaderExcerpt({
        actorUserId: 'user-alice',
        endOffset: 38,
        libraryEntryId: personalSource.entry.id,
        locator: 'p. 9',
        note: 'Alice private reader note must stay private.',
        quote: 'private notebook evidence quote',
        startOffset: 2,
      });
      const notebook = await app.notebooks.createDocument(
        { title: 'Alice Project Continuity Notebook' },
        'user-alice',
      );
      const notebookSnapshot = await app.notebooks.saveDocument(
        {
          citations: [],
          documentContent: {
            blocks: [
              {
                level: 1,
                text: 'Private synthesis for later adoption',
                type: 'heading',
              },
              {
                text: 'Alice private interpretation may be explicitly adopted.',
                type: 'paragraph',
              },
              {
                capturedAt: '2026-05-23T00:00:00.000Z',
                evidenceSpan: 'private notebook evidence quote',
                libraryEntryId: personalSource.entry.id,
                locator: 'p. 9',
                note: 'Private capture note must not leak to project docs.',
                paperAssetId: personalSource.asset.id,
                quote: 'private notebook evidence quote',
                readerExcerptId: readerExcerpt.id,
                title: personalSource.asset.title,
                type: 'sourceExcerpt',
              },
            ],
            schemaVersion: 1,
          },
          documentId: notebook.id,
        },
        'user-alice',
      );
      const projectDoc = await app.projectDocs.createDocument(
        {
          projectId: project.project.id,
          title: 'Shared continuity draft',
        },
        'user-alice',
      );
      const initialProjectSnapshot = await app.projectDocs.saveDocument(
        {
          citations: [],
          content: 'Existing project context remains in history.',
          documentId: projectDoc.id,
        },
        'user-alice',
      );

      await expect(
        app.projectDocs.adoptNotebook(
          { documentId: projectDoc.id, notebookDocumentId: notebook.id },
          'user-bob',
        ),
      ).rejects.toThrow(/notebook document/i);
      await expect(
        app.projectDocs.adoptNotebook(
          { documentId: projectDoc.id, notebookDocumentId: notebook.id },
          'user-charlie',
        ),
      ).rejects.toThrow(/access denied/i);

      const adoption = await app.projectDocs.adoptNotebook(
        { documentId: projectDoc.id, notebookDocumentId: notebook.id },
        'user-alice',
      );
      const projectLibraryEntryId = adoption.provenance.projectLibraryEntryIds[0];
      const projectLibraryEntry = projectLibraryEntryId
        ? await app.library.getEntry({
            actorUserId: 'user-alice',
            entryId: projectLibraryEntryId,
          })
        : null;
      const bobTrace = await app.projectDocs.getCitationTrace(
        { documentId: projectDoc.id },
        'user-bob',
      );
      const serializedAdoption = JSON.stringify(adoption);
      const serializedBobTrace = JSON.stringify(bobTrace);

      expect(initialProjectSnapshot.versionNumber).toBe(1);
      expect(notebookSnapshot.versionNumber).toBe(1);
      expect(adoption.snapshot.versionNumber).toBe(2);
      expect(adoption.snapshot.content).toContain('Existing project context remains in history.');
      expect(adoption.snapshot.content).toContain('Adopted notebook: Alice Project Continuity Notebook');
      expect(adoption.snapshot.content).toContain(`Source Notebook: ${notebook.id}`);
      expect(adoption.snapshot.content).toContain(`Source Notebook version: ${notebookSnapshot.versionNumber}`);
      expect(adoption.snapshot.content).toContain('private notebook evidence quote');
      expect(adoption.snapshot.content).toContain(`Project library entry: ${projectLibraryEntryId}`);
      expect(adoption.snapshot.citations).toEqual([
        expect.objectContaining({
          evidenceSpan: 'private notebook evidence quote',
          paperAssetId: personalSource.asset.id,
          readerExcerptId: readerExcerpt.id,
        }),
      ]);
      expect(adoption.provenance).toMatchObject({
        paperAssetIds: [personalSource.asset.id],
        projectDocId: projectDoc.id,
        projectDocVersionId: adoption.snapshot.versionId,
        projectDocVersionNumber: 2,
        projectId: project.project.id,
        readerExcerptIds: [readerExcerpt.id],
        sourceNotebookDocumentId: notebook.id,
        sourceNotebookVersionId: notebookSnapshot.versionId,
        sourceNotebookVersionNumber: notebookSnapshot.versionNumber,
      });
      expect(projectLibraryEntryId).toBeDefined();
      expect(projectLibraryEntryId).not.toBe(personalSource.entry.id);
      expect(projectLibraryEntry).toMatchObject({
        asset: { id: personalSource.asset.id },
        entry: {
          scope: { id: project.project.id, type: 'project' },
          visibility: 'published_to_project',
        },
      });
      expect(serializedAdoption).not.toContain(`Library entry: ${personalSource.entry.id}`);
      expect(serializedAdoption).not.toContain(personalSource.entry.id);
      expect(adoption.citationTrace.citations[0]).toMatchObject({
        paperAssetId: personalSource.asset.id,
        projectLibraryEntry: {
          libraryEntryId: projectLibraryEntryId,
          projectId: project.project.id,
        },
        readerExcerpt: {
          id: readerExcerpt.id,
          quote: 'private notebook evidence quote',
          source: 'reader_source',
        },
        source: { state: 'available' },
      });
      expect(bobTrace.citations[0]).toMatchObject({
        paperAssetId: personalSource.asset.id,
        projectLibraryEntry: {
          libraryEntryId: projectLibraryEntryId,
          projectId: project.project.id,
        },
        readerExcerpt: {
          quote: 'private notebook evidence quote',
          source: 'project_doc_snapshot',
        },
        source: { state: 'available' },
      });
      expect(serializedAdoption).not.toContain('Private capture note must not leak');
      expect(serializedAdoption).not.toContain('Alice private reader note must stay private');
      expect(serializedBobTrace).not.toContain(personalSource.entry.id);
      expect(serializedBobTrace).not.toContain('Private capture note must not leak');
      expect(serializedBobTrace).not.toContain('Alice private reader note must stay private');
      expect(serializedBobTrace).not.toContain('storageKey');
      expect(serializedBobTrace).not.toContain('checksum');
      expect(serializedBobTrace).not.toContain(storageRoot);

      await app.close();
    } finally {
      await prisma.$disconnect();
      rmSync(storageRoot, { force: true, recursive: true });
    }
  });

});
