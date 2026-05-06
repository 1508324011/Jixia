import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { describe, expect, it } from 'vitest';

import {
  createPrismaClient,
  createSpaceRepository,
} from '../../src/db';
import { createJixiaApp } from '../../src/server/app';

function createStorageRoot(prefix: string): string {
  return mkdtempSync(join(tmpdir(), prefix));
}

function createWritingEnv(storageRoot: string) {
  return {
    JIXIA_DATABASE_URL: `file:${join(storageRoot, 'jixia-writing.db')}`,
    JIXIA_STORAGE_ROOT: storageRoot,
  };
}

describe('notebook and project document persistence', () => {
  it('creates owner-only notebook snapshots and persists them across restarts', async () => {
    const storageRoot = createStorageRoot('jixia-notebook-versioning-');

    try {
      const env = createWritingEnv(storageRoot);
      const firstApp = createJixiaApp({ env });
      const personalSpace = await firstApp.spaces.createSpace(
        { kind: 'personal', name: 'Alice Notebook Space' },
        'user-alice',
      );
      const imported = await firstApp.imports.importPaper(
        {
          requestedByUserId: 'user-alice',
          scope: { id: 'user-alice', type: 'user' },
          sourceLocator: '10.1000/notebook-demo',
          sourceType: 'doi',
          spaceId: personalSpace.id,
          visibility: 'private',
        },
        'user-alice',
      );

      const notebook = await firstApp.notebooks.createDocument(
        {
          ownerId: 'user-alice',
          title: 'Alice Private Notebook',
        },
        'user-alice',
      );
      const firstSnapshot = await firstApp.notebooks.saveDocument(
        {
          citations: [
            {
              evidenceSpan: 'intro paragraph',
              paperAssetId: imported.asset.id,
            },
          ],
          content: 'Notebook version one',
          documentId: notebook.id,
        },
        'user-alice',
      );

      expect(firstSnapshot.versionNumber).toBe(1);
      expect(firstSnapshot.citations[0]?.paperAssetId).toBe(imported.asset.id);

      await expect(
        firstApp.notebooks.getDocument({ documentId: notebook.id }, 'user-bob'),
      ).rejects.toThrow(/access denied/i);
      await expect(
        firstApp.notebooks.saveDocument(
          {
            citations: [],
            content: 'Bob intrusion attempt',
            documentId: notebook.id,
          },
          'user-bob',
        ),
      ).rejects.toThrow(/access denied/i);

      const secondApp = createJixiaApp({ env });
      const secondSnapshot = await secondApp.notebooks.saveDocument(
        {
          citations: [
            {
              evidenceSpan: 'results paragraph',
              paperAssetId: imported.entry.id,
            },
          ],
          content: 'Notebook version two',
          documentId: notebook.id,
        },
        'user-alice',
      );

      expect(secondSnapshot.document.id).toBe(notebook.id);
      expect(secondSnapshot.versionNumber).toBe(2);
      expect(secondSnapshot.citations[0]?.paperAssetId).toBe(imported.asset.id);
    } finally {
      rmSync(storageRoot, { force: true, recursive: true });
    }
  }, 15_000);

  it('enforces ProjectMember-gated project docs and persists versions/citations', async () => {
    const storageRoot = createStorageRoot('jixia-project-doc-versioning-');
    const env = createWritingEnv(storageRoot);
    const prisma = createPrismaClient({ url: env.JIXIA_DATABASE_URL });
    const spaceRepository = createSpaceRepository(prisma);

    try {
      const firstApp = createJixiaApp({ env });
      const sharedSpace = await firstApp.spaces.createSpace(
        { kind: 'shared', name: 'Project Writing Space' },
        'user-alice',
      );
      const project = await firstApp.projects.createProject(
        { name: 'Project Writing Recovery', spaceId: sharedSpace.id },
        'user-alice',
      );
      await firstApp.projects.addProjectMember(
        project.project.id,
        { role: 'viewer', userId: 'user-bob' },
        'user-alice',
      );
      await spaceRepository.addMembership(sharedSpace.id, {
        role: 'viewer',
        userId: 'user-charlie',
      });

      const imported = await firstApp.imports.importPaper(
        {
          requestedByUserId: 'user-alice',
          scope: { id: project.project.id, type: 'project' },
          sourceLocator: '10.1000/project-doc-demo',
          sourceType: 'doi',
          spaceId: sharedSpace.id,
          visibility: 'published_to_project',
        },
        'user-alice',
      );
      const secondSpace = await firstApp.spaces.createSpace(
        { kind: 'shared', name: 'Other Writing Space' },
        'user-alice',
      );
      const secondProject = await firstApp.projects.createProject(
        { name: 'Other Project', spaceId: secondSpace.id },
        'user-alice',
      );
      const outOfScopeImport = await firstApp.imports.importPaper(
        {
          requestedByUserId: 'user-alice',
          scope: { id: secondProject.project.id, type: 'project' },
          sourceLocator: '10.1000/out-of-scope-project-doc',
          sourceType: 'doi',
          spaceId: secondSpace.id,
          visibility: 'published_to_project',
        },
        'user-alice',
      );

      const projectDoc = await firstApp.projectDocs.createDocument(
        {
          createdByUserId: 'user-alice',
          projectId: project.project.id,
          title: 'Collaborative Draft',
        },
        'user-alice',
      );

      const bobReadable = await firstApp.projectDocs.getDocument(
        { documentId: projectDoc.id },
        'user-bob',
      );
      expect(bobReadable.projectId).toBe(project.project.id);

      await expect(
        firstApp.projectDocs.getDocument({ documentId: projectDoc.id }, 'user-charlie'),
      ).rejects.toThrow(/access denied/i);
      await expect(
        firstApp.projectDocs.saveDocument(
          {
            citations: [],
            content: 'Viewer write attempt',
            documentId: projectDoc.id,
          },
          'user-bob',
        ),
      ).rejects.toThrow(/mutation/i);
      await expect(
        firstApp.projectDocs.saveDocument(
          {
            citations: [{ paperAssetId: outOfScopeImport.asset.id }],
            content: 'Cross-space citation should fail',
            documentId: projectDoc.id,
          },
          'user-alice',
        ),
      ).rejects.toThrow(/paper asset/i);

      const firstSnapshot = await firstApp.projectDocs.saveDocument(
        {
          citations: [
            {
              evidenceSpan: 'methods paragraph',
              paperAssetId: imported.entry.id,
            },
          ],
          content: 'Project doc version one',
          documentId: projectDoc.id,
        },
        'user-alice',
      );
      const reviewed = await firstApp.projectDocs.transitionPublishState(
        {
          documentId: projectDoc.id,
          publishState: 'review',
        },
        'user-alice',
      );

      expect(firstSnapshot.versionNumber).toBe(1);
      expect(firstSnapshot.citations[0]?.paperAssetId).toBe(imported.asset.id);
      expect(reviewed.publishState).toBe('review');

      const secondApp = createJixiaApp({ env });
      const secondSnapshot = await secondApp.projectDocs.saveDocument(
        {
          citations: [{ paperAssetId: imported.asset.id }],
          content: 'Project doc version two',
          documentId: projectDoc.id,
        },
        'user-alice',
      );

      expect(secondSnapshot.document.id).toBe(projectDoc.id);
      expect(secondSnapshot.document.publishState).toBe('review');
      expect(secondSnapshot.versionNumber).toBe(2);
    } finally {
      await prisma.$disconnect();
      rmSync(storageRoot, { force: true, recursive: true });
    }
  });

  it('ignores legacy server-state writing arrays for new document authority', async () => {
    const storageRoot = createStorageRoot('jixia-legacy-writing-ignore-');
    const statePath = join(storageRoot, 'server-state.json');

    try {
      writeFileSync(
        statePath,
        JSON.stringify(
          {
            citationLinks: [
              {
                docVersionId: 'legacy-version',
                id: 'legacy-citation',
                paperAssetId: 'legacy-asset',
              },
            ],
            docVersions: [
              {
                content: 'legacy content',
                createdAt: '2026-05-05T00:00:00.000Z',
                id: 'legacy-version',
                versionNumber: 1,
                writingDocId: 'legacy-doc',
              },
            ],
            nextSequence: 4,
            writingDocs: [
              {
                createdAt: '2026-05-05T00:00:00.000Z',
                id: 'legacy-doc',
                ownerUserId: 'user-alice',
                publishState: 'draft',
                spaceId: 'space-legacy',
                title: 'Legacy JSON draft',
              },
            ],
          },
          null,
          2,
        ),
      );

      const app = createJixiaApp({ env: createWritingEnv(storageRoot) });
      const persistedState = readFileSync(statePath, 'utf8');

      expect(persistedState).not.toContain('legacy-doc');
      expect(persistedState).not.toContain('writingDocs');
      expect(persistedState).not.toContain('docVersions');
      expect(persistedState).not.toContain('citationLinks');
      await expect(
        app.notebooks.getDocument({ documentId: 'legacy-doc' }, 'user-alice'),
      ).rejects.toThrow(/does not exist/i);

      const notebook = await app.notebooks.createDocument(
        { title: 'Fresh Notebook' },
        'user-alice',
      );

      expect(notebook.id).not.toBe('legacy-doc');
    } finally {
      rmSync(storageRoot, { force: true, recursive: true });
    }
  });

  it('promotes persisted workbench artifacts into a project doc draft that reopens after restart', async () => {
    const storageRoot = mkdtempSync(join(tmpdir(), 'jixia-writing-reopen-'));
    const env = createWritingEnv(storageRoot);

    try {
      const app = createJixiaApp({ env });
      const sharedSpace = await app.spaces.createSpace(
        { kind: 'shared', name: 'Workbench Writer Space' },
        'user-alice',
      );
      const project = await app.projects.createProject(
        { name: 'Tumor Board Writer Project', spaceId: sharedSpace.id },
        'user-alice',
      );
      const imported = await app.imports.importPaper(
        {
          requestedByUserId: 'user-alice',
          scope: { id: project.project.id, type: 'project' },
          sourceLocator: '10.1000/workbench-writer',
          sourceType: 'doi',
          spaceId: sharedSpace.id,
          visibility: 'space_shared',
        },
        'user-alice',
      );
      const document = await app.projectDocs.createDocument(
        {
          createdByUserId: 'user-alice',
          projectId: project.project.id,
          title: 'Tumor board literature synthesis',
        },
        'user-alice',
      );

      const savedDocument = await app.projectDocs.saveDocument(
        {
          citations: [
            {
              evidenceSpan: 'Tumor board evidence',
              paperAssetId: imported.asset.id,
            },
          ],
          content: 'Promoted governed insight paragraph.',
          documentId: document.id,
        },
        'user-alice',
      );

      expect(savedDocument.content).toBe('Promoted governed insight paragraph.');
      expect(savedDocument.citations).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            paperAssetId: imported.asset.id,
          }),
        ]),
      );

      const reopenedApp = createJixiaApp({ env });
      const reopenedDocument = await reopenedApp.projectDocs.getDocument(
        { documentId: document.id },
        'user-alice',
      );

      expect(reopenedDocument).toMatchObject({
        id: document.id,
        projectId: project.project.id,
        title: 'Tumor board literature synthesis',
      });

      const reopenedSnapshot = await reopenedApp.projectDocs.saveDocument(
        {
          citations: [
            {
              evidenceSpan: 'Tumor board evidence',
              paperAssetId: imported.asset.id,
            },
          ],
          content: 'Reopened writer draft with persisted edits.',
          documentId: document.id,
        },
        'user-alice',
      );

      expect(reopenedSnapshot.versionNumber).toBe(2);
      expect(reopenedSnapshot.content).toBe('Reopened writer draft with persisted edits.');
    } finally {
      rmSync(storageRoot, { force: true, recursive: true });
    }
  });

});
