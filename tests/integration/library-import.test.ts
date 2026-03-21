import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { describe, expect, it } from 'vitest';

import { createJixiaApp } from '../../src/server/app';

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

      const storedEntry = await app.library.getEntry(firstImported.entry.id);
      expect(storedEntry).toMatchObject({
        asset: { canonicalId: 'doi:10.1000/jixia-demo' },
        entry: { id: firstImported.entry.id, spaceId: sharedSpace.id },
      });
    } finally {
      rmSync(storageRoot, { recursive: true, force: true });
    }
  });
});
