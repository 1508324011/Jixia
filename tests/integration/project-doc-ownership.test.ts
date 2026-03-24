import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { describe, expect, it } from 'vitest';

import type { JixiaAppState } from '../../src/server/app';
import { createJixiaApp } from '../../src/server/app';

describe('project doc ownership', () => {
  it('stores project docs as project-owned shared documents', async () => {
    const storageRoot = mkdtempSync(join(tmpdir(), 'jixia-project-doc-ownership-'));

    try {
      const app = createJixiaApp({ env: { JIXIA_STORAGE_ROOT: storageRoot } });
      const sharedSpace = await app.spaces.createSpace(
        { kind: 'shared', name: 'Project Docs Space' },
        'user-alice',
      );
      const imported = await app.imports.importPaper({
        requestedByUserId: 'user-alice',
        sourceLocator: '10.1000/project-doc-ownership',
        sourceType: 'doi',
        spaceId: sharedSpace.id,
        visibility: 'space_shared',
      });

      const savedDocument = await app.writing.saveProjectDocument({
        actorSpaceId: sharedSpace.id,
        actorUserId: 'user-alice',
        citations: [{ paperAssetId: imported.asset.id }],
        content: 'Shared project content',
        projectId: 'project-1',
        spaceId: sharedSpace.id,
        title: 'Protocol Draft',
      });

      expect(savedDocument.ownerType).toBe('project');
      expect(savedDocument.projectId).toBe('project-1');

      await app.reading.createWorkbenchNote({
        authorUserId: 'user-alice',
        body: 'Notebook-only rationale that must not appear in project docs.',
        libraryEntryId: imported.entry.id,
        visibility: 'private',
      });

      const notebook = await app.notebook.getNotebookForLibraryEntry({
        libraryEntryId: imported.entry.id,
        ownerUserId: 'user-alice',
      });
      const [note] = await app.notebook.listNotes({
        libraryEntryId: imported.entry.id,
        ownerUserId: 'user-alice',
      });

      const projectedReference = await app.projectProjection.createReference({
        actorSpaceId: sharedSpace.id,
        actorUserId: 'user-alice',
        docId: savedDocument.documentId,
        noteId: note.id,
        notebookId: notebook.id,
        paperAssetId: imported.asset.id,
        projectId: 'project-1',
        selectedText: 'Board-ready projected quote',
        sourceType: 'notebook-note',
      });

      const statePath = join(storageRoot, 'server-state.json');
      const savedState = JSON.parse(readFileSync(statePath, 'utf8')) as JixiaAppState;

      savedState.memberships.push({
        joinedAt: new Date().toISOString(),
        role: 'editor',
        spaceId: sharedSpace.id,
        userId: 'user-bob',
      });
      writeFileSync(statePath, JSON.stringify(savedState, null, 2));

      const reopenedApp = createJixiaApp({ env: { JIXIA_STORAGE_ROOT: storageRoot } });
      const reopenedDocument = await reopenedApp.writing.getDocument({
        actorSpaceId: sharedSpace.id,
        actorUserId: 'user-bob',
        projectId: 'project-1',
        spaceId: sharedSpace.id,
      });

      expect(reopenedDocument).toMatchObject({
        documentId: savedDocument.documentId,
        ownerType: 'project',
        projectId: 'project-1',
        spaceId: sharedSpace.id,
        title: 'Protocol Draft',
      });
      expect(reopenedDocument?.latestSnapshot?.content).toBe('Shared project content');
      expect(reopenedDocument?.references).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            documentId: savedDocument.documentId,
            id: projectedReference.id,
            ownerType: 'project',
            projectId: 'project-1',
            selectedText: 'Board-ready projected quote',
            sourceKind: 'projection',
            sourceType: 'notebook-note',
          }),
        ]),
      );
      expect(JSON.stringify(reopenedDocument)).not.toContain(
        'Notebook-only rationale that must not appear in project docs.',
      );

      const persistedState = JSON.parse(readFileSync(statePath, 'utf8')) as JixiaAppState;

      expect(persistedState.writingDocs).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            id: savedDocument.documentId,
            ownerType: 'project',
            projectId: 'project-1',
            spaceId: sharedSpace.id,
          }),
        ]),
      );
      expect(persistedState.writingDocs).not.toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            id: savedDocument.documentId,
            ownerUserId: 'user-alice',
          }),
        ]),
      );
      expect(persistedState.projectDocumentPresences).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            activeDocumentId: savedDocument.documentId,
            projectId: 'project-1',
            userId: 'user-bob',
          }),
        ]),
      );
      expect(persistedState.projectReferences).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            documentId: savedDocument.documentId,
            id: projectedReference.id,
            ownerType: 'project',
            projectId: 'project-1',
            selectedText: 'Board-ready projected quote',
            sourceKind: 'projection',
          }),
        ]),
      );
    } finally {
      rmSync(storageRoot, { force: true, recursive: true });
    }
  });

  it('rejects projecting notebook notes into a project document space the note owner cannot access', async () => {
    const storageRoot = mkdtempSync(join(tmpdir(), 'jixia-project-doc-space-enforcement-'));

    try {
      const app = createJixiaApp({ env: { JIXIA_STORAGE_ROOT: storageRoot } });
      const imported = await app.imports.importToPersonalLibrary({
        requestedByUserId: 'user-alice',
        sourceLocator: '10.1000/project-doc-space-enforcement',
        sourceType: 'doi',
      });

      await app.reading.createWorkbenchNote({
        authorUserId: 'user-alice',
        body: 'Notebook material that cannot cross into an unrelated shared space.',
        libraryEntryId: imported.entry.id,
        visibility: 'private',
      });

      const notebook = await app.notebook.getNotebookForLibraryEntry({
        libraryEntryId: imported.entry.id,
        ownerUserId: 'user-alice',
      });
      const [note] = await app.notebook.listNotes({
        libraryEntryId: imported.entry.id,
        ownerUserId: 'user-alice',
      });
      const bobSharedSpace = await app.spaces.createSpace(
        { kind: 'shared', name: 'Bob Review Space' },
        'user-bob',
      );
      const savedDocument = await app.writing.saveProjectDocument({
        actorSpaceId: bobSharedSpace.id,
        actorUserId: 'user-bob',
        citations: [{ paperAssetId: imported.asset.id }],
        content: 'Bob-owned shared writer draft',
        projectId: 'project-2',
        spaceId: bobSharedSpace.id,
        title: 'Restricted protocol draft',
      });

      await expect(
        app.projectProjection.createReference({
          actorSpaceId: bobSharedSpace.id,
          actorUserId: 'user-alice',
          docId: savedDocument.documentId,
          noteId: note.id,
          notebookId: notebook.id,
          paperAssetId: imported.asset.id,
          projectId: 'project-2',
          selectedText: 'Alice cannot project this into Bob’s space.',
          sourceType: 'notebook-note',
        }),
      ).rejects.toThrow('Access denied for the requested space resource.');
    } finally {
      rmSync(storageRoot, { force: true, recursive: true });
    }
  });
});
