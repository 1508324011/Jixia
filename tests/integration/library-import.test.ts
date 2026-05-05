import { mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { describe, expect, it } from 'vitest';

import { createPrismaClient, createSpaceRepository } from '../../src/db';
import { createJixiaApp } from '../../src/server/app';

function createLibraryEnv(storageRoot: string) {
  return {
    JIXIA_DATABASE_URL: `file:${join(storageRoot, 'jixia-library.db')}`,
    JIXIA_STORAGE_ROOT: storageRoot,
  };
}

describe('library import', () => {
  it('creates asset and entry separately', async () => {
    const storageRoot = mkdtempSync(join(tmpdir(), 'jixia-library-import-'));

    try {
      const app = createJixiaApp({ env: createLibraryEnv(storageRoot) });
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

      expect(uploaded.asset.storageKey).toMatch(/^papers\/.+\/paper\.pdf$/);
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
  });

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
  });

  it('does not replay stale paper/library json after the one-time bootstrap marker exists', async () => {
    const storageRoot = mkdtempSync(join(tmpdir(), 'jixia-library-stale-paper-'));
    const env = createLibraryEnv(storageRoot);

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
        join(storageRoot, 'server-state.json'),
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
});
