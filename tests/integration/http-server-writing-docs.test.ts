import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { describe, expect, it } from 'vitest';

import {
  createHttpTestPubmedConnector,
  loginAs,
  startTestServer,
  withSessionCookie,
} from './http-session-test-helpers';
import { PROJECT_DOC_CITATION_SOURCE_UNAVAILABLE } from '../../src/shared/contracts/project-docs';

async function createSpace(serverUrl: string, cookie: string, actorUserId: string) {
  return fetch(`${serverUrl}/api/spaces`, {
    body: JSON.stringify({ kind: 'shared', name: `${actorUserId} writing docs` }),
    headers: withSessionCookie(cookie, {
      'Content-Type': 'application/json',
    }),
    method: 'POST',
  }).then((response) => response.json() as Promise<{ id: string }>);
}

describe('http server notebook and project-doc api', () => {
  it('enforces owner-only notebook access and actor-boundary checks', async () => {
    const storageRoot = mkdtempSync(join(tmpdir(), 'jixia-http-notebooks-'));

    try {
      const server = await startTestServer({
        JIXIA_DATABASE_URL: `file:${join(storageRoot, 'jixia-http-writing-docs.db')}`,
        JIXIA_STORAGE_ROOT: storageRoot,
      });

      try {
        const aliceCookie = await loginAs(server.url, 'user-alice');
        const bobCookie = await loginAs(server.url, 'user-bob');

        const createResponse = await fetch(`${server.url}/api/notebooks`, {
          body: JSON.stringify({ title: 'HTTP Notebook' }),
          headers: withSessionCookie(aliceCookie, {
            'Content-Type': 'application/json',
          }),
          method: 'POST',
        });
        const notebook = (await createResponse.json()) as { id: string };

        expect(createResponse.status).toBe(200);

        const ownerRead = await fetch(`${server.url}/api/notebooks/${notebook.id}`, {
          headers: withSessionCookie(aliceCookie),
        });
        const nonOwnerRead = await fetch(`${server.url}/api/notebooks/${notebook.id}`, {
          headers: withSessionCookie(bobCookie),
        });
        const actorMismatch = await fetch(`${server.url}/api/notebooks`, {
          body: JSON.stringify({ ownerId: 'user-alice', title: 'Spoofed Notebook' }),
          headers: withSessionCookie(bobCookie, {
            'Content-Type': 'application/json',
          }),
          method: 'POST',
        });

        expect(ownerRead.status).toBe(200);
        expect(nonOwnerRead.status).toBe(403);
        expect(actorMismatch.status).toBe(400);

        const notebookList = await fetch(`${server.url}/api/notebooks`, {
          headers: withSessionCookie(aliceCookie),
        });
        const notebookListPayload = await notebookList.json() as {
          documents: Array<{ id: string; ownerId: string; title: string }>;
        };
        const emptySnapshot = await fetch(
          `${server.url}/api/notebooks/${notebook.id}/snapshot`,
          { headers: withSessionCookie(aliceCookie) },
        );
        const emptySnapshotPayload = await emptySnapshot.json() as {
          content: string;
          document: { id: string; ownerId: string };
          documentContent?: { blocks: unknown[]; schemaVersion: 1 };
          versionNumber: number;
        };
        const saveResponse = await fetch(`${server.url}/api/notebooks/${notebook.id}/versions`, {
          body: JSON.stringify({ citations: [], content: 'Alice private notebook content' }),
          headers: withSessionCookie(aliceCookie, {
            'Content-Type': 'application/json',
          }),
          method: 'POST',
        });
        const savedSnapshotPayload = await saveResponse.json() as {
          content: string;
          document: { id: string; ownerId: string };
          documentContent?: { blocks: unknown[]; schemaVersion: 1 };
          versionNumber: number;
        };
        const reloadedSnapshot = await fetch(
          `${server.url}/api/notebooks/${notebook.id}/snapshot`,
          { headers: withSessionCookie(aliceCookie) },
        );
        const reloadedSnapshotPayload = await reloadedSnapshot.json() as {
          content: string;
          document: { id: string; ownerId: string };
          documentContent?: { blocks: unknown[]; schemaVersion: 1 };
          versionNumber: number;
        };
        const bobSnapshotRead = await fetch(
          `${server.url}/api/notebooks/${notebook.id}/snapshot`,
          { headers: withSessionCookie(bobCookie) },
        );

        expect(notebookList.status).toBe(200);
        expect(notebookListPayload.documents).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              id: notebook.id,
              ownerId: 'user-alice',
              title: 'HTTP Notebook',
            }),
          ]),
        );
        expect(emptySnapshot.status).toBe(200);
        expect(emptySnapshotPayload).toMatchObject({
          content: '',
          document: { id: notebook.id, ownerId: 'user-alice' },
          documentContent: { blocks: [], schemaVersion: 1 },
          versionNumber: 0,
        });
        expect(saveResponse.status).toBe(200);
        expect(savedSnapshotPayload).toMatchObject({
          content: 'Alice private notebook content',
          document: { id: notebook.id, ownerId: 'user-alice' },
          documentContent: {
            blocks: [
              {
                text: 'Alice private notebook content',
                type: 'paragraph',
              },
            ],
            schemaVersion: 1,
          },
          versionNumber: 1,
        });
        expect(reloadedSnapshot.status).toBe(200);
        expect(reloadedSnapshotPayload).toMatchObject({
          content: 'Alice private notebook content',
          document: { id: notebook.id, ownerId: 'user-alice' },
          documentContent: {
            blocks: [
              {
                text: 'Alice private notebook content',
                type: 'paragraph',
              },
            ],
            schemaVersion: 1,
          },
          versionNumber: 1,
        });
        expect(bobSnapshotRead.status).toBe(403);

        const matchingOwner = await fetch(`${server.url}/api/notebooks`, {
          body: JSON.stringify({ ownerId: 'user-alice', title: 'Matching Owner Notebook' }),
          headers: withSessionCookie(aliceCookie, {
            'Content-Type': 'application/json',
          }),
          method: 'POST',
        });

        expect(matchingOwner.status).toBe(400);
      } finally {
        await server.close();
      }
    } finally {
      rmSync(storageRoot, { force: true, recursive: true });
    }
  });

  it('captures reader excerpts into private notebooks over HTTP without caller authority fields', async () => {
    const storageRoot = mkdtempSync(join(tmpdir(), 'jixia-http-reader-excerpt-capture-'));

    try {
      const server = await startTestServer(
        {
          JIXIA_DATABASE_URL: `file:${join(storageRoot, 'jixia-http-reader-excerpt-capture.db')}`,
          JIXIA_STORAGE_ROOT: storageRoot,
        },
        { connectors: { pubmed: createHttpTestPubmedConnector() } },
      );

      try {
        const aliceCookie = await loginAs(server.url, 'user-alice');
        const bobCookie = await loginAs(server.url, 'user-bob');
        const personalSource = await fetch(`${server.url}/api/import/paper`, {
          body: JSON.stringify({
            scope: { id: 'user-alice', type: 'user' },
            sourceLocator: '10.1000/http-reader-excerpt-capture',
            sourceType: 'doi',
            spaceId: 'personal-space-user-alice',
            visibility: 'private',
          }),
          headers: withSessionCookie(aliceCookie, {
            'Content-Type': 'application/json',
          }),
          method: 'POST',
        }).then(
          (response) => response.json() as Promise<{
            asset: { id: string };
            entry: { id: string };
          }>,
        );
        const readerExcerpt = await fetch(
          `${server.url}/api/reading/${personalSource.entry.id}/excerpts`,
          {
            body: JSON.stringify({
              endOffset: 34,
              locator: 'p. 3',
              note: 'Alice private reader note.',
              quote: 'reader excerpt capture quote',
              startOffset: 2,
            }),
            headers: withSessionCookie(aliceCookie, {
              'Content-Type': 'application/json',
            }),
            method: 'POST',
          },
        ).then(
          (response) => response.json() as Promise<{
            excerpt: { id: string; libraryEntryId: string; paperAssetId: string; quote: string };
          }>,
        );
        const captureResponse = await fetch(`${server.url}/api/notebooks/capture`, {
          body: JSON.stringify({
            notebookTitle: 'HTTP reader excerpt notebook',
            source: {
              libraryEntryId: personalSource.entry.id,
              note: 'HTTP capture request note.',
              readerExcerptId: readerExcerpt.excerpt.id,
              type: 'readerExcerpt',
            },
          }),
          headers: withSessionCookie(aliceCookie, {
            'Content-Type': 'application/json',
          }),
          method: 'POST',
        });
        const capturePayload = await captureResponse.json() as {
          document: { id: string; ownerId: string; title: string };
          snapshot: {
            citations: Array<{ evidenceSpan?: string; paperAssetId: string; readerExcerptId?: string }>;
            content: string;
            documentContent?: {
              blocks?: Array<{
                evidenceSpan?: string;
                libraryEntryId?: string;
                paperAssetId?: string;
                quote?: string;
                readerExcerptId?: string;
                type?: string;
              }>;
              schemaVersion?: number;
            };
          };
        };
        const bobSnapshotRead = await fetch(
          `${server.url}/api/notebooks/${capturePayload.document.id}/snapshot`,
          { headers: withSessionCookie(bobCookie) },
        );
        const matchingOwnerCapture = await fetch(`${server.url}/api/notebooks/capture`, {
          body: JSON.stringify({
            notebookTitle: 'Rejected matching owner capture',
            ownerId: 'user-alice',
            source: {
              readerExcerptId: readerExcerpt.excerpt.id,
              type: 'readerExcerpt',
            },
          }),
          headers: withSessionCookie(aliceCookie, {
            'Content-Type': 'application/json',
          }),
          method: 'POST',
        });
        const nestedProjectCapture = await fetch(`${server.url}/api/notebooks/capture`, {
          body: JSON.stringify({
            notebookTitle: 'Rejected nested project capture',
            source: {
              projectId: 'project-spoofed',
              readerExcerptId: readerExcerpt.excerpt.id,
              type: 'readerExcerpt',
            },
          }),
          headers: withSessionCookie(aliceCookie, {
            'Content-Type': 'application/json',
          }),
          method: 'POST',
        });
        const mismatchedSource = await fetch(`${server.url}/api/notebooks/capture`, {
          body: JSON.stringify({
            notebookTitle: 'Rejected mismatched source',
            source: {
              libraryEntryId: 'entry-mismatch',
              readerExcerptId: readerExcerpt.excerpt.id,
              type: 'readerExcerpt',
            },
          }),
          headers: withSessionCookie(aliceCookie, {
            'Content-Type': 'application/json',
          }),
          method: 'POST',
        });

        expect(captureResponse.status).toBe(200);
        expect(capturePayload.document).toMatchObject({
          ownerId: 'user-alice',
          title: 'HTTP reader excerpt notebook',
        });
        expect(capturePayload.snapshot.content).toContain('reader excerpt capture quote');
        expect(capturePayload.snapshot.citations).toEqual([
          expect.objectContaining({
            evidenceSpan: 'reader excerpt capture quote',
            paperAssetId: personalSource.asset.id,
            readerExcerptId: readerExcerpt.excerpt.id,
          }),
        ]);
        expect(capturePayload.snapshot.documentContent?.blocks).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              evidenceSpan: 'reader excerpt capture quote',
              libraryEntryId: personalSource.entry.id,
              paperAssetId: personalSource.asset.id,
              quote: 'reader excerpt capture quote',
              readerExcerptId: readerExcerpt.excerpt.id,
              type: 'sourceExcerpt',
            }),
          ]),
        );
        expect(bobSnapshotRead.status).toBe(403);
        expect(matchingOwnerCapture.status).toBe(400);
        expect(nestedProjectCapture.status).toBe(400);
        expect(mismatchedSource.status).toBe(400);
      } finally {
        await server.close();
      }
    } finally {
      rmSync(storageRoot, { force: true, recursive: true });
    }
  });

  it('enforces ProjectMember-gated project-doc access and rejects impersonation', async () => {
    const storageRoot = mkdtempSync(join(tmpdir(), 'jixia-http-project-docs-'));

    try {
      const server = await startTestServer({
        JIXIA_DATABASE_URL: `file:${join(storageRoot, 'jixia-http-writing-docs.db')}`,
        JIXIA_STORAGE_ROOT: storageRoot,
      });

      try {
        const aliceCookie = await loginAs(server.url, 'user-alice');
        const bobCookie = await loginAs(server.url, 'user-bob');
        const charlieCookie = await loginAs(server.url, 'user-charlie');

        const sharedSpace = await createSpace(server.url, aliceCookie, 'user-alice');
        const project = await fetch(`${server.url}/api/projects`, {
          body: JSON.stringify({ name: 'HTTP Project Docs', spaceId: sharedSpace.id }),
          headers: withSessionCookie(aliceCookie, {
            'Content-Type': 'application/json',
          }),
          method: 'POST',
        }).then(
          (response) => response.json() as Promise<{ project: { id: string } }>,
        );
        await fetch(`${server.url}/api/projects/${project.project.id}/members`, {
          body: JSON.stringify({ role: 'viewer', userId: 'user-bob' }),
          headers: withSessionCookie(aliceCookie, {
            'Content-Type': 'application/json',
          }),
          method: 'POST',
        });
        const createResponse = await fetch(`${server.url}/api/project-docs`, {
          body: JSON.stringify({ projectId: project.project.id, title: 'HTTP Project Draft' }),
          headers: withSessionCookie(aliceCookie, {
            'Content-Type': 'application/json',
          }),
          method: 'POST',
        });
        const projectDoc = (await createResponse.json()) as { id: string };

        expect(createResponse.status).toBe(200);

        const memberRead = await fetch(`${server.url}/api/project-docs/${projectDoc.id}`, {
          headers: withSessionCookie(bobCookie),
        });
        const nonMemberRead = await fetch(`${server.url}/api/project-docs/${projectDoc.id}`, {
          headers: withSessionCookie(charlieCookie),
        });
        const spoofedCreate = await fetch(`${server.url}/api/project-docs`, {
          body: JSON.stringify({ createdByUserId: 'user-alice', projectId: project.project.id, title: 'Spoofed Project Draft' }),
          headers: withSessionCookie(bobCookie, {
            'Content-Type': 'application/json',
          }),
          method: 'POST',
        });
        const viewerCreate = await fetch(`${server.url}/api/project-docs`, {
          body: JSON.stringify({
            projectId: project.project.id,
            title: 'Viewer Project Draft',
          }),
          headers: withSessionCookie(bobCookie, {
            'Content-Type': 'application/json',
          }),
          method: 'POST',
        });
        const nonMemberCreate = await fetch(`${server.url}/api/project-docs`, {
          body: JSON.stringify({
            projectId: project.project.id,
            title: 'Non-member Project Draft',
          }),
          headers: withSessionCookie(charlieCookie, {
            'Content-Type': 'application/json',
          }),
          method: 'POST',
        });
        await fetch(`${server.url}/api/projects/${project.project.id}/members`, {
          body: JSON.stringify({ role: 'editor', userId: 'user-charlie' }),
          headers: withSessionCookie(aliceCookie, {
            'Content-Type': 'application/json',
          }),
          method: 'POST',
        });
        const editorCreate = await fetch(`${server.url}/api/project-docs`, {
          body: JSON.stringify({
            projectId: project.project.id,
            title: 'Editor Project Draft',
          }),
          headers: withSessionCookie(charlieCookie, {
            'Content-Type': 'application/json',
          }),
          method: 'POST',
        });
        const editorProjectDoc = await editorCreate.json() as { createdByUserId: string; id: string; projectId: string; title: string };
        const editorSave = await fetch(
          `${server.url}/api/project-docs/${editorProjectDoc.id}/versions`,
          {
            body: JSON.stringify({ citations: [], content: 'Editor saved draft' }),
            headers: withSessionCookie(charlieCookie, {
              'Content-Type': 'application/json',
            }),
            method: 'POST',
          },
        );
        const viewerSave = await fetch(
          `${server.url}/api/project-docs/${projectDoc.id}/versions`,
          {
            body: JSON.stringify({ citations: [], content: 'Viewer cannot write' }),
            headers: withSessionCookie(bobCookie, {
              'Content-Type': 'application/json',
            }),
            method: 'POST',
          },
        );
        const viewerPublishState = await fetch(
          `${server.url}/api/project-docs/${projectDoc.id}/publish-state`,
          {
            body: JSON.stringify({ publishState: 'review' }),
            headers: withSessionCookie(bobCookie, {
              'Content-Type': 'application/json',
            }),
            method: 'POST',
          },
        );
        const ownerSave = await fetch(
          `${server.url}/api/project-docs/${projectDoc.id}/versions`,
          {
            body: JSON.stringify({ citations: [], content: 'Owner saved draft' }),
            headers: withSessionCookie(aliceCookie, {
              'Content-Type': 'application/json',
            }),
            method: 'POST',
          },
        );
        const ownerRead = await fetch(
          `${server.url}/api/project-docs/${projectDoc.id}`,
          { headers: withSessionCookie(aliceCookie) },
        );
        const latestProjectDocument = await fetch(
          `${server.url}/api/projects/${project.project.id}/writing-document`,
          { headers: withSessionCookie(aliceCookie) },
        );
        const latestProjectDocumentWithCreatorQuery = await fetch(
          `${server.url}/api/projects/${project.project.id}/writing-document?createdByUserId=user-alice`,
          { headers: withSessionCookie(aliceCookie) },
        );
        const workbenchDocumentWithCreatorQuery = await fetch(
          `${server.url}/api/projects/${project.project.id}/writing/document?createdByUserId=user-alice`,
          { headers: withSessionCookie(aliceCookie) },
        );
        const workbenchSaveWithCreatorBody = await fetch(
          `${server.url}/api/projects/${project.project.id}/writing/document`,
          {
            body: JSON.stringify({
              citations: [],
              content: 'Compatibility writer creator should be rejected.',
              createdByUserId: 'user-alice',
              title: 'Compatibility Writer Creator',
            }),
            headers: withSessionCookie(aliceCookie, {
              'Content-Type': 'application/json',
            }),
            method: 'POST',
          },
        );

        const ownerSnapshot = await ownerRead.json() as {
          content: string;
          document: { id: string; projectId: string };
          documentContent?: { blocks: unknown[]; schemaVersion: 1 };
          versionNumber: number;
        };
        const latestDocument = await latestProjectDocument.json() as {
          id: string;
          projectId: string;
        } | null;

        expect(memberRead.status).toBe(200);
        expect(nonMemberRead.status).toBe(403);
        expect(spoofedCreate.status).toBe(400);
        expect(viewerCreate.status).toBe(403);
        expect(editorCreate.status).toBe(200);
        expect(editorProjectDoc).toMatchObject({
          createdByUserId: 'user-charlie',
          projectId: project.project.id,
          title: 'Editor Project Draft',
        });
        expect(nonMemberCreate.status).toBe(403);
        expect(editorSave.status).toBe(200);
        expect(viewerSave.status).toBe(403);
        expect(viewerPublishState.status).toBe(403);
        expect(ownerSave.status).toBe(200);
        expect(ownerRead.status).toBe(200);
        expect(ownerSnapshot.content).toBe('Owner saved draft');
        expect(ownerSnapshot.document).toMatchObject({
          id: projectDoc.id,
          projectId: project.project.id,
        });
        expect(ownerSnapshot.documentContent).toEqual({
          blocks: [
            {
              text: 'Owner saved draft',
              type: 'paragraph',
            },
          ],
          schemaVersion: 1,
        });
        expect(ownerSnapshot.versionNumber).toBe(1);
        const editorSnapshot = await editorSave.json() as {
          content: string;
          document: { id: string; projectId: string };
          documentContent?: { blocks: unknown[]; schemaVersion: 1 };
          versionNumber: number;
        };
        expect(editorSnapshot.content).toBe('Editor saved draft');
        expect(editorSnapshot.document).toMatchObject({
          id: editorProjectDoc.id,
          projectId: project.project.id,
        });
        expect(editorSnapshot.documentContent).toEqual({
          blocks: [
            {
              text: 'Editor saved draft',
              type: 'paragraph',
            },
          ],
          schemaVersion: 1,
        });
        expect(editorSnapshot.versionNumber).toBe(1);
        expect(latestProjectDocument.status).toBe(200);
        expect(latestDocument).toMatchObject({
          id: projectDoc.id,
          projectId: project.project.id,
        });
        expect(latestProjectDocumentWithCreatorQuery.status).toBe(400);
        expect(workbenchDocumentWithCreatorQuery.status).toBe(400);
        expect(workbenchSaveWithCreatorBody.status).toBe(400);
      } finally {
        await server.close();
      }
    } finally {
      rmSync(storageRoot, { force: true, recursive: true });
    }
  });

  it('returns a stable adoption-needed ProjectDoc citation error and accepts the retry after adoption', async () => {
    const storageRoot = mkdtempSync(join(tmpdir(), 'jixia-http-project-doc-adoption-'));

    try {
      const server = await startTestServer(
        {
          JIXIA_DATABASE_URL: `file:${join(storageRoot, 'jixia-http-project-doc-adoption.db')}`,
          JIXIA_STORAGE_ROOT: storageRoot,
        },
        { connectors: { pubmed: createHttpTestPubmedConnector() } },
      );

      try {
        const aliceCookie = await loginAs(server.url, 'user-alice');
        const sharedSpace = await createSpace(server.url, aliceCookie, 'user-alice');
        const project = await fetch(`${server.url}/api/projects`, {
          body: JSON.stringify({ name: 'HTTP Citation Adoption', spaceId: sharedSpace.id }),
          headers: withSessionCookie(aliceCookie, {
            'Content-Type': 'application/json',
          }),
          method: 'POST',
        }).then(
          (response) => response.json() as Promise<{ project: { id: string } }>,
        );
        const personalSource = await fetch(`${server.url}/api/import/paper`, {
          body: JSON.stringify({
            scope: { id: 'user-alice', type: 'user' },
            sourceLocator: '10.1000/http-project-doc-adoption-needed',
            sourceType: 'doi',
            spaceId: sharedSpace.id,
            visibility: 'private',
          }),
          headers: withSessionCookie(aliceCookie, {
            'Content-Type': 'application/json',
          }),
          method: 'POST',
        }).then(
          (response) => response.json() as Promise<{
            asset: { id: string };
            entry: { id: string };
          }>,
        );
        const readerExcerpt = await fetch(
          `${server.url}/api/reading/${personalSource.entry.id}/excerpts`,
          {
            body: JSON.stringify({
              endOffset: 35,
              locator: 'p. 8',
              quote: 'private quote needs project adoption',
              startOffset: 1,
            }),
            headers: withSessionCookie(aliceCookie, {
              'Content-Type': 'application/json',
            }),
            method: 'POST',
          },
        ).then(
          (response) => response.json() as Promise<{
            excerpt: { id: string; paperAssetId: string };
          }>,
        );
        const projectDoc = await fetch(`${server.url}/api/project-docs`, {
          body: JSON.stringify({
            projectId: project.project.id,
            title: 'HTTP adoption guided Project Doc',
          }),
          headers: withSessionCookie(aliceCookie, {
            'Content-Type': 'application/json',
          }),
          method: 'POST',
        }).then((response) => response.json() as Promise<{ id: string }>);
        const saveBody = {
          citations: [
            {
              evidenceSpan: 'private quote needs project adoption',
              libraryEntryId: personalSource.entry.id,
              paperAssetId: personalSource.asset.id,
              readerExcerptId: readerExcerpt.excerpt.id,
            },
          ],
          documentContent: {
            blocks: [
              {
                evidenceSpan: 'private quote needs project adoption',
                libraryEntryId: personalSource.entry.id,
                locator: 'p. 8',
                paperAssetId: personalSource.asset.id,
                quote: 'private quote needs project adoption',
                readerExcerptId: readerExcerpt.excerpt.id,
                type: 'sourceExcerpt',
              },
            ],
            schemaVersion: 1,
          },
        };

        const unavailableSave = await fetch(
          `${server.url}/api/project-docs/${projectDoc.id}/versions`,
          {
            body: JSON.stringify(saveBody),
            headers: withSessionCookie(aliceCookie, {
              'Content-Type': 'application/json',
            }),
            method: 'POST',
          },
        );
        const unavailablePayload = await unavailableSave.json() as {
          code?: string;
          details?: {
            evidenceSpan?: string;
            libraryEntryId?: string;
            paperAssetId?: string;
            projectId?: string;
            readerExcerptId?: string;
            sourceLibraryEntryId?: string;
          };
          error?: string;
        };

        expect(unavailableSave.status).toBe(400);
        expect(unavailablePayload).toMatchObject({
          code: PROJECT_DOC_CITATION_SOURCE_UNAVAILABLE,
          details: {
            evidenceSpan: 'private quote needs project adoption',
            libraryEntryId: personalSource.entry.id,
            paperAssetId: personalSource.asset.id,
            projectId: project.project.id,
            readerExcerptId: readerExcerpt.excerpt.id,
            sourceLibraryEntryId: personalSource.entry.id,
          },
          error: `Paper asset ${personalSource.asset.id} is not available in project ${project.project.id}.`,
        });

        const adoption = await fetch(
          `${server.url}/api/projects/${project.project.id}/library/adoptions`,
          {
            body: JSON.stringify({ sourceLibraryEntryId: personalSource.entry.id }),
            headers: withSessionCookie(aliceCookie, {
              'Content-Type': 'application/json',
            }),
            method: 'POST',
          },
        ).then(
          (response) => response.json() as Promise<{
            entry: { asset: { id: string }; entry: { id: string } };
            reused: boolean;
          }>,
        );
        const savedAfterAdoption = await fetch(
          `${server.url}/api/project-docs/${projectDoc.id}/versions`,
          {
            body: JSON.stringify(saveBody),
            headers: withSessionCookie(aliceCookie, {
              'Content-Type': 'application/json',
            }),
            method: 'POST',
          },
        );
        const savedPayload = await savedAfterAdoption.json() as {
          citations: Array<{
            evidenceSpan?: string;
            paperAssetId: string;
            readerExcerptId?: string;
          }>;
          documentContent?: {
            blocks?: Array<{
              evidenceSpan?: string;
              libraryEntryId?: string;
              paperAssetId?: string;
              readerExcerptId?: string;
              type?: string;
            }>;
            schemaVersion?: number;
          };
          versionNumber: number;
        };

        expect(adoption).toMatchObject({
          entry: {
            asset: { id: personalSource.asset.id },
          },
          reused: false,
        });
        expect(savedAfterAdoption.status).toBe(200);
        expect(savedPayload.citations).toEqual([
          expect.objectContaining({
            evidenceSpan: 'private quote needs project adoption',
            paperAssetId: personalSource.asset.id,
            readerExcerptId: readerExcerpt.excerpt.id,
          }),
        ]);
        expect(savedPayload.documentContent?.blocks?.[0]).toMatchObject({
          evidenceSpan: 'private quote needs project adoption',
          libraryEntryId: personalSource.entry.id,
          paperAssetId: personalSource.asset.id,
          readerExcerptId: readerExcerpt.excerpt.id,
          type: 'sourceExcerpt',
        });
        expect(savedPayload.versionNumber).toBe(1);
      } finally {
        await server.close();
      }
    } finally {
      rmSync(storageRoot, { force: true, recursive: true });
    }
  });

  it('round-trips structured notebook and project-doc payloads over HTTP', async () => {
    const storageRoot = mkdtempSync(join(tmpdir(), 'jixia-http-structured-docs-'));

    try {
      const server = await startTestServer({
        JIXIA_DATABASE_URL: `file:${join(storageRoot, 'jixia-http-structured-docs.db')}`,
        JIXIA_STORAGE_ROOT: storageRoot,
      });

      try {
        const aliceCookie = await loginAs(server.url, 'user-alice');
        const sharedSpace = await createSpace(server.url, aliceCookie, 'user-alice');
        const project = await fetch(`${server.url}/api/projects`, {
          body: JSON.stringify({ name: 'HTTP Structured Project', spaceId: sharedSpace.id }),
          headers: withSessionCookie(aliceCookie, {
            'Content-Type': 'application/json',
          }),
          method: 'POST',
        }).then(
          (response) => response.json() as Promise<{ project: { id: string } }>,
        );

        const notebook = await fetch(`${server.url}/api/notebooks`, {
          body: JSON.stringify({ title: 'HTTP Structured Notebook' }),
          headers: withSessionCookie(aliceCookie, {
            'Content-Type': 'application/json',
          }),
          method: 'POST',
        }).then((response) => response.json() as Promise<{ id: string }>);
        const projectDoc = await fetch(`${server.url}/api/project-docs`, {
          body: JSON.stringify({ projectId: project.project.id, title: 'HTTP Structured Project Doc' }),
          headers: withSessionCookie(aliceCookie, {
            'Content-Type': 'application/json',
          }),
          method: 'POST',
        }).then((response) => response.json() as Promise<{ id: string }>);

        const notebookDocumentContent = {
          blocks: [
            {
              level: 2,
              text: 'HTTP notebook heading',
              type: 'heading',
            },
            {
              text: 'HTTP notebook paragraph',
              type: 'paragraph',
            },
          ],
          schemaVersion: 1,
        };
        const projectDocumentContent = {
          blocks: [
            {
              level: 1,
              text: 'HTTP project heading',
              type: 'heading',
            },
            {
              checked: false,
              text: 'Coordinate structured document migration',
              type: 'todo',
            },
          ],
          schemaVersion: 1,
        };

        const badNotebookSave = await fetch(
          `${server.url}/api/notebooks/${notebook.id}/versions`,
          {
            body: JSON.stringify({
              citations: [],
              documentContent: {
                blocks: [{ text: 'bad', type: 'unknown' }],
                schemaVersion: 1,
              },
            }),
            headers: withSessionCookie(aliceCookie, {
              'Content-Type': 'application/json',
            }),
            method: 'POST',
          },
        );
        const notebookSave = await fetch(
          `${server.url}/api/notebooks/${notebook.id}/versions`,
          {
            body: JSON.stringify({
              citations: [],
              documentContent: notebookDocumentContent,
            }),
            headers: withSessionCookie(aliceCookie, {
              'Content-Type': 'application/json',
            }),
            method: 'POST',
          },
        );
        const notebookShadowedSave = await fetch(
          `${server.url}/api/notebooks/${notebook.id}/versions`,
          {
            body: JSON.stringify({
              citations: [],
              content: 'Legacy body should be shadowed by structured notebook content',
              documentContent: notebookDocumentContent,
            }),
            headers: withSessionCookie(aliceCookie, {
              'Content-Type': 'application/json',
            }),
            method: 'POST',
          },
        );
        const projectDocSave = await fetch(
          `${server.url}/api/project-docs/${projectDoc.id}/versions`,
          {
            body: JSON.stringify({
              citations: [],
              documentContent: projectDocumentContent,
            }),
            headers: withSessionCookie(aliceCookie, {
              'Content-Type': 'application/json',
            }),
            method: 'POST',
          },
        );
        const projectDocShadowedSave = await fetch(
          `${server.url}/api/project-docs/${projectDoc.id}/versions`,
          {
            body: JSON.stringify({
              citations: [],
              content: 'Legacy body should be shadowed by structured project content',
              documentContent: projectDocumentContent,
            }),
            headers: withSessionCookie(aliceCookie, {
              'Content-Type': 'application/json',
            }),
            method: 'POST',
          },
        );
        const notebookPayload = await notebookSave.json() as {
          content: string;
          documentContent?: unknown;
          versionNumber: number;
        };
        const notebookShadowedPayload = await notebookShadowedSave.json() as {
          content: string;
          documentContent?: unknown;
          versionNumber: number;
        };
        const projectDocPayload = await projectDocSave.json() as {
          content: string;
          documentContent?: unknown;
          versionNumber: number;
        };
        const projectDocShadowedPayload = await projectDocShadowedSave.json() as {
          content: string;
          documentContent?: unknown;
          versionNumber: number;
        };

        expect(badNotebookSave.status).toBe(400);
        expect(notebookSave.status).toBe(200);
        expect(notebookPayload).toMatchObject({
          content: '## HTTP notebook heading\n\nHTTP notebook paragraph',
          documentContent: notebookDocumentContent,
          versionNumber: 1,
        });
        expect(notebookShadowedSave.status).toBe(200);
        expect(notebookShadowedPayload).toMatchObject({
          content: '## HTTP notebook heading\n\nHTTP notebook paragraph',
          documentContent: notebookDocumentContent,
          versionNumber: 2,
        });
        expect(projectDocSave.status).toBe(200);
        expect(projectDocPayload).toMatchObject({
          content: '# HTTP project heading\n\n- [ ] Coordinate structured document migration',
          documentContent: projectDocumentContent,
          versionNumber: 1,
        });
        expect(projectDocShadowedSave.status).toBe(200);
        expect(projectDocShadowedPayload).toMatchObject({
          content: '# HTTP project heading\n\n- [ ] Coordinate structured document migration',
          documentContent: projectDocumentContent,
          versionNumber: 2,
        });
      } finally {
        await server.close();
      }
    } finally {
      rmSync(storageRoot, { force: true, recursive: true });
    }
  });
});
