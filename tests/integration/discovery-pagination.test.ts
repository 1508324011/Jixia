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

describe('discovery pagination', () => {
  it('returns stable page metadata and distinct result slices for discovery search', async () => {
    const storageRoot = mkdtempSync(join(tmpdir(), 'jixia-discovery-pagination-'));
    const httpServer = createHttpServer({
      env: {
        JIXIA_HOST: '127.0.0.1',
        JIXIA_STORAGE_ROOT: storageRoot,
      },
    });

    try {
      const baseUrl = await listenOnEphemeralPort(httpServer.server);
      const pageOneResponse = await fetch(
        `${baseUrl}/api/discovery/search?q=${encodeURIComponent('tumor board')}&page=1&pageSize=2`,
      );
      const pageTwoResponse = await fetch(
        `${baseUrl}/api/discovery/search?q=${encodeURIComponent('tumor board')}&page=2&pageSize=2`,
      );

      expect(pageOneResponse.status).toBe(200);
      expect(pageTwoResponse.status).toBe(200);

      const pageOne = await pageOneResponse.json();
      const pageTwo = await pageTwoResponse.json();

      expect(pageOne.page).toBe(1);
      expect(pageOne.pageSize).toBe(2);
      expect(pageOne.total).toBeGreaterThan(2);
      expect(pageOne.hasNextPage).toBe(true);
      expect(pageOne.query).toBe('tumor board');
      expect(pageOne.items).toHaveLength(2);
      expect(pageTwo.page).toBe(2);
      expect(pageTwo.pageSize).toBe(2);
      expect(pageTwo.total).toBe(pageOne.total);
      expect(pageTwo.query).toBe('tumor board');
      expect(pageTwo.items).toHaveLength(2);

      const pageOneIds = new Set(pageOne.items.map((item: { id: string }) => item.id));

      expect(pageTwo.items.every((item: { id: string }) => !pageOneIds.has(item.id))).toBe(true);
      expect(pageOne.boards.length).toBeGreaterThan(0);
      expect(pageTwo.boards.length).toBeGreaterThan(0);
    } finally {
      await closeServer(httpServer.server);
      rmSync(storageRoot, { force: true, recursive: true });
    }
  });
});
