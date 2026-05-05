import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { describe, expect, it } from 'vitest';

import { createPrismaClient, createSpaceRepository } from '../../src/db';
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
      const project = await app.projects.createProject(
        { name: 'Writing Project', spaceId: sharedSpace.id },
        'user-alice',
      );
      const imported = await app.imports.importPaper({
        scope: { id: project.project.id, type: 'project' },
        requestedByUserId: 'user-alice',
        sourceLocator: '10.1000/writing-demo',
        sourceType: 'doi',
        spaceId: sharedSpace.id,
        visibility: 'space_shared',
      }, 'user-alice');

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

  it('uses persisted memberships for writing authorization even without legacy mirrors', async () => {
    const storageRoot = mkdtempSync(join(tmpdir(), 'jixia-writing-prisma-space-'));
    const databaseUrl = `file:${join(storageRoot, 'jixia-writing-space.db')}`;
    const env = {
      JIXIA_DATABASE_URL: databaseUrl,
      JIXIA_STORAGE_ROOT: storageRoot,
    };
    const prisma = createPrismaClient({ url: databaseUrl });
    const repository = createSpaceRepository(prisma);

    try {
      const persistedSpace = await repository.createSpace(
        { id: 'space-writing', kind: 'shared', name: 'Persisted Writing Space' },
        'user-alice',
      );
      const app = createJixiaApp({ env });
      const doc = await app.writing.createDocument({
        actorSpaceId: persistedSpace.id,
        actorUserId: 'user-alice',
        ownerUserId: 'user-alice',
        spaceId: persistedSpace.id,
        title: 'Repository-backed Draft',
      });

      expect(doc.spaceId).toBe(persistedSpace.id);

      await expect(
        app.writing.createDocument({
          actorSpaceId: persistedSpace.id,
          actorUserId: 'user-charlie',
          ownerUserId: 'user-charlie',
          spaceId: persistedSpace.id,
          title: 'Denied Draft',
        }),
      ).rejects.toThrow(/access denied/i);
    } finally {
      await prisma.$disconnect();
      rmSync(storageRoot, { force: true, recursive: true });
    }
  });

  it('denies citations to paper assets outside the writing actor space context', async () => {
    const storageRoot = mkdtempSync(join(tmpdir(), 'jixia-writing-citation-scope-'));

    try {
      const app = createJixiaApp({ env: { JIXIA_STORAGE_ROOT: storageRoot } });
      const firstSpace = await app.spaces.createSpace(
        { kind: 'shared', name: 'First Writing Space' },
        'user-alice',
      );
      const secondSpace = await app.spaces.createSpace(
        { kind: 'shared', name: 'Second Writing Space' },
        'user-alice',
      );
      const firstProject = await app.projects.createProject(
        { name: 'First Writing Project', spaceId: firstSpace.id },
        'user-alice',
      );
      const secondProject = await app.projects.createProject(
        { name: 'Second Writing Project', spaceId: secondSpace.id },
        'user-alice',
      );
      const firstImport = await app.imports.importPaper(
        {
          scope: { id: firstProject.project.id, type: 'project' },
          requestedByUserId: 'user-alice',
          sourceLocator: '10.1000/first-writing-space',
          sourceType: 'doi',
          spaceId: firstSpace.id,
          visibility: 'space_shared',
        },
        'user-alice',
      );
      const secondImport = await app.imports.importPaper(
        {
          scope: { id: secondProject.project.id, type: 'project' },
          requestedByUserId: 'user-alice',
          sourceLocator: '10.1000/second-writing-space',
          sourceType: 'doi',
          spaceId: secondSpace.id,
          visibility: 'space_shared',
        },
        'user-alice',
      );
      const doc = await app.writing.createDocument({
        actorSpaceId: firstSpace.id,
        actorUserId: 'user-alice',
        ownerUserId: 'user-alice',
        spaceId: firstSpace.id,
        title: 'Scoped Citation Draft',
      });

      await expect(
        app.writing.saveDocument({
          actorSpaceId: firstSpace.id,
          actorUserId: 'user-alice',
          citations: [{ paperAssetId: secondImport.asset.id }],
          content: 'Cross-space citation should be denied.',
          docId: doc.id,
        }),
      ).rejects.toThrow(/paper asset/i);

      const snapshot = await app.writing.saveDocument({
        actorSpaceId: firstSpace.id,
        actorUserId: 'user-alice',
        citations: [{ paperAssetId: firstImport.asset.id }],
        content: 'Same-space citation should be allowed.',
        docId: doc.id,
      });

      expect(snapshot.citations[0].paperAssetId).toBe(firstImport.asset.id);
    } finally {
      rmSync(storageRoot, { force: true, recursive: true });
    }
  });
});
