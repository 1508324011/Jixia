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
  it('creates project references without exposing notebook bodies', async () => {
    const storageRoot = mkdtempSync(join(tmpdir(), 'jixia-notebook-projection-'));

    try {
      const seededApp = createJixiaApp({ env: { JIXIA_STORAGE_ROOT: storageRoot } });
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

      const httpServer = createHttpServer({
        env: {
          JIXIA_HOST: '127.0.0.1',
          JIXIA_STORAGE_ROOT: storageRoot,
        },
      });

      try {
        const baseUrl = await listenOnEphemeralPort(httpServer.server);
        const response = await fetch(`${baseUrl}/api/projects/project-1/docs/doc-1/references`, {
          body: JSON.stringify({
            noteId: note.id,
            notebookId: notebook.id,
            paperAssetId: imported.asset.id,
            selectedText: 'Important excerpt',
            sourceType: 'notebook-note',
          }),
          headers: { 'Content-Type': 'application/json' },
          method: 'POST',
        });
        const body = await response.json();

        expect(response.status).toBe(201);
        expect(body.reference.ownerType).toBe('project');
        expect(body.reference.sourceKind).toBe('projection');
        expect(body.reference).not.toHaveProperty('notebookBody');
      } finally {
        await closeServer(httpServer.server);
      }
    } finally {
      rmSync(storageRoot, { force: true, recursive: true });
    }
  });
});
