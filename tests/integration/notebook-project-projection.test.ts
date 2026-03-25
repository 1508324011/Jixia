import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { describe, expect, it } from 'vitest';

import { createJixiaApp } from '../../src/server/app';
import { createHttpServer } from '../../src/server/http-server';

async function listenOnEphemeralPort(server: ReturnType<typeof createHttpServer>['server']) {
  await new Promise<void>((resolve, reject) => {
    server.once('error', reject);
    server.listen(0, '127.0.0.1', () => {
      server.off('error', reject);
      resolve();
    });
  });

  const address = server.address();

  if (!address || typeof address === 'string') {
    throw new Error('Expected server to listen on a TCP address');
  }

  return `http://127.0.0.1:${address.port}`;
}

async function closeServer(server: ReturnType<typeof createHttpServer>['server']) {
  await new Promise<void>((resolve, reject) => {
    server.close((error) => {
      if (error) {
        reject(error);
        return;
      }

      resolve();
    });
  });
}

describe('notebook project projection', () => {
  it('exposes notebook summaries and notebook detail routes without leaking private note bodies', async () => {
    const storageRoot = mkdtempSync(join(tmpdir(), 'jixia-notebook-routes-'));

    try {
      const seededApp = createJixiaApp({ env: { JIXIA_STORAGE_ROOT: storageRoot } });
      const sharedSpace = await seededApp.spaces.createSpace(
        { kind: 'shared', name: 'Notebook Route Space' },
        'user-alice',
      );
      const imported = await seededApp.imports.importPaper({
        requestedByUserId: 'user-alice',
        sourceLocator: '654321',
        sourceType: 'pmid',
        spaceId: sharedSpace.id,
        visibility: 'space_shared',
      });
      await seededApp.reading.createWorkbenchNote({
        authorUserId: 'user-alice',
        body: 'Notebook detail should not expose this body on the summary route.',
        libraryEntryId: imported.entry.id,
        visibility: 'private',
      });
      const notebook = await seededApp.notebook.getNotebookForLibraryEntry({
        libraryEntryId: imported.entry.id,
        ownerUserId: 'user-alice',
      });
      await seededApp.writing.saveProjectDocument({
        actorSpaceId: sharedSpace.id,
        actorUserId: 'user-alice',
        citations: [{ paperAssetId: imported.asset.id }],
        content: 'Shared writer draft before notebook relaunch.',
        projectId: 'tumor-board',
        spaceId: sharedSpace.id,
        title: 'Tumor board literature synthesis',
      });

      const httpServer = createHttpServer({
        env: {
          JIXIA_HOST: '127.0.0.1',
          JIXIA_STORAGE_ROOT: storageRoot,
        },
      });

      try {
        const baseUrl = await listenOnEphemeralPort(httpServer.server);
        const listResponse = await fetch(`${baseUrl}/api/notebooks?userId=user-alice`);
        const listBody = await listResponse.json();
        const detailResponse = await fetch(`${baseUrl}/api/notebooks/${notebook.id}?userId=user-alice`);
        const detailBody = await detailResponse.json();

        expect(listResponse.status).toBe(200);
        expect(listBody.notebooks).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              notebookId: notebook.id,
              notesPath: `/notebooks/${notebook.id}`,
              readerPath: `/projects/tumor-board/library/${imported.entry.id}/reader?spaceId=${sharedSpace.id}`,
              title: 'Tumor board synthesis notebook',
            }),
          ]),
        );
        expect(detailResponse.status).toBe(200);
        expect(detailBody.notebook).toEqual(
          expect.objectContaining({
            notebookId: notebook.id,
            entryId: imported.entry.id,
            workspacePath: `/projects/tumor-board?spaceId=${sharedSpace.id}`,
          }),
        );
        expect(JSON.stringify(listBody)).not.toContain(
          'Notebook detail should not expose this body on the summary route.',
        );
        expect(JSON.stringify(detailBody)).not.toContain(
          'Notebook detail should not expose this body on the summary route.',
        );
      } finally {
        await closeServer(httpServer.server);
      }
    } finally {
      rmSync(storageRoot, { force: true, recursive: true });
    }
  });

  it('creates project references without exposing notebook bodies and surfaces them in project docs', async () => {
    const storageRoot = mkdtempSync(join(tmpdir(), 'jixia-notebook-projection-'));

    try {
      const seededApp = createJixiaApp({ env: { JIXIA_STORAGE_ROOT: storageRoot } });
      const sharedSpace = await seededApp.spaces.createSpace(
        { kind: 'shared', name: 'Projection Review Space' },
        'user-alice',
      );
      const imported = await seededApp.imports.importToPersonalLibrary({
        requestedByUserId: 'user-alice',
        sourceLocator: '654321',
        sourceType: 'pmid',
      });

      await seededApp.reading.createWorkbenchNote({
        authorUserId: 'user-alice',
        body: 'Private note body that must stay in the notebook only.',
        libraryEntryId: imported.entry.id,
        visibility: 'private',
      });

      const notebook = await seededApp.notebook.getNotebookForLibraryEntry({
        libraryEntryId: imported.entry.id,
        ownerUserId: 'user-alice',
      });
      const [note] = await seededApp.notebook.listNotes({
        libraryEntryId: imported.entry.id,
        ownerUserId: 'user-alice',
      });
      const savedDocument = await seededApp.writing.saveProjectDocument({
        actorSpaceId: sharedSpace.id,
        actorUserId: 'user-alice',
        citations: [{ paperAssetId: imported.asset.id }],
        content: 'Shared writer draft before projection.',
        projectId: 'project-1',
        spaceId: sharedSpace.id,
        title: 'Tumor board literature synthesis',
      });

      const httpServer = createHttpServer({
        env: {
          JIXIA_HOST: '127.0.0.1',
          JIXIA_STORAGE_ROOT: storageRoot,
        },
      });

      try {
        const baseUrl = await listenOnEphemeralPort(httpServer.server);
        const response = await fetch(
          `${baseUrl}/api/projects/project-1/docs/${savedDocument.documentId}/references`,
          {
          body: JSON.stringify({
            noteId: note.id,
            notebookId: notebook.id,
            paperAssetId: imported.asset.id,
            selectedText: 'Important excerpt',
            spaceId: sharedSpace.id,
            sourceType: 'notebook-note',
            userId: 'user-alice',
          }),
          headers: { 'Content-Type': 'application/json' },
          method: 'POST',
          },
        );
        const body = await response.json();

        const writerResponse = await fetch(
          `${baseUrl}/api/writing/${sharedSpace.id}/projects/project-1/document?userId=user-alice`,
        );
        const writerBody = await writerResponse.json();

        expect(response.status).toBe(201);
        expect(body.reference.ownerType).toBe('project');
        expect(body.reference.documentId).toBe(savedDocument.documentId);
        expect(body.reference.sourceKind).toBe('projection');
        expect(body.reference).not.toHaveProperty('notebookBody');
        expect(writerResponse.status).toBe(200);
        expect(writerBody.document.references).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              documentId: savedDocument.documentId,
              id: body.reference.id,
              ownerType: 'project',
              paperAssetId: imported.asset.id,
              projectId: 'project-1',
              selectedText: 'Important excerpt',
              sourceKind: 'projection',
              sourceType: 'notebook-note',
            }),
          ]),
        );
        expect(JSON.stringify(writerBody.document.references)).not.toContain(
          'Private note body that must stay in the notebook only.',
        );
      } finally {
        await closeServer(httpServer.server);
      }
    } finally {
      rmSync(storageRoot, { force: true, recursive: true });
    }
  });

  it('rejects project-reference creation when the explicit caller identity lacks target-space access', async () => {
    const storageRoot = mkdtempSync(join(tmpdir(), 'jixia-notebook-projection-access-'));

    try {
      const seededApp = createJixiaApp({ env: { JIXIA_STORAGE_ROOT: storageRoot } });
      const bobImported = await seededApp.imports.importToPersonalLibrary({
        requestedByUserId: 'user-bob',
        sourceLocator: '777888',
        sourceType: 'pmid',
      });

      await seededApp.reading.createWorkbenchNote({
        authorUserId: 'user-bob',
        body: 'Bob-owned private note excerpt.',
        libraryEntryId: bobImported.entry.id,
        visibility: 'private',
      });

      const bobNotebook = await seededApp.notebook.getNotebookForLibraryEntry({
        libraryEntryId: bobImported.entry.id,
        ownerUserId: 'user-bob',
      });
      const [bobNote] = await seededApp.notebook.listNotes({
        libraryEntryId: bobImported.entry.id,
        ownerUserId: 'user-bob',
      });
      const bobSharedSpace = await seededApp.spaces.createSpace(
        { kind: 'shared', name: 'Bob Review Space' },
        'user-bob',
      );
      const savedDocument = await seededApp.writing.saveProjectDocument({
        actorSpaceId: bobSharedSpace.id,
        actorUserId: 'user-bob',
        citations: [{ paperAssetId: bobImported.asset.id }],
        content: 'Bob-only writer draft before projection.',
        projectId: 'project-2',
        spaceId: bobSharedSpace.id,
        title: 'Bob review synthesis',
      });

      const httpServer = createHttpServer({
        env: {
          JIXIA_HOST: '127.0.0.1',
          JIXIA_STORAGE_ROOT: storageRoot,
        },
      });

      try {
        const baseUrl = await listenOnEphemeralPort(httpServer.server);
        const response = await fetch(
          `${baseUrl}/api/projects/project-2/docs/${savedDocument.documentId}/references`,
          {
            body: JSON.stringify({
              noteId: bobNote.id,
              notebookId: bobNotebook.id,
              paperAssetId: bobImported.asset.id,
              selectedText: 'Bob-only excerpt',
              spaceId: bobSharedSpace.id,
              sourceType: 'notebook-note',
              userId: 'user-alice',
            }),
            headers: { 'Content-Type': 'application/json' },
            method: 'POST',
          },
        );

        expect(response.status).toBe(403);
        expect(await response.json()).toEqual({
          error: 'Access denied for the requested space resource.',
        });
      } finally {
        await closeServer(httpServer.server);
      }
    } finally {
      rmSync(storageRoot, { force: true, recursive: true });
    }
  });
});
