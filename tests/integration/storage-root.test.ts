import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { describe, expect, it } from 'vitest';

import {
  createPaperExtractedTextStorageKey,
  createPaperPdfStorageKey,
  toAssetStorageKey,
} from '../../src/server/storage/asset-key';
import {
  resolveStoragePath,
  resolveStorageRoot,
} from '../../src/server/storage/storage-root';

describe('asset storage keys', () => {
  it('resolves the storage root under the configured environment path', () => {
    const root = mkdtempSync(join(tmpdir(), 'jixia-storage-root-'));

    try {
      expect(resolveStorageRoot({ JIXIA_STORAGE_ROOT: root })).toBe(root);
      expect(
        resolveStoragePath('papers/demo.pdf', { JIXIA_STORAGE_ROOT: root }),
      ).toBe(join(root, 'papers/demo.pdf'));
    } finally {
      rmSync(root, { recursive: true, force: true });
    }
  });

  it('returns relative storage keys for paper assets', () => {
    expect(createPaperPdfStorageKey('asset-demo')).toBe(
      'papers/asset-demo/paper.pdf',
    );
    expect(createPaperExtractedTextStorageKey('asset-demo')).toBe(
      'papers/asset-demo/extracted.txt',
    );
    expect(toAssetStorageKey('papers/demo.pdf')).toBe('papers/demo.pdf');
  });

  it('rejects absolute and traversing host paths', () => {
    expect(() => toAssetStorageKey('/tmp/demo.pdf')).toThrow(
      /relative storage key/i,
    );
    expect(() => toAssetStorageKey('../demo.pdf')).toThrow(
      /relative storage key/i,
    );
    expect(() => toAssetStorageKey('papers/../../demo.pdf')).toThrow(
      /relative storage key/i,
    );
    expect(() =>
      resolveStoragePath('papers/../../demo.pdf', {
        JIXIA_STORAGE_ROOT: mkdtempSync(join(tmpdir(), 'jixia-storage-root-')),
      }),
    ).toThrow(/relative storage key|storage root/i);
  });
});
