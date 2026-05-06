import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { describe, expect, it } from 'vitest';

import { createPrismaClient, createSpaceRepository } from '../../src/db';
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
      const project = await app.projects.createProject(
        { name: 'Alice Reading Project', spaceId: aliceShared.id },
        'user-alice',
      );
      const bobPersonal = await app.spaces.createSpace(
        { kind: 'personal', name: 'Bob Personal' },
        'user-bob',
      );
      const imported = await app.imports.importPaper({
        scope: { id: project.project.id, type: 'project' },
        requestedByUserId: 'user-alice',
        sourceLocator: '10.1000/reading-demo',
        sourceType: 'doi',
        spaceId: aliceShared.id,
        visibility: 'space_shared',
      }, 'user-alice');

      const detail = await app.reading.getDetail({
        actorSpaceId: aliceShared.id,
        actorUserId: 'user-alice',
        libraryEntryId: imported.entry.id,
      });
      expect(detail?.entry.id).toBe(imported.entry.id);
      expect(detail?.asset.canonicalId).toBe('doi:10.1000/reading-demo');

      await expect(
        app.reading.createNote({
          actorUserId: 'user-bob',
          actorSpaceId: bobPersonal.id,
          authorUserId: 'user-bob',
          body: 'This should not be visible here.',
          libraryEntryId: imported.entry.id,
          visibility: 'space_shared',
        }),
      ).rejects.toThrow(/access denied/i);

      const note = await app.reading.createNote({
        actorUserId: 'user-alice',
        actorSpaceId: aliceShared.id,
        authorUserId: 'user-alice',
        body: 'This paper matters for the shared review.',
        libraryEntryId: imported.entry.id,
        visibility: 'space_shared',
      });

      expect(note.libraryEntryId).toBe(imported.entry.id);

      const insight = await app.reading.saveGeneratedInsight({
        actorUserId: 'user-alice',
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

  it('authorizes reading flows through persisted space memberships without legacy mirrors', async () => {
    const storageRoot = mkdtempSync(join(tmpdir(), 'jixia-reading-prisma-space-'));
    const databaseUrl = `file:${join(storageRoot, 'jixia-reading-space.db')}`;
    const env = {
      JIXIA_DATABASE_URL: databaseUrl,
      JIXIA_STORAGE_ROOT: storageRoot,
    };
    const prisma = createPrismaClient({ url: databaseUrl });
    const repository = createSpaceRepository(prisma);

    try {
      const persistedSpace = await repository.createSpace(
        { id: 'space-reading', kind: 'shared', name: 'Persisted Reading Space' },
        'user-alice',
      );
      const app = createJixiaApp({ env });
      const project = await app.projects.createProject(
        { name: 'Persisted Reading Project', spaceId: persistedSpace.id },
        'user-alice',
      );
      const imported = await app.imports.importPaper(
        {
          scope: { id: project.project.id, type: 'project' },
          requestedByUserId: 'user-alice',
          sourceLocator: '10.1000/persisted-reading',
          sourceType: 'doi',
          spaceId: persistedSpace.id,
          visibility: 'space_shared',
        },
        'user-alice',
      );

      const detail = await app.reading.getDetail({
        actorSpaceId: persistedSpace.id,
        actorUserId: 'user-alice',
        libraryEntryId: imported.entry.id,
      });

      expect(detail?.entry.id).toBe(imported.entry.id);

      const note = await app.reading.createNote({
        actorSpaceId: persistedSpace.id,
        actorUserId: 'user-alice',
        body: 'Repository-backed access works.',
        libraryEntryId: imported.entry.id,
        visibility: 'space_shared',
      });

      expect(note.authorUserId).toBe('user-alice');

      await expect(
        app.reading.getDetail({
          actorSpaceId: persistedSpace.id,
          actorUserId: 'user-charlie',
          libraryEntryId: imported.entry.id,
        }),
      ).rejects.toThrow(/access denied/i);
    } finally {
      await prisma.$disconnect().catch(() => undefined);
      rmSync(storageRoot, { force: true, recursive: true });
    }
  });

  it('reopens private notes, shared comments, and governed insights for the workbench reader', async () => {
    const storageRoot = mkdtempSync(join(tmpdir(), 'jixia-reading-reopen-'));
    const env = {
      JIXIA_DATABASE_URL: `file:${join(storageRoot, 'jixia-reading-reopen.db')}`,
      JIXIA_STORAGE_ROOT: storageRoot,
    };

    try {
      const app = createJixiaApp({ env });
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

      const reopenedApp = createJixiaApp({ env });
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
