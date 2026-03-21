import { describe, expect, it } from 'vitest';

import { createJixiaApp } from '../../src/server/app';

describe('writing versioning', () => {
  it('creates document snapshots with citation links', async () => {
    const app = createJixiaApp();
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
      ownerUserId: 'user-alice',
      spaceId: sharedSpace.id,
      title: 'Shared Draft',
    });

    expect(doc.publishState).toBe('draft');

    const firstSnapshot = await app.writing.saveDocument({
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
      docId: doc.id,
      publishState: 'review',
    });

    expect(reviewed.publishState).toBe('review');
    expect(imported.asset.canonicalId).toBe('doi:10.1000/writing-demo');
  });
});
