import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { describe, expect, it } from 'vitest';

import { createJixiaApp } from '../../src/server/app';

describe('reading evidence', () => {
  it('stores evidence links with generated insights', async () => {
    const storageRoot = mkdtempSync(join(tmpdir(), 'jixia-reading-evidence-'));

    try {
      const app = createJixiaApp({ env: { JIXIA_STORAGE_ROOT: storageRoot } });
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

      const detail = await app.reading.getDetail({
        actorSpaceId: aliceShared.id,
        actorUserId: 'user-alice',
        libraryEntryId: imported.entry.id,
      });
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

      const updatedDetail = await app.reading.getDetail({
        actorSpaceId: aliceShared.id,
        actorUserId: 'user-alice',
        libraryEntryId: imported.entry.id,
      });
      expect(updatedDetail?.notes).toHaveLength(1);
      expect(updatedDetail?.insights).toHaveLength(1);
      expect(updatedDetail?.insights[0].summary).toContain('shared review');
    } finally {
      rmSync(storageRoot, { force: true, recursive: true });
    }
  });

  it('reopens private notes, shared comments, and governed insights for the workbench reader', async () => {
    const storageRoot = mkdtempSync(join(tmpdir(), 'jixia-reading-reopen-'));

    try {
      const app = createJixiaApp({ env: { JIXIA_STORAGE_ROOT: storageRoot } });
      const imported = await app.imports.importToPersonalLibrary({
        requestedByUserId: 'user-alice',
        sourceLocator: '654321',
        sourceType: 'pmid',
      });

      await app.reading.createWorkbenchNote({
        authorUserId: 'user-alice',
        body: 'Private note for later synthesis.',
        libraryEntryId: imported.entry.id,
        visibility: 'private',
      });
      await app.reading.createWorkbenchNote({
        authorUserId: 'user-alice',
        body: 'Project-visible comment for the tumor board.',
        libraryEntryId: imported.entry.id,
        visibility: 'space_shared',
      });
      await app.reading.saveWorkbenchGeneratedInsight({
        evidenceSpans: [
          {
            endOffset: 24,
            quote: 'Tumor board evidence',
            startOffset: 0,
          },
        ],
        libraryEntryId: imported.entry.id,
        startedByUserId: 'user-alice',
        summary: 'Governed insight ready for Writer promotion.',
        title: 'Tumor board governed insight',
      });

      const persistedState = JSON.parse(
        readFileSync(join(storageRoot, 'server-state.json'), 'utf8'),
      ) as {
        notebookNotes: Array<{ text: string }>;
        notes: Array<{ body: string; visibility: string }>;
      };

      expect(persistedState.notebookNotes).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            text: 'Private note for later synthesis.',
          }),
        ]),
      );
      expect(persistedState.notes).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            body: 'Project-visible comment for the tumor board.',
            visibility: 'space_shared',
          }),
        ]),
      );
      expect(
        persistedState.notes.some((note) => note.body === 'Private note for later synthesis.'),
      ).toBe(false);

      const reopenedApp = createJixiaApp({ env: { JIXIA_STORAGE_ROOT: storageRoot } });
      const reopenedDetail = await reopenedApp.reading.getWorkbenchDetail({
        actorUserId: 'user-alice',
        libraryEntryId: imported.entry.id,
      });

      expect(reopenedDetail?.notes).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            body: 'Private note for later synthesis.',
            visibility: 'private',
          }),
          expect.objectContaining({
            body: 'Project-visible comment for the tumor board.',
            visibility: 'space_shared',
          }),
        ]),
      );
      expect(reopenedDetail?.insights).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            summary: 'Governed insight ready for Writer promotion.',
          }),
        ]),
      );
    } finally {
      rmSync(storageRoot, { force: true, recursive: true });
    }
  });
});
