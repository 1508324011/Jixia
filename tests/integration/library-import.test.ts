import { existsSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { describe, expect, it } from 'vitest';

import { createPrismaClient, createSpaceRepository } from '../../src/db';
import type { PubmedConnector } from '../../src/server/connectors/pubmed.connector';
import { createJixiaApp } from '../../src/server/app';

function createLibraryEnv(storageRoot: string) {
  return {
    JIXIA_DATABASE_URL: `file:${join(storageRoot, 'jixia-library.db')}`,
    JIXIA_STORAGE_ROOT: storageRoot,
  };
}

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
      const app = createJixiaApp({
        connectors: {
          pubmed: createStubPubmedConnector(),
        },
        env: createLibraryEnv(storageRoot),
      });
      const sharedSpace = await app.spaces.createSpace(
        { kind: 'shared', name: 'Shared Space' },
        'user-alice',
      );
      const project = await app.projects.createProject(
        { name: 'Shared Review', spaceId: sharedSpace.id },
        'user-alice',
      );

      const uploaded = await app.imports.uploadPdf({
        pdfContents: '%PDF-1.4 demo paper',
        scope: { id: 'user-alice', type: 'user' },
        requestedByUserId: 'user-alice',
        spaceId: sharedSpace.id,
        visibility: 'private',
      }, 'user-alice');

      const storedPdfPath = join(storageRoot, 'papers', uploaded.asset.id, 'paper.pdf');

      expect(uploaded.asset).not.toHaveProperty('storageKey');
      expect(existsSync(storedPdfPath)).toBe(true);
      expect(readFileSync(storedPdfPath, 'utf8')).toBe('%PDF-1.4 demo paper');
      expect(uploaded.entry.paperAssetId).toBe(uploaded.asset.id);
      expect(uploaded.entry.scope).toEqual({ id: 'user-alice', type: 'user' });

      const firstImported = await app.imports.importPaper({
        scope: { id: project.project.id, type: 'project' },
        requestedByUserId: 'user-alice',
        sourceLocator: '10.1000/jixia-demo',
        sourceType: 'doi',
        spaceId: sharedSpace.id,
        visibility: 'space_shared',
      }, 'user-alice');
      const secondImported = await app.imports.importPaper({
        scope: { id: 'user-alice', type: 'user' },
        requestedByUserId: 'user-alice',
        sourceLocator: '10.1000/jixia-demo',
        sourceType: 'doi',
        spaceId: sharedSpace.id,
        visibility: 'private',
      }, 'user-alice');
      const arxivImported = await app.imports.importPaper({
        scope: { id: project.project.id, type: 'project' },
        requestedByUserId: 'user-alice',
        sourceLocator: '2401.00001',
        sourceType: 'arxiv',
        spaceId: sharedSpace.id,
        visibility: 'space_shared',
      }, 'user-alice');

      expect(firstImported.asset.id).toBe(secondImported.asset.id);
      expect(firstImported.entry.id).not.toBe(secondImported.entry.id);
      expect(firstImported.entry.spaceId).toBe(sharedSpace.id);
      expect(firstImported.entry.scope).toEqual({
        id: project.project.id,
        type: 'project',
      });
      expect(secondImported.entry.scope).toEqual({ id: 'user-alice', type: 'user' });
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

      const duplicateProjectImport = await app.imports.importPaper({
        scope: { id: project.project.id, type: 'project' },
        requestedByUserId: 'user-alice',
        sourceLocator: '10.1000/jixia-demo',
        sourceType: 'doi',
        spaceId: sharedSpace.id,
        visibility: 'published_to_project',
      }, 'user-alice');

      expect(duplicateProjectImport.entry.id).toBe(firstImported.entry.id);
    } finally {
      rmSync(storageRoot, { recursive: true, force: true });
    }
  }, 20_000);

  it('uses project membership instead of stale legacy space mirrors for project library reads', async () => {
    const storageRoot = mkdtempSync(join(tmpdir(), 'jixia-library-prisma-space-'));
    const databaseUrl = `file:${join(storageRoot, 'jixia-library-space.db')}`;
    const env = {
      JIXIA_DATABASE_URL: databaseUrl,
      JIXIA_STORAGE_ROOT: storageRoot,
    };
    const prisma = createPrismaClient({ url: databaseUrl });
    const repository = createSpaceRepository(prisma);

    try {
      const persistedSpace = await repository.createSpace(
        { id: 'space-persisted', kind: 'shared', name: 'Persisted Space' },
        'user-alice',
      );
      const app = createJixiaApp({ env });
      const project = await app.projects.createProject(
        { name: 'Persisted Library Project', spaceId: persistedSpace.id },
        'user-alice',
      );

      const imported = await app.imports.importPaper(
        {
          scope: { id: project.project.id, type: 'project' },
          requestedByUserId: 'user-alice',
          sourceLocator: '10.1000/persisted-library',
          sourceType: 'doi',
          spaceId: persistedSpace.id,
          visibility: 'space_shared',
        },
        'user-alice',
      );

      const listed = await app.library.listEntries({
        actorSpaceId: persistedSpace.id,
        actorUserId: 'user-alice',
        scope: { id: project.project.id, type: 'project' },
        spaceId: persistedSpace.id,
      });

      expect(listed.map((entry) => entry.entry.id)).toContain(imported.entry.id);

      await expect(
        app.imports.importPaper(
          {
            scope: { id: project.project.id, type: 'project' },
            requestedByUserId: 'user-charlie',
            sourceLocator: '10.1000/stale-membership-denied',
            sourceType: 'doi',
            spaceId: persistedSpace.id,
            visibility: 'space_shared',
          },
          'user-charlie',
        ),
      ).rejects.toThrow(/access denied/i);

      await expect(
        app.library.listEntries({
          actorSpaceId: persistedSpace.id,
          actorUserId: 'user-charlie',
          scope: { id: project.project.id, type: 'project' },
          spaceId: persistedSpace.id,
        }),
      ).rejects.toThrow(/access denied/i);
    } finally {
      await prisma.$disconnect().catch(() => undefined);
      rmSync(storageRoot, { recursive: true, force: true });
    }
  });

  it('ignores stale legacy space and membership mirrors for import and library authority', async () => {
    const storageRoot = mkdtempSync(join(tmpdir(), 'jixia-library-stale-space-'));
    const databaseUrl = `file:${join(storageRoot, 'jixia-library-stale.db')}`;
    const env = {
      JIXIA_DATABASE_URL: databaseUrl,
      JIXIA_STORAGE_ROOT: storageRoot,
    };
    const prisma = createPrismaClient({ url: databaseUrl });
    const repository = createSpaceRepository(prisma);

    try {
      const persistedSpace = await repository.createSpace(
        { id: 'space-authoritative', kind: 'shared', name: 'Authoritative Space' },
        'user-alice',
      );
      const appForProject = createJixiaApp({ env });
      const project = await appForProject.projects.createProject(
        { name: 'Authoritative Project', spaceId: persistedSpace.id },
        'user-alice',
      );
      await prisma.$disconnect().catch(() => undefined);
      const now = new Date().toISOString();

      writeFileSync(
        join(storageRoot, 'server-state.json'),
        JSON.stringify(
          {
            memberships: [
              {
                joinedAt: now,
                role: 'viewer',
                spaceId: persistedSpace.id,
                userId: 'user-charlie',
              },
              {
                joinedAt: now,
                role: 'viewer',
                spaceId: 'space-json-only',
                userId: 'user-alice',
              },
            ],
            spaces: [
              {
                createdAt: now,
                id: persistedSpace.id,
                kind: 'shared',
                name: 'Legacy Authoritative Mirror',
                ownerUserId: 'user-alice',
              },
              {
                createdAt: now,
                id: 'space-json-only',
                kind: 'shared',
                name: 'JSON-only Space',
                ownerUserId: 'user-alice',
              },
            ],
          },
          null,
          2,
        ),
      );

      const app = createJixiaApp({ env });

      await expect(
        app.imports.importPaper(
          {
            scope: { id: project.project.id, type: 'project' },
            requestedByUserId: 'user-charlie',
            sourceLocator: '10.1000/stale-json-membership',
            sourceType: 'doi',
            spaceId: persistedSpace.id,
            visibility: 'space_shared',
          },
          'user-charlie',
        ),
      ).rejects.toThrow(/access denied/i);

      await expect(
        app.library.listEntries({
          actorSpaceId: persistedSpace.id,
          actorUserId: 'user-charlie',
          scope: { id: project.project.id, type: 'project' },
          spaceId: persistedSpace.id,
        }),
      ).rejects.toThrow(/access denied/i);

      await expect(
        app.imports.importPaper(
          {
            scope: { id: 'project-json-only', type: 'project' },
            requestedByUserId: 'user-alice',
            sourceLocator: '10.1000/stale-json-space',
            sourceType: 'doi',
            spaceId: 'space-json-only',
            visibility: 'space_shared',
          },
          'user-alice',
        ),
      ).rejects.toThrow(/project project-json-only does not exist/i);
    } finally {
      await prisma.$disconnect().catch(() => undefined);
      rmSync(storageRoot, { recursive: true, force: true });
    }
  });

  it('preserves scoped library entries across app restarts and ignores stale json authority', async () => {
    const storageRoot = mkdtempSync(join(tmpdir(), 'jixia-library-restart-scope-'));
    const env = createLibraryEnv(storageRoot);

    try {
      const firstApp = createJixiaApp({ env });
      const space = await firstApp.spaces.createSpace(
        { kind: 'shared', name: 'Restart Library Space' },
        'user-alice',
      );
      const project = await firstApp.projects.createProject(
        { name: 'Restart Library Project', spaceId: space.id },
        'user-alice',
      );
      await firstApp.projects.addProjectMember(
        project.project.id,
        { role: 'viewer', userId: 'user-bob' },
        'user-alice',
      );

      const personalImport = await firstApp.imports.importPaper(
        {
          scope: { id: 'user-alice', type: 'user' },
          requestedByUserId: 'user-alice',
          sourceLocator: '10.1000/restart-scoped',
          sourceType: 'doi',
          spaceId: space.id,
          visibility: 'private',
        },
        'user-alice',
      );
      const projectImport = await firstApp.imports.importPaper(
        {
          scope: { id: project.project.id, type: 'project' },
          requestedByUserId: 'user-alice',
          sourceLocator: '10.1000/restart-scoped',
          sourceType: 'doi',
          spaceId: space.id,
          visibility: 'published_to_project',
        },
        'user-alice',
      );

      expect(projectImport.asset.id).toBe(personalImport.asset.id);
      expect(projectImport.entry.id).not.toBe(personalImport.entry.id);

      writeFileSync(
        join(storageRoot, 'server-state.json'),
        JSON.stringify(
          {
            libraryEntries: [],
            paperAssets: [],
          },
          null,
          2,
        ),
      );

      const secondApp = createJixiaApp({ env });
      const bobProjectEntries = await secondApp.library.listEntries({
        actorSpaceId: space.id,
        actorUserId: 'user-bob',
        scope: { id: project.project.id, type: 'project' },
        spaceId: space.id,
      });
      const alicePersonalEntries = await secondApp.library.listEntries({
        actorUserId: 'user-alice',
        scope: { id: 'user-alice', type: 'user' },
        spaceId: '',
      });

      expect(bobProjectEntries.map((entry) => entry.entry.id)).toContain(
        projectImport.entry.id,
      );
      expect(alicePersonalEntries.map((entry) => entry.entry.id)).toContain(
        personalImport.entry.id,
      );
      await expect(
        secondApp.library.listEntries({
          actorUserId: 'user-bob',
          scope: { id: 'user-alice', type: 'user' },
          spaceId: '',
        }),
      ).rejects.toThrow(/access denied/i);
    } finally {
      rmSync(storageRoot, { recursive: true, force: true });
    }
  }, 10_000);

  it('adopts a readable source into a project library idempotently without copying private state', async () => {
    const storageRoot = mkdtempSync(join(tmpdir(), 'jixia-library-adoption-service-'));
    const env = createLibraryEnv(storageRoot);

    try {
      const app = createJixiaApp({ env });
      const sharedSpace = await app.spaces.createSpace(
        { kind: 'shared', name: 'Adoption Space' },
        'user-alice',
      );
      const targetProject = await app.projects.createProject(
        { name: 'Target Adoption Project', spaceId: sharedSpace.id },
        'user-alice',
      );
      const otherProject = await app.projects.createProject(
        { name: 'Other Adoption Project', spaceId: sharedSpace.id },
        'user-alice',
      );
      const concurrentProject = await app.projects.createProject(
        { name: 'Concurrent Adoption Project', spaceId: sharedSpace.id },
        'user-alice',
      );
      await app.projects.addProjectMember(
        targetProject.project.id,
        { role: 'editor', userId: 'user-bob' },
        'user-alice',
      );
      await app.projects.addProjectMember(
        targetProject.project.id,
        { role: 'viewer', userId: 'user-charlie' },
        'user-alice',
      );

      const personalImport = await app.imports.importPaper(
        {
          scope: { id: 'user-alice', type: 'user' },
          sourceLocator: '10.1000/adopt-personal-source',
          sourceType: 'doi',
          spaceId: sharedSpace.id,
          visibility: 'private',
        },
        'user-alice',
      );
      const privateNote = await app.reading.createNote({
        actorUserId: 'user-alice',
        body: 'Private reading state must stay on the source entry.',
        libraryEntryId: personalImport.entry.id,
      });
      await app.reading.saveGeneratedInsight({
        actorUserId: 'user-alice',
        evidenceSpans: [
          {
            endOffset: 12,
            quote: 'Private insight quote',
            startOffset: 0,
          },
        ],
        libraryEntryId: personalImport.entry.id,
        summary: 'Private generated insight must stay on the source entry.',
        title: 'Private adoption source insight',
      });

      const firstAdoption = await app.library.adoptProjectLibraryEntry({
        actorUserId: 'user-alice',
        projectId: targetProject.project.id,
        sourceLibraryEntryId: personalImport.entry.id,
      });
      const repeatedAdoption = await app.library.adoptProjectLibraryEntry({
        actorUserId: 'user-alice',
        projectId: targetProject.project.id,
        sourceLibraryEntryId: personalImport.entry.id,
      });
      const otherProjectAdoption = await app.library.adoptProjectLibraryEntry({
        actorUserId: 'user-alice',
        projectId: otherProject.project.id,
        sourceLibraryEntryId: personalImport.entry.id,
      });
      const concurrentAdoptions = await Promise.all([
        app.library.adoptProjectLibraryEntry({
          actorUserId: 'user-alice',
          projectId: concurrentProject.project.id,
          sourceLibraryEntryId: personalImport.entry.id,
        }),
        app.library.adoptProjectLibraryEntry({
          actorUserId: 'user-alice',
          projectId: concurrentProject.project.id,
          sourceLibraryEntryId: personalImport.entry.id,
        }),
      ]);

      expect(firstAdoption).toMatchObject({
        entry: {
          asset: {
            canonicalId: 'doi:10.1000/adopt-personal-source',
            id: personalImport.asset.id,
          },
          entry: {
            paperAssetId: personalImport.asset.id,
            scope: { id: targetProject.project.id, type: 'project' },
            scopeId: targetProject.project.id,
            scopeType: 'project',
            spaceId: sharedSpace.id,
            visibility: 'published_to_project',
          },
        },
        reused: false,
      });
      expect(firstAdoption.entry.asset).not.toHaveProperty('storageKey');
      expect(repeatedAdoption.reused).toBe(true);
      expect(repeatedAdoption.entry.entry.id).toBe(firstAdoption.entry.entry.id);
      expect(otherProjectAdoption.entry.entry.id).not.toBe(firstAdoption.entry.entry.id);
      expect(otherProjectAdoption.entry.entry.paperAssetId).toBe(personalImport.asset.id);
      expect(concurrentAdoptions[1]?.entry.entry.id).toBe(
        concurrentAdoptions[0]?.entry.entry.id,
      );
      expect(concurrentAdoptions.map((adoption) => adoption.reused).sort()).toEqual([
        false,
        true,
      ]);

      const sourceDetail = await app.reading.getDetail(
        {
          actorUserId: 'user-alice',
          libraryEntryId: personalImport.entry.id,
        },
      );
      const adoptedDetail = await app.reading.getDetail(
        {
          actorUserId: 'user-bob',
          libraryEntryId: firstAdoption.entry.entry.id,
        },
      );

      expect(sourceDetail?.notes.map((note) => note.id)).toContain(privateNote.id);
      expect(sourceDetail?.insights).toHaveLength(1);
      expect(adoptedDetail?.notes).toEqual([]);
      expect(adoptedDetail?.insights).toEqual([]);
      expect(adoptedDetail?.projectComments).toEqual([]);

      await expect(
        app.library.adoptProjectLibraryEntry({
          actorUserId: 'user-charlie',
          projectId: targetProject.project.id,
          sourceLibraryEntryId: firstAdoption.entry.entry.id,
        }),
      ).rejects.toThrow(/mutation|access denied/i);
      await expect(
        app.library.adoptProjectLibraryEntry({
          actorUserId: 'user-dana',
          projectId: targetProject.project.id,
          sourceLibraryEntryId: personalImport.entry.id,
        }),
      ).rejects.toThrow(/access denied/i);
      await expect(
        app.library.adoptProjectLibraryEntry({
          actorUserId: 'user-bob',
          projectId: targetProject.project.id,
          sourceLibraryEntryId: personalImport.entry.id,
        }),
      ).rejects.toThrow(/access denied/i);
      await expect(
        app.library.adoptProjectLibraryEntry({
          actorUserId: 'user-alice',
          projectId: 'project-missing-adoption-target',
          sourceLibraryEntryId: personalImport.entry.id,
        }),
      ).rejects.toThrow(/does not exist/i);

      await app.close();

      const restartedApp = createJixiaApp({ env });
      const restartedAdoption = await restartedApp.library.adoptProjectLibraryEntry({
        actorUserId: 'user-alice',
        projectId: targetProject.project.id,
        sourceLibraryEntryId: personalImport.entry.id,
      });

      expect(restartedAdoption.reused).toBe(true);
      expect(restartedAdoption.entry.entry.id).toBe(firstAdoption.entry.entry.id);
      await restartedApp.close();
    } finally {
      rmSync(storageRoot, { recursive: true, force: true });
    }
  }, 30_000);

  it('bootstraps legacy paper/library json into Prisma once and then scrubs compatibility arrays', async () => {
    const storageRoot = mkdtempSync(join(tmpdir(), 'jixia-library-bootstrap-once-'));
    const env = createLibraryEnv(storageRoot);
    const markerPath = join(storageRoot, '.library-prisma-bootstrap-complete');
    const statePath = join(storageRoot, 'server-state.json');
    const now = new Date().toISOString();

    try {
      writeFileSync(
        statePath,
        JSON.stringify(
          {
            libraryEntries: [
              {
                addedAt: now,
                id: 'entry-legacy-bootstrap',
                paperAssetId: 'asset-legacy-bootstrap',
                spaceId: 'space-legacy-bootstrap',
                visibility: 'private',
              },
            ],
            paperAssets: [
              {
                abstractText: 'Bootstrap this legacy paper exactly once.',
                canonicalId: 'doi:10.1000/legacy-bootstrap-once',
                createdAt: now,
                id: 'asset-legacy-bootstrap',
                importedByUserId: 'user-alice',
                title: 'Legacy Bootstrap Paper',
              },
            ],
          },
          null,
          2,
        ),
      );

      const firstApp = createJixiaApp({ env });
      const firstEntries = await firstApp.library.listEntries({
        actorUserId: 'user-alice',
        scope: { id: 'user-alice', type: 'user' },
        spaceId: '',
      });

      expect(firstEntries).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            asset: expect.objectContaining({
              canonicalId: 'doi:10.1000/legacy-bootstrap-once',
              title: 'Legacy Bootstrap Paper',
            }),
            entry: expect.objectContaining({
              id: 'entry-legacy-bootstrap',
              scope: { id: 'user-alice', type: 'user' },
              spaceId: '',
              visibility: 'private',
            }),
          }),
        ]),
      );
      expect(existsSync(markerPath)).toBe(true);

      const scrubbedState = JSON.parse(readFileSync(statePath, 'utf8')) as {
        libraryEntries?: Array<unknown>;
        paperAssets?: Array<unknown>;
      };

      expect(scrubbedState.libraryEntries ?? []).toEqual([]);
      expect(scrubbedState.paperAssets ?? []).toEqual([]);

      const restartedApp = createJixiaApp({ env });
      const restartedEntries = await restartedApp.library.listEntries({
        actorUserId: 'user-alice',
        scope: { id: 'user-alice', type: 'user' },
        spaceId: '',
      });

      expect(restartedEntries).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            asset: expect.objectContaining({
              canonicalId: 'doi:10.1000/legacy-bootstrap-once',
            }),
            entry: expect.objectContaining({
              id: 'entry-legacy-bootstrap',
            }),
          }),
        ]),
      );
    } finally {
      rmSync(storageRoot, { recursive: true, force: true });
    }
  });

  it('does not replay stale paper/library json after the one-time bootstrap marker exists', async () => {
    const storageRoot = mkdtempSync(join(tmpdir(), 'jixia-library-stale-paper-'));
    const env = createLibraryEnv(storageRoot);
    const statePath = join(storageRoot, 'server-state.json');

    try {
      const firstApp = createJixiaApp({ env });
      const space = await firstApp.spaces.createSpace(
        { kind: 'shared', name: 'Bootstrap Marker Space' },
        'user-alice',
      );

      await firstApp.library.listEntries({
        actorUserId: 'user-alice',
        scope: { id: 'user-alice', type: 'user' },
        spaceId: '',
      });

      const now = new Date().toISOString();
      writeFileSync(
        statePath,
        JSON.stringify(
          {
            libraryEntries: [
              {
                addedAt: now,
                id: 'entry-stale-json',
                paperAssetId: 'asset-stale-json',
                spaceId: space.id,
                visibility: 'private',
              },
            ],
            paperAssets: [
              {
                abstractText: 'This stale JSON record must not be replayed.',
                canonicalId: 'doi:10.1000/stale-paper-json',
                createdAt: now,
                id: 'asset-stale-json',
                importedByUserId: 'user-alice',
                title: 'Stale JSON Paper',
              },
            ],
          },
          null,
          2,
        ),
      );

      const restartedApp = createJixiaApp({ env });
      const persistedState = JSON.parse(readFileSync(statePath, 'utf8')) as {
        libraryEntries?: Array<unknown>;
        paperAssets?: Array<unknown>;
      };
      const personalEntries = await restartedApp.library.listEntries({
        actorUserId: 'user-alice',
        scope: { id: 'user-alice', type: 'user' },
        spaceId: '',
      });

      expect(personalEntries.map((entry) => entry.entry.id)).not.toContain(
        'entry-stale-json',
      );
      expect(personalEntries.map((entry) => entry.asset.canonicalId)).not.toContain(
        'doi:10.1000/stale-paper-json',
      );
      expect(persistedState.libraryEntries ?? []).toEqual([]);
      expect(persistedState.paperAssets ?? []).toEqual([]);
    } finally {
      rmSync(storageRoot, { recursive: true, force: true });
    }
  });

  it('rejects project imports whose deprecated space context mismatches the project', async () => {
    const storageRoot = mkdtempSync(join(tmpdir(), 'jixia-library-space-context-'));
    const env = createLibraryEnv(storageRoot);

    try {
      const app = createJixiaApp({ env });
      const projectSpace = await app.spaces.createSpace(
        { kind: 'shared', name: 'Project Space' },
        'user-alice',
      );
      const otherSpace = await app.spaces.createSpace(
        { kind: 'shared', name: 'Other Space' },
        'user-alice',
      );
      const project = await app.projects.createProject(
        { name: 'Strict Context Project', spaceId: projectSpace.id },
        'user-alice',
      );

      await expect(
        app.imports.importPaper(
          {
            scope: { id: project.project.id, type: 'project' },
            requestedByUserId: 'user-alice',
            sourceLocator: '10.1000/mismatch-space-context',
            sourceType: 'doi',
            spaceId: otherSpace.id,
            visibility: 'space_shared',
          },
          'user-alice',
        ),
      ).rejects.toThrow(/space context/i);
    } finally {
      rmSync(storageRoot, { recursive: true, force: true });
    }
  });

  it('keeps personal scope authoritative over stale project-like compatibility fields', async () => {
    const storageRoot = mkdtempSync(join(tmpdir(), 'jixia-library-personal-scope-'));
    const env = createLibraryEnv(storageRoot);

    try {
      const app = createJixiaApp({ env });
      const sharedSpace = await app.spaces.createSpace(
        { kind: 'shared', name: 'Legacy Project-like Space' },
        'user-alice',
      );
      const project = await app.projects.createProject(
        { name: 'Legacy Project-like Context', spaceId: sharedSpace.id },
        'user-alice',
      );

      const imported = await app.imports.importPaper(
        {
          projectId: project.project.id,
          requestedByUserId: 'user-alice',
          scope: { id: 'user-alice', type: 'user' },
          sourceLocator: '10.1000/personal-scope-wins',
          sourceType: 'doi',
          spaceId: sharedSpace.id,
          visibility: 'published_to_project',
        },
        'user-alice',
      );

      expect(imported.entry).toMatchObject({
        scope: { id: 'user-alice', type: 'user' },
        scopeId: 'user-alice',
        scopeType: 'user',
        spaceId: '',
        visibility: 'private',
      });

      const personalEntriesWithStaleSpace = await app.library.listEntries({
        actorSpaceId: sharedSpace.id,
        actorUserId: 'user-alice',
        projectId: project.project.id,
        scope: { id: 'user-alice', type: 'user' },
        spaceId: sharedSpace.id,
      });

      expect(personalEntriesWithStaleSpace.map((entry) => entry.entry.id)).toContain(
        imported.entry.id,
      );

      const projectEntries = await app.library.listEntries({
        actorSpaceId: sharedSpace.id,
        actorUserId: 'user-alice',
        scope: { id: project.project.id, type: 'project' },
        spaceId: sharedSpace.id,
      });

      expect(projectEntries.map((entry) => entry.entry.id)).not.toContain(
        imported.entry.id,
      );
      await expect(
        app.library.getEntry({
          actorSpaceId: sharedSpace.id,
          actorUserId: 'user-bob',
          entryId: imported.entry.id,
        }),
      ).rejects.toThrow(/access denied/i);
    } finally {
      rmSync(storageRoot, { recursive: true, force: true });
    }
  });

  it('keeps project scope authoritative over stale visibility and projectId compatibility fields', async () => {
    const storageRoot = mkdtempSync(join(tmpdir(), 'jixia-library-project-scope-'));
    const env = createLibraryEnv(storageRoot);

    try {
      const app = createJixiaApp({ env });
      const firstSpace = await app.spaces.createSpace(
        { kind: 'shared', name: 'Canonical Project Space' },
        'user-alice',
      );
      const secondSpace = await app.spaces.createSpace(
        { kind: 'shared', name: 'Stale Project Space' },
        'user-alice',
      );
      const canonicalProject = await app.projects.createProject(
        { name: 'Canonical Library Project', spaceId: firstSpace.id },
        'user-alice',
      );
      const staleProject = await app.projects.createProject(
        { name: 'Stale Compatibility Project', spaceId: secondSpace.id },
        'user-alice',
      );
      await app.projects.addProjectMember(
        canonicalProject.project.id,
        { role: 'viewer', userId: 'user-bob' },
        'user-alice',
      );

      const imported = await app.imports.importPaper(
        {
          projectId: staleProject.project.id,
          requestedByUserId: 'user-alice',
          scope: { id: canonicalProject.project.id, type: 'project' },
          sourceLocator: '10.1000/project-scope-wins',
          sourceType: 'doi',
          spaceId: firstSpace.id,
          visibility: 'private',
        },
        'user-alice',
      );

      expect(imported.entry).toMatchObject({
        scope: { id: canonicalProject.project.id, type: 'project' },
        scopeId: canonicalProject.project.id,
        scopeType: 'project',
        spaceId: firstSpace.id,
        visibility: 'published_to_project',
      });

      const canonicalEntries = await app.library.listEntries({
        actorSpaceId: firstSpace.id,
        actorUserId: 'user-bob',
        projectId: staleProject.project.id,
        scope: { id: canonicalProject.project.id, type: 'project' },
        spaceId: firstSpace.id,
      });
      const canonicalEntriesWithStaleSpaceMirror = await app.library.listEntries({
        actorSpaceId: firstSpace.id,
        actorUserId: 'user-bob',
        projectId: staleProject.project.id,
        scope: { id: canonicalProject.project.id, type: 'project' },
        spaceId: secondSpace.id,
      });
      const staleProjectEntries = await app.library.listEntries({
        actorSpaceId: secondSpace.id,
        actorUserId: 'user-alice',
        scope: { id: staleProject.project.id, type: 'project' },
        spaceId: secondSpace.id,
      });

      expect(canonicalEntries.map((entry) => entry.entry.id)).toContain(
        imported.entry.id,
      );
      expect(
        canonicalEntriesWithStaleSpaceMirror.map((entry) => entry.entry.id),
      ).toContain(imported.entry.id);
      expect(staleProjectEntries.map((entry) => entry.entry.id)).not.toContain(
        imported.entry.id,
      );
      await expect(
        app.library.getEntry({
          actorSpaceId: secondSpace.id,
          actorUserId: 'user-bob',
          entryId: imported.entry.id,
        }),
      ).rejects.toThrow(/space context/i);
    } finally {
      rmSync(storageRoot, { recursive: true, force: true });
    }
  });

  it('rejects personal-library compatibility actor mismatches at the service boundary', async () => {
    const storageRoot = mkdtempSync(join(tmpdir(), 'jixia-workbench-library-actor-mismatch-'));

    try {
      const app = createJixiaApp({
        connectors: {
          pubmed: createStubPubmedConnector(),
        },
        env: { JIXIA_STORAGE_ROOT: storageRoot },
      });

      await expect(
        app.imports.importToPersonalLibrary(
          {
            requestedByUserId: 'user-bob',
            sourceLocator: '654321',
            sourceType: 'pmid',
          },
          'user-alice',
        ),
      ).rejects.toThrow(/server-derived actor/i);
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

      const imported = await app.imports.importToPersonalLibrary(
        {
          requestedByUserId: 'user-alice',
          sourceLocator: discovered[0].sourceLocator,
          sourceType: discovered[0].sourceType,
        },
        'user-alice',
      );

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
