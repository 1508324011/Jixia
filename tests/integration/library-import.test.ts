import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { describe, expect, it } from 'vitest';

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

  it('supports one workbench discovery-to-personal-library slice', async () => {
    const storageRoot = mkdtempSync(join(tmpdir(), 'jixia-workbench-library-import-'));

    try {
      const app = createJixiaApp({
        connectors: {
          pubmed: createStubPubmedConnector(),
        },
        env: { JIXIA_STORAGE_ROOT: storageRoot },
      });

      const discovered = await app.imports.searchDiscovery('tumor board biomarkers');

      expect(discovered).toHaveLength(1);
      expect(discovered[0]).toMatchObject({
        canonicalId: 'pmid:654321',
        sourceLocator: '654321',
        sourceType: 'pmid',
        title: 'Tumor board biomarkers for rapid review',
      });

      const imported = await app.imports.importToPersonalLibrary({
        requestedByUserId: 'user-alice',
        sourceLocator: discovered[0].sourceLocator,
        sourceType: discovered[0].sourceType,
      });

      expect(imported.asset.canonicalId).toBe('pmid:654321');
      expect(imported.entry.visibility).toBe('private');

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
});
