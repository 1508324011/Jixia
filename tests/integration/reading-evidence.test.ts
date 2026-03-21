import { describe, expect, it } from 'vitest';

import { createJixiaApp } from '../../src/server/app';

describe('reading evidence', () => {
  it('stores evidence links with generated insights', async () => {
    const app = createJixiaApp();
    const aliceShared = await app.spaces.createSpace(
      { kind: 'shared', name: 'Alice Shared' },
      'user-alice',
    );
    const bobPersonal = await app.spaces.createSpace(
      { kind: 'personal', name: 'Bob Personal' },
      'user-bob',
    );
    const imported = await app.imports.importPaper({
      requestedByUserId: 'user-alice',
      sourceLocator: '10.1000/reading-demo',
      sourceType: 'doi',
      spaceId: aliceShared.id,
      visibility: 'space_shared',
    });

    const detail = await app.reading.getDetail(imported.entry.id);
    expect(detail?.entry.id).toBe(imported.entry.id);
    expect(detail?.asset.canonicalId).toBe('doi:10.1000/reading-demo');

    await expect(
      app.reading.createNote({
        actorSpaceId: bobPersonal.id,
        authorUserId: 'user-bob',
        body: 'This should not be visible here.',
        libraryEntryId: imported.entry.id,
        visibility: 'space_shared',
      }),
    ).rejects.toThrow(/access denied/i);

    const note = await app.reading.createNote({
      actorSpaceId: aliceShared.id,
      authorUserId: 'user-alice',
      body: 'This paper matters for the shared review.',
      libraryEntryId: imported.entry.id,
      visibility: 'space_shared',
    });

    expect(note.libraryEntryId).toBe(imported.entry.id);

    const insight = await app.reading.saveGeneratedInsight({
      actorSpaceId: aliceShared.id,
      evidenceSpans: [
        {
          endOffset: 18,
          quote: 'shared review data',
          startOffset: 0,
        },
      ],
      libraryEntryId: imported.entry.id,
      startedByUserId: 'user-alice',
      summary: 'The imported paper supports the shared review workflow.',
      title: 'AI summary',
    });

    expect(insight.evidenceSpans[0].paperAssetId).toBe(imported.asset.id);

    const updatedDetail = await app.reading.getDetail(imported.entry.id);
    expect(updatedDetail?.notes).toHaveLength(1);
    expect(updatedDetail?.insights).toHaveLength(1);
    expect(updatedDetail?.insights[0].summary).toContain('shared review');
  });
});
