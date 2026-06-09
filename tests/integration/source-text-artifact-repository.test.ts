import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  createPrismaClient,
  createReadingRepository,
  initializeReadingPersistence,
  type JixiaPrismaClient,
} from '../../src/db';

interface SourceTextFixture {
  paperAssetId: string;
  prisma: JixiaPrismaClient;
  repository: ReturnType<typeof createReadingRepository>;
  root: string;
}

async function createFixture(): Promise<SourceTextFixture> {
  const root = mkdtempSync(join(tmpdir(), 'jixia-source-text-artifact-repo-'));
  const databaseDir = join(root, 'db');
  mkdirSync(databaseDir, { recursive: true });

  const prisma = createPrismaClient({
    url: `file:${join(databaseDir, 'source-text.db')}`,
  });

  await initializeReadingPersistence(prisma);

  await prisma.user.create({
    data: {
      displayName: 'Source Text User',
      email: 'source-text-user@jixia.local',
      id: 'source-text-user',
    },
  });

  await prisma.paperAsset.create({
    data: {
      canonicalId: 'doi:10.0000/source-text',
      checksum: 'sha256-source-text-secret',
      id: 'paper-source-text',
      importedByUserId: 'source-text-user',
      sourceLocator: 'https://example.test/source-text.pdf',
      sourceType: 'external_url',
      storageKey: 'papers/source-text.pdf',
      title: 'Source text fixture',
    },
  });

  return {
    paperAssetId: 'paper-source-text',
    prisma,
    repository: createReadingRepository(prisma),
    root,
  };
}

async function disposeFixture(fixture: SourceTextFixture): Promise<void> {
  await fixture.prisma.$disconnect();
  rmSync(fixture.root, { force: true, recursive: true });
}

describe('source text artifact repository', () => {
  it('persists server-owned artifact refs while returning safe metadata records', async () => {
    const fixture = await createFixture();

    try {
      const availableArtifact = await fixture.repository.createSourceTextArtifact({
        artifactRef: 'storage/source-text/paper.txt',
        availabilityState: 'available',
        characterCount: 4200,
        createdAt: '2026-06-09T00:00:00.000Z',
        id: 'source-artifact-available',
        kind: 'extracted_text',
        language: 'en',
        pageCount: 12,
        paperAssetId: fixture.paperAssetId,
        statusDetail: 'Extracted from uploaded PDF',
        textFormat: 'text/plain',
      });

      expect(availableArtifact).toEqual({
        availabilityState: 'available',
        characterCount: 4200,
        createdAt: '2026-06-09T00:00:00.000Z',
        id: 'source-artifact-available',
        kind: 'extracted_text',
        language: 'en',
        pageCount: 12,
        paperAssetId: fixture.paperAssetId,
        statusDetail: 'Extracted from uploaded PDF',
        textFormat: 'text/plain',
        updatedAt: expect.any(String),
      });
      expect(availableArtifact).not.toHaveProperty('artifactRef');

      const safePayload = JSON.stringify(availableArtifact);
      expect(safePayload).not.toContain('artifactRef');
      expect(safePayload).not.toContain('storage/source-text/paper.txt');
      expect(safePayload).not.toContain('papers/source-text.pdf');
      expect(safePayload).not.toContain('sha256-source-text-secret');
      expect(safePayload).not.toContain('storageKey');
      expect(safePayload).not.toContain('checksum');

      const storedArtifact = await fixture.prisma.sourceTextArtifact.findUnique({
        where: { id: 'source-artifact-available' },
      });
      expect(storedArtifact?.artifactRef).toBe('storage/source-text/paper.txt');
    } finally {
      await disposeFixture(fixture);
    }
  });

  it('round trips explicit degraded availability states without fake source text', async () => {
    const fixture = await createFixture();

    try {
      const availableArtifact = await fixture.repository.createSourceTextArtifact({
        artifactRef: 'storage/source-text/paper.txt',
        availabilityState: 'available',
        createdAt: '2026-06-09T00:00:00.000Z',
        id: 'source-artifact-available',
        kind: 'extracted_text',
        paperAssetId: fixture.paperAssetId,
        textFormat: 'text/plain',
      });
      const degradedArtifact = await fixture.repository.createSourceTextArtifact({
        availabilityState: 'ocr_required',
        createdAt: '2026-06-09T00:01:00.000Z',
        id: 'source-artifact-ocr-required',
        kind: 'ocr_text',
        paperAssetId: fixture.paperAssetId,
        statusDetail: 'OCR required before exact quote attachment',
      });

      expect(degradedArtifact).toMatchObject({
        availabilityState: 'ocr_required',
        id: 'source-artifact-ocr-required',
        kind: 'ocr_text',
        paperAssetId: fixture.paperAssetId,
        statusDetail: 'OCR required before exact quote attachment',
      });
      expect(degradedArtifact).not.toHaveProperty('artifactRef');
      expect(degradedArtifact).not.toHaveProperty('text');
      expect(degradedArtifact).not.toHaveProperty('quote');
      expect(degradedArtifact).not.toHaveProperty('body');

      await expect(
        fixture.repository.getSourceTextArtifact('missing-source-artifact'),
      ).resolves.toBeNull();
      await expect(
        fixture.repository.getSourceTextArtifact('source-artifact-ocr-required'),
      ).resolves.toEqual(degradedArtifact);

      const allArtifacts = await fixture.repository.listSourceTextArtifactsForPaperAsset({
        paperAssetId: fixture.paperAssetId,
      });
      expect(allArtifacts.map((artifact) => artifact.id)).toEqual([
        availableArtifact.id,
        degradedArtifact.id,
      ]);
      expect(JSON.stringify(allArtifacts)).not.toContain('storage/source-text/paper.txt');
      expect(JSON.stringify(allArtifacts)).not.toContain('artifactRef');

      const ocrArtifacts = await fixture.repository.listSourceTextArtifactsForPaperAsset({
        kind: 'ocr_text',
        paperAssetId: fixture.paperAssetId,
      });
      expect(ocrArtifacts).toEqual([degradedArtifact]);
    } finally {
      await disposeFixture(fixture);
    }
  });
});
