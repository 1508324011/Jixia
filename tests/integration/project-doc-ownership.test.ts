import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { describe, expect, it } from 'vitest';

import type { JixiaAppState } from '../../src/server/app';
import { createJixiaApp } from '../../src/server/app';

describe('project doc ownership', () => {
  it('stores project docs as project-owned shared documents', async () => {
    const storageRoot = mkdtempSync(join(tmpdir(), 'jixia-project-doc-ownership-'));

    try {
      const app = createJixiaApp({ env: { JIXIA_STORAGE_ROOT: storageRoot } });
      const sharedSpace = await app.spaces.createSpace(
        { kind: 'shared', name: 'Project Docs Space' },
        'user-alice',
      );
      const imported = await app.imports.importPaper({
        requestedByUserId: 'user-alice',
        sourceLocator: '10.1000/project-doc-ownership',
        sourceType: 'doi',
        spaceId: sharedSpace.id,
        visibility: 'space_shared',
      });

      const savedDocument = await app.writing.saveProjectDocument({
        actorSpaceId: sharedSpace.id,
        actorUserId: 'user-alice',
        citations: [{ paperAssetId: imported.asset.id }],
        content: 'Shared project content',
        projectId: 'project-1',
        spaceId: sharedSpace.id,
        title: 'Protocol Draft',
      });

      expect(savedDocument.ownerType).toBe('project');
      expect(savedDocument.projectId).toBe('project-1');

      const statePath = join(storageRoot, 'server-state.json');
      const savedState = JSON.parse(readFileSync(statePath, 'utf8')) as JixiaAppState;

      savedState.memberships.push({
        joinedAt: new Date().toISOString(),
        role: 'editor',
        spaceId: sharedSpace.id,
        userId: 'user-bob',
      });
      writeFileSync(statePath, JSON.stringify(savedState, null, 2));

      const reopenedApp = createJixiaApp({ env: { JIXIA_STORAGE_ROOT: storageRoot } });
      const reopenedDocument = await reopenedApp.writing.getDocument({
        actorSpaceId: sharedSpace.id,
        actorUserId: 'user-bob',
        projectId: 'project-1',
        spaceId: sharedSpace.id,
      });

      expect(reopenedDocument).toMatchObject({
        documentId: savedDocument.documentId,
        ownerType: 'project',
        projectId: 'project-1',
        spaceId: sharedSpace.id,
        title: 'Protocol Draft',
      });
      expect(reopenedDocument?.latestSnapshot?.content).toBe('Shared project content');

      const persistedState = JSON.parse(readFileSync(statePath, 'utf8')) as JixiaAppState;

      expect(persistedState.writingDocs).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            id: savedDocument.documentId,
            ownerType: 'project',
            projectId: 'project-1',
            spaceId: sharedSpace.id,
          }),
        ]),
      );
      expect(persistedState.writingDocs).not.toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            id: savedDocument.documentId,
            ownerUserId: 'user-alice',
          }),
        ]),
      );
      expect(persistedState.projectDocumentPresences).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            activeDocumentId: savedDocument.documentId,
            projectId: 'project-1',
            userId: 'user-bob',
          }),
        ]),
      );
    } finally {
      rmSync(storageRoot, { force: true, recursive: true });
    }
  });
});
