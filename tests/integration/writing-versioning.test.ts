import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { describe, expect, it } from 'vitest';

import { createJixiaApp } from '../../src/server/app';

describe('writing versioning', () => {
  it('creates document snapshots with citation links', async () => {
    const storageRoot = mkdtempSync(join(tmpdir(), 'jixia-writing-versioning-'));

    try {
      const app = createJixiaApp({ env: { JIXIA_STORAGE_ROOT: storageRoot } });
      const sharedSpace = await app.spaces.createSpace(
        { kind: 'shared', name: 'Writing Space' },
        'user-alice',
      );
      const imported = await app.imports.importPaper({
        requestedByUserId: 'user-alice',
        sourceLocator: '10.1000/writing-demo',
        sourceType: 'doi',
        spaceId: sharedSpace.id,
        visibility: 'space_shared',
      });

      const doc = await app.writing.createDocument({
        actorSpaceId: sharedSpace.id,
        actorUserId: 'user-alice',
        ownerUserId: 'user-alice',
        spaceId: sharedSpace.id,
        title: 'Shared Draft',
      });

      expect(doc.publishState).toBe('draft');

      const firstSnapshot = await app.writing.saveDocument({
        actorSpaceId: sharedSpace.id,
        actorUserId: 'user-alice',
        citations: [
          {
            evidenceSpan: 'section 1',
            paperAssetId: imported.asset.id,
          },
        ],
        content: 'Version one content',
        docId: doc.id,
      });
      const secondSnapshot = await app.writing.saveDocument({
        actorSpaceId: sharedSpace.id,
        actorUserId: 'user-alice',
        citations: [
          {
            evidenceSpan: 'section 2',
            paperAssetId: imported.asset.id,
          },
        ],
        content: 'Version two content',
        docId: doc.id,
      });

      expect(firstSnapshot.docVersionId).not.toBe(secondSnapshot.docVersionId);
      expect(secondSnapshot.citations).toHaveLength(1);
      expect(secondSnapshot.citations[0].paperAssetId).toBe(imported.asset.id);

      const reviewed = await app.writing.transitionPublishState({
        actorSpaceId: sharedSpace.id,
        actorUserId: 'user-alice',
        docId: doc.id,
        publishState: 'review',
      });

      expect(reviewed.publishState).toBe('review');
      expect(imported.asset.canonicalId).toBe('doi:10.1000/writing-demo');
    } finally {
      rmSync(storageRoot, { force: true, recursive: true });
    }
  });

  it('promotes persisted workbench artifacts into a writer draft that reopens after restart', async () => {
    const storageRoot = mkdtempSync(join(tmpdir(), 'jixia-writing-reopen-'));

    try {
      const app = createJixiaApp({ env: { JIXIA_STORAGE_ROOT: storageRoot } });
      const imported = await app.imports.importToPersonalLibrary({
        requestedByUserId: 'user-alice',
        sourceLocator: '654321',
        sourceType: 'pmid',
      });

      const savedDocument = await app.writing.saveProjectDocument({
        actorSpaceId: imported.entry.spaceId,
        actorUserId: 'user-alice',
        citations: [
          {
            evidenceSpan: 'Tumor board evidence',
            paperAssetId: imported.asset.id,
          },
        ],
        content: 'Promoted governed insight paragraph.',
        projectId: 'project-1',
        spaceId: imported.entry.spaceId,
        title: 'Tumor board literature synthesis',
      });

      expect(savedDocument.latestSnapshot?.content).toBe('Promoted governed insight paragraph.');

      const reopenedApp = createJixiaApp({ env: { JIXIA_STORAGE_ROOT: storageRoot } });
      const reopenedDocument = await reopenedApp.writing.getDocument({
        actorSpaceId: imported.entry.spaceId,
        actorUserId: 'user-alice',
        projectId: 'project-1',
        spaceId: imported.entry.spaceId,
      });

      expect(reopenedDocument).toMatchObject({
        documentId: expect.any(String),
        projectId: 'project-1',
        spaceId: imported.entry.spaceId,
        title: 'Tumor board literature synthesis',
      });
      expect(reopenedDocument?.latestSnapshot?.content).toBe(
        'Promoted governed insight paragraph.',
      );
      expect(reopenedDocument?.latestSnapshot?.citations).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            paperAssetId: imported.asset.id,
          }),
        ]),
      );
    } finally {
      rmSync(storageRoot, { force: true, recursive: true });
    }
  });
});
