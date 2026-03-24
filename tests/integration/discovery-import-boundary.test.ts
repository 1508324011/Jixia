import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { describe, expect, it } from 'vitest';

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

describe('discovery import boundary', () => {
  it('keeps discovery candidates outside inventory until explicit import', async () => {
    const storageRoot = mkdtempSync(join(tmpdir(), 'jixia-discovery-import-boundary-'));
    const httpServer = createHttpServer({
      env: {
        JIXIA_HOST: '127.0.0.1',
        JIXIA_STORAGE_ROOT: storageRoot,
      },
    });

    try {
      const baseUrl = await listenOnEphemeralPort(httpServer.server);
      const search = await fetch(`${baseUrl}/api/discovery/search?q=${encodeURIComponent('oncology')}`);
      const searchBody = await search.json();
      const candidate = searchBody.boards[0].items[0];

      expect(candidate.objectType).toBe('external-candidate');
      expect(candidate.state).toBe('new');

      const imported = await fetch(`${baseUrl}/api/discovery/import`, {
        body: JSON.stringify({ candidateId: candidate.id }),
        headers: { 'Content-Type': 'application/json' },
        method: 'POST',
      });
      const importedBody = await imported.json();

      expect(imported.status).toBe(201);
      expect(importedBody.importMapping.libraryEntryId).toEqual(expect.any(String));
      expect(importedBody.importMapping.candidateId).toBe(candidate.id);
    } finally {
      await closeServer(httpServer.server);
      rmSync(storageRoot, { force: true, recursive: true });
    }
  });
});
