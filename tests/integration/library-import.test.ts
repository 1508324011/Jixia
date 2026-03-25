import { mkdtempSync, rmSync } from 'node:fs';
import type { AddressInfo } from 'node:net';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { describe, expect, it } from 'vitest';

import type { PubmedConnector } from '../../src/server/connectors/pubmed.connector';
import { createJixiaApp } from '../../src/server/app';
import { createHttpServer } from '../../src/server/http-server';

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
          objectType: 'external-candidate',
          reason: 'PubMed query matched tumor-board biomarker curation work.',
          sourceLabel: 'PubMed',
          sourceLocator: '654321',
          sourceType: 'pmid',
          state: 'new',
          title: 'Tumor board biomarkers for rapid review',
        },
      ];
    },
  };
}

async function withServer(storageRoot: string, run: (baseUrl: string) => Promise<void>): Promise<void> {
  const httpServer = createHttpServer({
    env: {
      JIXIA_DATABASE_URL: `file:${join(storageRoot, 'jixia-library-http.db')}`,
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
  }
}

describe('library import', () => {
  it('creates asset and entry separately', async () => {
    const storageRoot = mkdtempSync(join(tmpdir(), 'jixia-library-import-'));

    try {
      const app = createJixiaApp({ env: { JIXIA_STORAGE_ROOT: storageRoot } });
      const sharedSpace = await app.spaces.createSpace(
        { kind: 'shared', name: 'Shared Space' },
        'user-alice',
      );
      const reviewSpace = await app.spaces.createSpace(
        { kind: 'shared', name: 'Review Space' },
        'user-alice',
      );

      const uploaded = await app.imports.uploadPdf({
        pdfContents: '%PDF-1.4 demo paper',
        requestedByUserId: 'user-alice',
        spaceId: sharedSpace.id,
        visibility: 'private',
      });

      expect(uploaded.asset.storageKey).toMatch(/^papers\/.+\/paper\.pdf$/);
      expect(uploaded.entry.paperAssetId).toBe(uploaded.asset.id);

      const firstImported = await app.imports.importPaper({
        requestedByUserId: 'user-alice',
        sourceLocator: '10.1000/jixia-demo',
        sourceType: 'doi',
        spaceId: sharedSpace.id,
        visibility: 'space_shared',
      });
      const secondImported = await app.imports.importPaper({
        requestedByUserId: 'user-alice',
        sourceLocator: '10.1000/jixia-demo',
        sourceType: 'doi',
        spaceId: reviewSpace.id,
        visibility: 'space_shared',
      });
      const arxivImported = await app.imports.importPaper({
        requestedByUserId: 'user-alice',
        sourceLocator: '2401.00001',
        sourceType: 'arxiv',
        spaceId: sharedSpace.id,
        visibility: 'space_shared',
      });

      expect(firstImported.asset.id).toBe(secondImported.asset.id);
      expect(firstImported.entry.id).not.toBe(secondImported.entry.id);
      expect(firstImported.entry.spaceId).toBe(sharedSpace.id);
      expect(secondImported.entry.spaceId).toBe(reviewSpace.id);
      expect(arxivImported.asset.canonicalId).toBe('arxiv:2401.00001');

      const storedEntry = await app.library.getEntry({
        actorSpaceId: sharedSpace.id,
        actorUserId: 'user-alice',
        entryId: firstImported.entry.id,
      });
      expect(storedEntry).toMatchObject({
        asset: { canonicalId: 'doi:10.1000/jixia-demo' },
        entry: { id: firstImported.entry.id, spaceId: sharedSpace.id },
      });
    } finally {
      rmSync(storageRoot, { recursive: true, force: true });
    }
  });

  it('supports one workbench discovery-candidate-to-personal-library slice', async () => {
    const storageRoot = mkdtempSync(join(tmpdir(), 'jixia-workbench-library-import-'));

    try {
      const app = createJixiaApp({
        connectors: {
          arxiv: {
            async lookup(locator) {
              return {
                abstractText: `External arXiv abstract for ${locator}`,
                canonicalId: `arxiv:${locator}`,
                title: `Imported arXiv paper ${locator}`,
              };
            },
            async search() {
              return [];
            },
          },
          biorxiv: {
            async search() {
              return [];
            },
          },
          openalex: {
            async search() {
              return [];
            },
          },
          pubmed: createStubPubmedConnector(),
        },
        env: { JIXIA_STORAGE_ROOT: storageRoot },
      });

      const discovered = await app.imports.searchDiscovery('tumor board biomarkers');

      expect(discovered).toHaveLength(1);
      expect(discovered[0]).toMatchObject({
        canonicalId: 'pmid:654321',
        objectType: 'external-candidate',
        sourceLocator: '654321',
        sourceType: 'pmid',
        state: 'new',
        title: 'Tumor board biomarkers for rapid review',
      });

      const imported = await app.imports.importDiscoveryCandidate({
        candidateId: discovered[0].id,
        requestedByUserId: 'user-alice',
      });

      expect(imported.asset.canonicalId).toBe('pmid:654321');
      expect(imported.entry.visibility).toBe('private');
      expect(imported.importMapping).toMatchObject({
        candidateId: discovered[0].id,
        libraryEntryId: imported.entry.id,
      });

      const personalEntries = await app.library.listPersonalEntries('user-alice');

      expect(personalEntries).toHaveLength(1);
      expect(personalEntries[0]).toMatchObject({
        asset: {
          canonicalId: 'pmid:654321',
          title: 'Imported PMID paper 654321',
        },
        entry: {
          visibility: 'private',
        },
      });
    } finally {
      rmSync(storageRoot, { recursive: true, force: true });
    }
  });

  it('exposes richer personal library metadata for inventory triage over HTTP', async () => {
    const storageRoot = mkdtempSync(join(tmpdir(), 'jixia-library-inventory-http-'));

    try {
      await withServer(storageRoot, async (baseUrl) => {
        const importResponse = await fetch(`${baseUrl}/api/library/personal/import`, {
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

        const response = await fetch(`${baseUrl}/api/library/personal`);

        expect(response.status).toBe(200);

        const result = (await response.json()) as {
          entries: Array<{
            abstractText?: string;
            addedAt: string;
            canonicalId: string;
            createdAt?: string;
            sourceLabel?: string;
            sourceType?: string;
            title: string;
          }>;
        };

        expect(result.entries).toContainEqual(
          expect.objectContaining({
            canonicalId: 'pmid:654321',
            sourceLabel: 'PubMed',
            sourceType: 'pmid',
            title: 'Imported PMID paper 654321',
          }),
        );
        expect(result.entries[0]?.abstractText).toContain('Imported PMID metadata');
        expect(result.entries[0]?.createdAt).toBeTruthy();
        expect(result.entries[0]?.addedAt).toBeTruthy();
      });
    } finally {
      rmSync(storageRoot, { recursive: true, force: true });
    }
  });
});
