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
import { createPrismaClient } from '../../src/db';
import { serializeDocumentBlockSnapshotPayload } from '../../src/shared/contracts/document-content';
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
          body: JSON.stringify({ title: '  HTTP Notebook  ' }),
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

        const rejectedNotebookTitles = [
          'Actor Context Notebook',
          'Matching Owner Notebook',
          'Project Context Notebook',
          'Space Context Notebook',
          'Scope Context Notebook',
          'Visibility Context Notebook',
          'Extra Field Notebook',
        ];
        const invalidCreateBodies: unknown[] = [
          null,
          [],
          'not-an-object',
          { title: '' },
          { title: 123 },
          { actorUserId: 'user-alice', title: 'Actor Context Notebook' },
          { ownerId: 'user-alice', title: 'Matching Owner Notebook' },
          { projectId: 'project-1', title: 'Project Context Notebook' },
          { spaceId: 'space-1', title: 'Space Context Notebook' },
          { scope: { id: 'project-1', type: 'project' }, title: 'Scope Context Notebook' },
          { title: 'Visibility Context Notebook', visibility: 'private' },
          { extra: true, title: 'Extra Field Notebook' },
        ];
        const invalidCreateStatuses: number[] = [];

        for (const invalidCreateBody of invalidCreateBodies) {
          const invalidCreateResponse = await fetch(`${server.url}/api/notebooks`, {
            body: JSON.stringify(invalidCreateBody),
            headers: withSessionCookie(aliceCookie, {
              'Content-Type': 'application/json',
            }),
            method: 'POST',
          });

          invalidCreateStatuses.push(invalidCreateResponse.status);
        }

        expect(ownerRead.status).toBe(200);
        expect(nonOwnerRead.status).toBe(403);
        expect(actorMismatch.status).toBe(400);
        expect(invalidCreateStatuses).toEqual(invalidCreateBodies.map(() => 400));

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
        const listedNotebookTitles = new Set(
          notebookListPayload.documents.map((document) => document.title),
        );

        for (const rejectedNotebookTitle of rejectedNotebookTitles) {
          expect(listedNotebookTitles.has(rejectedNotebookTitle)).toBe(false);
        }
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
        const memberTraceRead = await fetch(
          `${server.url}/api/project-docs/${projectDoc.id}/citation-trace`,
          { headers: withSessionCookie(bobCookie) },
        );
        const nonMemberRead = await fetch(`${server.url}/api/project-docs/${projectDoc.id}`, {
          headers: withSessionCookie(charlieCookie),
        });
        const nonMemberTraceRead = await fetch(
          `${server.url}/api/project-docs/${projectDoc.id}/citation-trace`,
          { headers: withSessionCookie(charlieCookie) },
        );
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
        const ownerTraceRead = await fetch(
          `${server.url}/api/project-docs/${projectDoc.id}/citation-trace`,
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
        const ownerTracePayload = await ownerTraceRead.json() as {
          citations: unknown[];
          document: { id: string; projectId: string };
          versionNumber: number;
        };

        expect(memberRead.status).toBe(200);
        expect(memberTraceRead.status).toBe(200);
        expect(nonMemberRead.status).toBe(403);
        expect(nonMemberTraceRead.status).toBe(403);
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
        expect(ownerTraceRead.status).toBe(200);
        expect(ownerTracePayload).toMatchObject({
          citations: [],
          document: {
            id: projectDoc.id,
            projectId: project.project.id,
          },
          versionNumber: 1,
        });
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

  it('serves browser-safe Project Doc citation trace only to project members', async () => {
    const storageRoot = mkdtempSync(join(tmpdir(), 'jixia-http-project-doc-trace-'));

    try {
      const server = await startTestServer(
        {
          JIXIA_DATABASE_URL: `file:${join(storageRoot, 'jixia-http-project-doc-trace.db')}`,
          JIXIA_STORAGE_ROOT: storageRoot,
        },
        { connectors: { pubmed: createHttpTestPubmedConnector() } },
      );

      try {
        const aliceCookie = await loginAs(server.url, 'user-alice');
        const bobCookie = await loginAs(server.url, 'user-bob');
        const charlieCookie = await loginAs(server.url, 'user-charlie');
        const sharedSpace = await createSpace(server.url, aliceCookie, 'user-alice');
        const project = await fetch(`${server.url}/api/projects`, {
          body: JSON.stringify({ name: 'HTTP Citation Trace', spaceId: sharedSpace.id }),
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
        const projectSource = await fetch(`${server.url}/api/import/paper`, {
          body: JSON.stringify({
            scope: { id: project.project.id, type: 'project' },
            sourceLocator: '10.1000/http-project-doc-trace',
            sourceType: 'doi',
            spaceId: sharedSpace.id,
            visibility: 'published_to_project',
          }),
          headers: withSessionCookie(aliceCookie, {
            'Content-Type': 'application/json',
          }),
          method: 'POST',
        }).then(
          (response) => response.json() as Promise<{
            asset: { canonicalId?: string; id: string; title?: string };
            entry: { id: string };
          }>,
        );
        const readerExcerpt = await fetch(
          `${server.url}/api/reading/${projectSource.entry.id}/excerpts`,
          {
            body: JSON.stringify({
              endOffset: 38,
              locator: 'p. 12',
              note: 'Alice private reader note must not leak.',
              quote: 'project-visible quote for trace panel',
              startOffset: 3,
            }),
            headers: withSessionCookie(aliceCookie, {
              'Content-Type': 'application/json',
            }),
            method: 'POST',
          },
        ).then(
          (response) => response.json() as Promise<{
            excerpt: { id: string; paperAssetId: string; quote: string };
          }>,
        );
        const projectDoc = await fetch(`${server.url}/api/project-docs`, {
          body: JSON.stringify({
            projectId: project.project.id,
            title: 'HTTP traceable Project Doc',
          }),
          headers: withSessionCookie(aliceCookie, {
            'Content-Type': 'application/json',
          }),
          method: 'POST',
        }).then((response) => response.json() as Promise<{ id: string }>);
        const emptyProjectDoc = await fetch(`${server.url}/api/project-docs`, {
          body: JSON.stringify({
            projectId: project.project.id,
            title: 'HTTP empty trace Project Doc',
          }),
          headers: withSessionCookie(aliceCookie, {
            'Content-Type': 'application/json',
          }),
          method: 'POST',
        }).then((response) => response.json() as Promise<{ id: string }>);
        const saveTraceableDoc = await fetch(
          `${server.url}/api/project-docs/${projectDoc.id}/versions`,
          {
            body: JSON.stringify({
              citations: [
                {
                  evidenceSpan: 'project-visible quote for trace panel',
                  libraryEntryId: projectSource.entry.id,
                  paperAssetId: projectSource.asset.id,
                  readerExcerptId: readerExcerpt.excerpt.id,
                },
              ],
              documentContent: {
                blocks: [
                  {
                    evidenceSpan: 'project-visible quote for trace panel',
                    libraryEntryId: projectSource.entry.id,
                    locator: 'p. 12',
                    paperAssetId: projectSource.asset.id,
                    quote: 'project-visible quote for trace panel',
                    readerExcerptId: readerExcerpt.excerpt.id,
                    title: 'Traceable project paper',
                    type: 'sourceExcerpt',
                  },
                ],
                schemaVersion: 1,
              },
            }),
            headers: withSessionCookie(aliceCookie, {
              'Content-Type': 'application/json',
            }),
            method: 'POST',
          },
        );

        expect(saveTraceableDoc.status).toBe(200);

        const ownerTrace = await fetch(
          `${server.url}/api/project-docs/${projectDoc.id}/citation-trace`,
          { headers: withSessionCookie(aliceCookie) },
        );
        const viewerTrace = await fetch(
          `${server.url}/api/project-docs/${projectDoc.id}/citation-trace`,
          { headers: withSessionCookie(bobCookie) },
        );
        const nonMemberTrace = await fetch(
          `${server.url}/api/project-docs/${projectDoc.id}/citation-trace`,
          { headers: withSessionCookie(charlieCookie) },
        );
        const emptyTrace = await fetch(
          `${server.url}/api/project-docs/${emptyProjectDoc.id}/citation-trace`,
          { headers: withSessionCookie(aliceCookie) },
        );
        const ownerTracePayload = await ownerTrace.json() as {
          citations: Array<{
            citationId: string;
            paper?: { canonicalId: string; hasFile?: boolean; id: string; title: string };
            paperAssetId: string;
            projectDocVersionId: string;
            projectLibraryEntry?: { libraryEntryId: string; projectId: string };
            readerExcerpt?: {
              id: string;
              locator?: string;
              quote?: string;
              source: string;
              sourceLibraryEntryId?: string;
            };
            readerExcerptId?: string;
            source: { state: string };
          }>;
          document: { id: string; projectId: string };
          versionNumber: number;
        };
        const viewerTracePayload = await viewerTrace.json() as typeof ownerTracePayload;
        const emptyTracePayload = await emptyTrace.json() as typeof ownerTracePayload;

        expect(ownerTrace.status).toBe(200);
        expect(viewerTrace.status).toBe(200);
        expect(nonMemberTrace.status).toBe(403);
        expect(ownerTracePayload).toMatchObject({
          citations: [
            {
              paperAssetId: projectSource.asset.id,
              projectLibraryEntry: {
                libraryEntryId: projectSource.entry.id,
                projectId: project.project.id,
              },
              readerExcerpt: {
                id: readerExcerpt.excerpt.id,
                locator: 'p. 12',
                quote: 'project-visible quote for trace panel',
                source: 'reader_source',
                sourceLibraryEntryId: projectSource.entry.id,
              },
              readerExcerptId: readerExcerpt.excerpt.id,
              source: { state: 'available' },
            },
          ],
          document: {
            id: projectDoc.id,
            projectId: project.project.id,
          },
          versionNumber: 1,
        });
        expect(viewerTracePayload.citations[0]?.readerExcerpt?.quote).toBe(
          'project-visible quote for trace panel',
        );
        expect(ownerTracePayload.citations[0]?.paper).toMatchObject({
          canonicalId: expect.stringContaining('10.1000/http-project-doc-trace'),
          hasFile: false,
          id: projectSource.asset.id,
        });
        expect(emptyTrace.status).toBe(200);
        expect(emptyTracePayload).toMatchObject({
          citations: [],
          document: {
            id: emptyProjectDoc.id,
            projectId: project.project.id,
          },
          versionNumber: 0,
        });

        const serializedTrace = JSON.stringify(ownerTracePayload);
        expect(serializedTrace).not.toContain('Alice private reader note must not leak');
        expect(serializedTrace).not.toContain('storageKey');
        expect(serializedTrace).not.toContain('checksum');
        expect(serializedTrace).not.toContain('papers/');
        expect(serializedTrace).not.toContain(storageRoot);
        expect(ownerTracePayload.citations[0]?.readerExcerpt).not.toHaveProperty('note');
        expect(ownerTracePayload.citations[0]?.projectLibraryEntry).not.toHaveProperty('visibility');
        expect(ownerTracePayload.citations[0]).not.toHaveProperty('ownerId');
        expect(ownerTracePayload.citations[0]).not.toHaveProperty('actorUserId');
      } finally {
        await server.close();
      }
    } finally {
      rmSync(storageRoot, { force: true, recursive: true });
    }
  }, 30_000);

  it('returns a stable adoption-needed ProjectDoc citation error and accepts the retry after adoption', async () => {
    const storageRoot = mkdtempSync(join(tmpdir(), 'jixia-http-project-doc-adoption-'));
    const databaseUrl = `file:${join(storageRoot, 'jixia-http-project-doc-adoption.db')}`;

    try {
      const server = await startTestServer(
        {
          JIXIA_DATABASE_URL: databaseUrl,
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
        await fetch(`${server.url}/api/notebooks`, {
          body: JSON.stringify({ title: 'HTTP private notebook beside trace' }),
          headers: withSessionCookie(aliceCookie, {
            'Content-Type': 'application/json',
          }),
          method: 'POST',
        }).then(async (response) => {
          const notebook = await response.json() as { id: string };

          return fetch(`${server.url}/api/notebooks/${notebook.id}/versions`, {
            body: JSON.stringify({
              citations: [],
              content: 'Private notebook body beside trace must not leak.',
            }),
            headers: withSessionCookie(aliceCookie, {
              'Content-Type': 'application/json',
            }),
            method: 'POST',
          });
        });
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
        const unavailableProject = await fetch(`${server.url}/api/projects`, {
          body: JSON.stringify({ name: 'HTTP Citation Trace Missing Adoption', spaceId: sharedSpace.id }),
          headers: withSessionCookie(aliceCookie, {
            'Content-Type': 'application/json',
          }),
          method: 'POST',
        }).then(
          (response) => response.json() as Promise<{ project: { id: string } }>,
        );
        await fetch(`${server.url}/api/projects/${unavailableProject.project.id}/members`, {
          body: JSON.stringify({ role: 'viewer', userId: 'user-bob' }),
          headers: withSessionCookie(aliceCookie, {
            'Content-Type': 'application/json',
          }),
          method: 'POST',
        });
        const unavailableProjectDoc = await fetch(`${server.url}/api/project-docs`, {
          body: JSON.stringify({
            projectId: unavailableProject.project.id,
            title: 'HTTP unavailable citation trace Project Doc',
          }),
          headers: withSessionCookie(aliceCookie, {
            'Content-Type': 'application/json',
          }),
          method: 'POST',
        }).then((response) => response.json() as Promise<{ id: string }>);
        const prisma = createPrismaClient({ url: databaseUrl });

        try {
          await prisma.$transaction(async (transaction) => {
            await transaction.projectDocVersion.create({
              data: {
                citations: {
                  create: [
                    {
                      evidenceSpan: 'missing asset trace evidence',
                      paperAssetId: personalSource.asset.id,
                    },
                  ],
                },
                projectDocId: unavailableProjectDoc.id,
                snapshot: serializeDocumentBlockSnapshotPayload({
                  blocks: [
                    {
                      evidenceSpan: 'missing asset trace evidence',
                      paperAssetId: personalSource.asset.id,
                      type: 'citation',
                    },
                  ],
                  schemaVersion: 1,
                }),
                versionNumber: 1,
              },
            });
            await transaction.projectDoc.update({
              data: { updatedAt: new Date() },
              where: { id: unavailableProjectDoc.id },
            });
          });
        } finally {
          await prisma.$disconnect().catch(() => undefined);
        }
        const missingAssetTrace = await fetch(
          `${server.url}/api/project-docs/${unavailableProjectDoc.id}/citation-trace`,
          { headers: withSessionCookie(aliceCookie) },
        );
        const missingAssetViewerTrace = await fetch(
          `${server.url}/api/project-docs/${unavailableProjectDoc.id}/citation-trace`,
          { headers: withSessionCookie(await loginAs(server.url, 'user-bob')) },
        );
        const missingAssetTracePayload = await missingAssetTrace.json() as {
          citations: Array<{
            evidenceSpan?: string;
            paper?: unknown;
            paperAssetId: string;
            readerExcerpt?: { source: string; quote?: string };
            source: {
              code?: string;
              details?: { paperAssetId?: string; projectId?: string; readerExcerptId?: string };
              message?: string;
              state: string;
            };
          }>;
          document: { id: string; projectId: string };
          versionNumber: number;
        };
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
        const citationTrace = await fetch(
          `${server.url}/api/project-docs/${projectDoc.id}/citation-trace`,
          { headers: withSessionCookie(aliceCookie) },
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
        const citationTracePayload = await citationTrace.json() as {
          citations: Array<{
            evidenceSpan?: string;
            paper?: Record<string, unknown>;
            paperAssetId: string;
            projectLibraryEntry?: { libraryEntryId: string; projectId: string };
            readerExcerpt?: {
              id: string;
              locator?: string;
              quote?: string;
              source: string;
              sourceLibraryEntryId?: string;
            };
            source: { state: string };
          }>;
          document: { id: string; projectId: string };
          versionNumber: number;
        };

        expect(adoption).toMatchObject({
          entry: {
            asset: { id: personalSource.asset.id },
          },
          reused: false,
        });
        expect(missingAssetTrace.status).toBe(200);
        expect(missingAssetViewerTrace.status).toBe(200);
        expect(missingAssetTracePayload).toMatchObject({
          citations: [
            {
              evidenceSpan: 'missing asset trace evidence',
              paperAssetId: personalSource.asset.id,
              readerExcerpt: {
                quote: 'missing asset trace evidence',
                source: 'project_library_asset',
              },
              source: {
                code: PROJECT_DOC_CITATION_SOURCE_UNAVAILABLE,
                details: {
                  paperAssetId: personalSource.asset.id,
                  projectId: unavailableProject.project.id,
                },
                state: 'adoption_needed',
              },
            },
          ],
          document: {
            id: unavailableProjectDoc.id,
            projectId: unavailableProject.project.id,
          },
          versionNumber: 1,
        });
        expect(missingAssetTracePayload.citations[0]?.paper).toBeUndefined();
        expect(savedAfterAdoption.status).toBe(200);
        expect(citationTrace.status).toBe(200);
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
        expect(citationTracePayload).toMatchObject({
          citations: [
            {
              evidenceSpan: 'private quote needs project adoption',
              paper: {
                canonicalId: 'doi:10.1000/http-project-doc-adoption-needed',
                hasFile: false,
                id: personalSource.asset.id,
                title: 'HTTP DOI paper 10.1000/http-project-doc-adoption-needed',
              },
              paperAssetId: personalSource.asset.id,
              projectLibraryEntry: {
                libraryEntryId: adoption.entry.entry.id,
                projectId: project.project.id,
              },
              readerExcerpt: {
                id: readerExcerpt.excerpt.id,
                locator: 'p. 8',
                quote: 'private quote needs project adoption',
                source: 'reader_source',
              },
              source: { state: 'available' },
            },
          ],
          document: {
            id: projectDoc.id,
            projectId: project.project.id,
          },
          versionNumber: 1,
        });
        const serializedTrace = JSON.stringify(citationTracePayload);
        expect(serializedTrace).not.toContain('storageKey');
        expect(serializedTrace).not.toContain('checksum');
        expect(serializedTrace).not.toContain('JIXIA_STORAGE_ROOT');
        expect(serializedTrace).not.toContain(storageRoot);
        expect(serializedTrace).not.toContain('Private notebook body beside trace must not leak.');
        expect(serializedTrace).not.toContain('rawSecret');
        expect(serializedTrace).not.toContain('credentialRef');
        const serializedMissingTrace = JSON.stringify(missingAssetTracePayload);
        expect(serializedMissingTrace).not.toContain('storageKey');
        expect(serializedMissingTrace).not.toContain('checksum');
        expect(serializedMissingTrace).not.toContain(storageRoot);
        expect(serializedMissingTrace).not.toContain('Private notebook body beside trace must not leak.');
      } finally {
        await server.close();
      }
    } finally {
      rmSync(storageRoot, { force: true, recursive: true });
    }
  });

  it('round-trips Project Doc citation target occurrence and locator source fields over HTTP', async () => {
    const storageRoot = mkdtempSync(join(tmpdir(), 'jixia-http-project-doc-citation-sources-'));
    const databaseUrl = `file:${join(storageRoot, 'jixia-http-project-doc-citation-sources.db')}`;

    try {
      const server = await startTestServer(
        {
          JIXIA_DATABASE_URL: databaseUrl,
          JIXIA_STORAGE_ROOT: storageRoot,
        },
        { connectors: { pubmed: createHttpTestPubmedConnector() } },
      );

      try {
        const aliceCookie = await loginAs(server.url, 'user-alice');
        const sharedSpace = await createSpace(server.url, aliceCookie, 'user-alice');
        const project = await fetch(`${server.url}/api/projects`, {
          body: JSON.stringify({ name: 'HTTP Citation Source Fields', spaceId: sharedSpace.id }),
          headers: withSessionCookie(aliceCookie, {
            'Content-Type': 'application/json',
          }),
          method: 'POST',
        }).then(
          (response) => response.json() as Promise<{ project: { id: string } }>,
        );
        const imported = await fetch(`${server.url}/api/import/paper`, {
          body: JSON.stringify({
            scope: { id: project.project.id, type: 'project' },
            sourceLocator: '10.1000/http-project-doc-citation-source-fields',
            sourceType: 'doi',
            spaceId: sharedSpace.id,
            visibility: 'published_to_project',
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
        const projectDoc = await fetch(`${server.url}/api/project-docs`, {
          body: JSON.stringify({
            projectId: project.project.id,
            title: 'HTTP source fields Project Doc',
          }),
          headers: withSessionCookie(aliceCookie, {
            'Content-Type': 'application/json',
          }),
          method: 'POST',
        }).then((response) => response.json() as Promise<{ id: string }>);
        const sourceTextArtifactId = 'source-text-http-project-doc-citation-source-fields';
        const readerAnnotationId = 'reader-annotation-http-project-doc-citation-source-fields';
        const prisma = createPrismaClient({ url: databaseUrl });

        try {
          await prisma.sourceTextArtifact.create({
            data: {
              availabilityState: 'available',
              artifactRef: 'test-fixture-artifact-ref',
              id: sourceTextArtifactId,
              kind: 'extracted_text',
              paperAssetId: imported.asset.id,
              textFormat: 'plain',
            },
          });
          await prisma.readerAnnotation.create({
            data: {
              createdByUserId: 'user-alice',
              id: readerAnnotationId,
              libraryEntryId: imported.entry.id,
              lifecycleStatus: 'active',
              locatorJson: JSON.stringify({ label: 'p. 4' }),
              originalAnnotationId: null,
              paperAssetId: imported.asset.id,
              projectId: project.project.id,
              quote: 'project-visible annotation quote',
              selectorJson: JSON.stringify({ exact: 'project-visible annotation quote', type: 'textQuote' }),
              sourceContextId: projectDoc.id,
              sourceContextType: 'projectDocVersion',
              sourceTextArtifactId,
              visibility: 'project',
            },
          });
        } finally {
          await prisma.$disconnect().catch(() => undefined);
        }

        const citationInput = {
          evidenceSpan: 'source fields quoted evidence',
          lifecycleStatus: 'active',
          locator: {
            endOffset: 96,
            locator: 'p. 4 paragraph 2',
            page: {
              endOffset: 120,
              label: 'p. 4',
              pageNumber: 4,
              startOffset: 0,
            },
            quote: 'source fields quoted evidence',
            sourceTextArtifactId,
            startOffset: 48,
          },
          locatorSource: {
            id: readerAnnotationId,
            type: 'project_visible_reader_annotation',
          },
          occurrence: {
            key: 'body-citation-1',
            label: 'Citation 1',
          },
          paperAssetId: imported.asset.id,
          readerAnnotationId,
          sourceTextArtifactId,
          target: {
            libraryEntryId: imported.entry.id,
            paperAssetId: imported.asset.id,
          },
        };
        const saveResponse = await fetch(
          `${server.url}/api/project-docs/${projectDoc.id}/versions`,
          {
            body: JSON.stringify({
              citations: [citationInput],
              content: 'Project Doc with source-field citation metadata.',
            }),
            headers: withSessionCookie(aliceCookie, {
              'Content-Type': 'application/json',
            }),
            method: 'POST',
          },
        );
        const savedPayload = await saveResponse.json() as {
          citations: Array<typeof citationInput & {
            createdAt: string;
            id: string;
            projectDocVersionId: string;
            targetLibraryEntryId?: string;
            target?: { libraryEntryId: string; paperAssetId: string; projectId: string };
          }>;
          versionNumber: number;
        };
        const readResponse = await fetch(`${server.url}/api/project-docs/${projectDoc.id}`, {
          headers: withSessionCookie(aliceCookie),
        });
        const readPayload = await readResponse.json() as typeof savedPayload;

        expect(saveResponse.status).toBe(200);
        expect(readResponse.status).toBe(200);
        expect(savedPayload.versionNumber).toBe(1);
        expect(savedPayload.citations).toEqual([
          expect.objectContaining({
            evidenceSpan: citationInput.evidenceSpan,
            lifecycleStatus: 'active',
            locator: citationInput.locator,
            locatorSource: citationInput.locatorSource,
            occurrence: citationInput.occurrence,
            paperAssetId: imported.asset.id,
            readerAnnotationId,
            sourceTextArtifactId,
            target: {
              libraryEntryId: imported.entry.id,
              paperAssetId: imported.asset.id,
              projectId: project.project.id,
            },
            targetLibraryEntryId: imported.entry.id,
          }),
        ]);
        expect(readPayload.citations).toEqual([
          expect.objectContaining({
            evidenceSpan: citationInput.evidenceSpan,
            lifecycleStatus: 'active',
            locator: citationInput.locator,
            locatorSource: citationInput.locatorSource,
            occurrence: citationInput.occurrence,
            paperAssetId: imported.asset.id,
            readerAnnotationId,
            sourceTextArtifactId,
            target: {
              libraryEntryId: imported.entry.id,
              paperAssetId: imported.asset.id,
              projectId: project.project.id,
            },
            targetLibraryEntryId: imported.entry.id,
          }),
        ]);

        const serializedPayload = JSON.stringify(readPayload);
        expect(serializedPayload).not.toContain('artifactRef');
        expect(serializedPayload).not.toContain('storageKey');
        expect(serializedPayload).not.toContain('checksum');
        expect(serializedPayload).not.toContain(storageRoot);
      } finally {
        await server.close();
      }
    } finally {
      rmSync(storageRoot, { force: true, recursive: true });
    }
  });

  it('rejects private or mismatched ReaderAnnotation locator sources over HTTP', async () => {
    const storageRoot = mkdtempSync(join(tmpdir(), 'jixia-http-project-doc-citation-source-reject-'));
    const databaseUrl = `file:${join(storageRoot, 'jixia-http-project-doc-citation-source-reject.db')}`;

    try {
      const server = await startTestServer(
        {
          JIXIA_DATABASE_URL: databaseUrl,
          JIXIA_STORAGE_ROOT: storageRoot,
        },
        { connectors: { pubmed: createHttpTestPubmedConnector() } },
      );

      try {
        const aliceCookie = await loginAs(server.url, 'user-alice');
        const sharedSpace = await createSpace(server.url, aliceCookie, 'user-alice');
        const project = await fetch(`${server.url}/api/projects`, {
          body: JSON.stringify({ name: 'HTTP Citation Source Rejections', spaceId: sharedSpace.id }),
          headers: withSessionCookie(aliceCookie, {
            'Content-Type': 'application/json',
          }),
          method: 'POST',
        }).then(
          (response) => response.json() as Promise<{ project: { id: string } }>,
        );
        const imported = await fetch(`${server.url}/api/import/paper`, {
          body: JSON.stringify({
            scope: { id: project.project.id, type: 'project' },
            sourceLocator: '10.1000/http-project-doc-citation-source-reject',
            sourceType: 'doi',
            spaceId: sharedSpace.id,
            visibility: 'published_to_project',
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
        const projectDoc = await fetch(`${server.url}/api/project-docs`, {
          body: JSON.stringify({
            projectId: project.project.id,
            title: 'HTTP rejected source fields Project Doc',
          }),
          headers: withSessionCookie(aliceCookie, {
            'Content-Type': 'application/json',
          }),
          method: 'POST',
        }).then((response) => response.json() as Promise<{ id: string }>);
        const privateAnnotationId = 'reader-annotation-http-private-source-reject';
        const projectAnnotationId = 'reader-annotation-http-project-source-valid';
        const mismatchedProjectAnnotationId = 'reader-annotation-http-project-source-mismatch';
        const personalLibraryEntryId = 'library-entry-http-private-source-reject';
        const prisma = createPrismaClient({ url: databaseUrl });

        try {
          await prisma.libraryEntry.create({
            data: {
              addedByUserId: 'user-alice',
              id: personalLibraryEntryId,
              paperAssetId: imported.asset.id,
              scopeId: 'user-alice',
              scopeType: 'user',
            },
          });
          await prisma.readerAnnotation.create({
            data: {
              createdByUserId: 'user-alice',
              id: privateAnnotationId,
              libraryEntryId: personalLibraryEntryId,
              note: 'private note must not leak through Project Docs',
              paperAssetId: imported.asset.id,
              quote: 'private annotation quote',
              selectorJson: JSON.stringify({ exact: 'private annotation quote', type: 'textQuote' }),
              sourceContextId: personalLibraryEntryId,
              sourceContextType: 'libraryEntry',
              visibility: 'private',
            },
          });
          await prisma.readerAnnotation.createMany({
            data: [
              {
                createdByUserId: 'user-alice',
                id: projectAnnotationId,
                libraryEntryId: imported.entry.id,
                paperAssetId: imported.asset.id,
                projectId: project.project.id,
                quote: 'project annotation quote',
                selectorJson: JSON.stringify({ exact: 'project annotation quote', type: 'textQuote' }),
                sourceContextId: imported.entry.id,
                sourceContextType: 'libraryEntry',
                visibility: 'project',
              },
              {
                createdByUserId: 'user-alice',
                id: mismatchedProjectAnnotationId,
                libraryEntryId: imported.entry.id,
                paperAssetId: imported.asset.id,
                projectId: project.project.id,
                quote: 'mismatched project annotation quote',
                selectorJson: JSON.stringify({ exact: 'mismatched project annotation quote', type: 'textQuote' }),
                sourceContextId: imported.entry.id,
                sourceContextType: 'libraryEntry',
                visibility: 'project',
              },
            ],
          });
        } finally {
          await prisma.$disconnect().catch(() => undefined);
        }

        const privateLocatorSourceResponse = await fetch(
          `${server.url}/api/project-docs/${projectDoc.id}/versions`,
          {
            body: JSON.stringify({
              citations: [
                {
                  evidenceSpan: 'private annotation must be rejected',
                  locatorSource: {
                    id: privateAnnotationId,
                    type: 'project_visible_reader_annotation',
                  },
                  occurrence: { key: 'private-annotation-occurrence' },
                  paperAssetId: imported.asset.id,
                  target: {
                    libraryEntryId: imported.entry.id,
                    paperAssetId: imported.asset.id,
                  },
                },
              ],
              content: 'Project Doc private annotation rejection.',
            }),
            headers: withSessionCookie(aliceCookie, {
              'Content-Type': 'application/json',
            }),
            method: 'POST',
          },
        );
        const privateLocatorSourcePayload = await privateLocatorSourceResponse.json() as { error: string };
        const mismatchedLocatorSourceResponse = await fetch(
          `${server.url}/api/project-docs/${projectDoc.id}/versions`,
          {
            body: JSON.stringify({
              citations: [
                {
                  evidenceSpan: 'mismatched annotation must be rejected',
                  locatorSource: {
                    id: mismatchedProjectAnnotationId,
                    type: 'project_visible_reader_annotation',
                  },
                  occurrence: { key: 'mismatched-annotation-occurrence' },
                  paperAssetId: imported.asset.id,
                  readerAnnotationId: projectAnnotationId,
                  target: {
                    libraryEntryId: imported.entry.id,
                    paperAssetId: imported.asset.id,
                  },
                },
              ],
              content: 'Project Doc mismatched annotation rejection.',
            }),
            headers: withSessionCookie(aliceCookie, {
              'Content-Type': 'application/json',
            }),
            method: 'POST',
          },
        );
        const mismatchedLocatorSourcePayload = await mismatchedLocatorSourceResponse.json() as { error: string };

        expect(privateLocatorSourceResponse.status).toBe(400);
        expect(privateLocatorSourcePayload.error).toContain(
          'Project Doc citations require project-visible ReaderAnnotation evidence from the same project.',
        );
        expect(mismatchedLocatorSourceResponse.status).toBe(400);
        expect(mismatchedLocatorSourcePayload.error).toContain(
          'Project Doc citation locator source reader annotation does not match the citation reader annotation.',
        );
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

  it('adopts private notebooks into project docs over HTTP with server provenance', async () => {
    const storageRoot = mkdtempSync(join(tmpdir(), 'jixia-http-notebook-project-adoption-'));

    try {
      const server = await startTestServer(
        {
          JIXIA_DATABASE_URL: `file:${join(storageRoot, 'jixia-http-notebook-project-adoption.db')}`,
          JIXIA_STORAGE_ROOT: storageRoot,
        },
        { connectors: { pubmed: createHttpTestPubmedConnector() } },
      );

      try {
        const aliceCookie = await loginAs(server.url, 'user-alice');
        const bobCookie = await loginAs(server.url, 'user-bob');
        const charlieCookie = await loginAs(server.url, 'user-charlie');
        const sharedSpace = await createSpace(server.url, aliceCookie, 'user-alice');
        const project = await fetch(`${server.url}/api/projects`, {
          body: JSON.stringify({ name: 'HTTP Notebook Adoption Project', spaceId: sharedSpace.id }),
          headers: withSessionCookie(aliceCookie, {
            'Content-Type': 'application/json',
          }),
          method: 'POST',
        }).then(
          (response) => response.json() as Promise<{ project: { id: string } }>,
        );
        await fetch(`${server.url}/api/projects/${project.project.id}/members`, {
          body: JSON.stringify({ role: 'editor', userId: 'user-bob' }),
          headers: withSessionCookie(aliceCookie, {
            'Content-Type': 'application/json',
          }),
          method: 'POST',
        });

        const personalSource = await fetch(`${server.url}/api/import/paper`, {
          body: JSON.stringify({
            scope: { id: 'user-alice', type: 'user' },
            sourceLocator: '10.1000/http-notebook-project-adoption',
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
            asset: { id: string; title: string };
            entry: { id: string };
          }>,
        );
        const readerExcerpt = await fetch(
          `${server.url}/api/reading/${personalSource.entry.id}/excerpts`,
          {
            body: JSON.stringify({
              endOffset: 40,
              locator: 'p. 10',
              note: 'HTTP private reader note must not leak.',
              quote: 'HTTP private notebook adoption quote',
              startOffset: 2,
            }),
            headers: withSessionCookie(aliceCookie, {
              'Content-Type': 'application/json',
            }),
            method: 'POST',
          },
        ).then(
          (response) => response.json() as Promise<{
            excerpt: { id: string; paperAssetId: string; quote: string };
          }>,
        );
        const notebook = await fetch(`${server.url}/api/notebooks`, {
          body: JSON.stringify({ title: 'HTTP adoption source notebook' }),
          headers: withSessionCookie(aliceCookie, {
            'Content-Type': 'application/json',
          }),
          method: 'POST',
        }).then((response) => response.json() as Promise<{ id: string }>);
        const notebookSave = await fetch(
          `${server.url}/api/notebooks/${notebook.id}/versions`,
          {
            body: JSON.stringify({
              citations: [],
              documentContent: {
                blocks: [
                  {
                    level: 1,
                    text: 'HTTP private notebook synthesis',
                    type: 'heading',
                  },
                  {
                    text: 'HTTP private interpretation intentionally adopted by server action.',
                    type: 'paragraph',
                  },
                  {
                    capturedAt: '2026-05-23T00:00:00.000Z',
                    evidenceSpan: 'HTTP private notebook adoption quote',
                    libraryEntryId: personalSource.entry.id,
                    locator: 'p. 10',
                    note: 'HTTP private capture note must not leak.',
                    paperAssetId: personalSource.asset.id,
                    quote: 'HTTP private notebook adoption quote',
                    readerExcerptId: readerExcerpt.excerpt.id,
                    title: personalSource.asset.title,
                    type: 'sourceExcerpt',
                  },
                ],
                schemaVersion: 1,
              },
            }),
            headers: withSessionCookie(aliceCookie, {
              'Content-Type': 'application/json',
            }),
            method: 'POST',
          },
        );
        const notebookPayload = await notebookSave.json() as {
          versionId: string;
          versionNumber: number;
        };
        const projectDoc = await fetch(`${server.url}/api/project-docs`, {
          body: JSON.stringify({
            projectId: project.project.id,
            title: 'HTTP adopted Project Doc',
          }),
          headers: withSessionCookie(aliceCookie, {
            'Content-Type': 'application/json',
          }),
          method: 'POST',
        }).then((response) => response.json() as Promise<{ id: string }>);
        await fetch(`${server.url}/api/project-docs/${projectDoc.id}/versions`, {
          body: JSON.stringify({ citations: [], content: 'HTTP existing project context.' }),
          headers: withSessionCookie(aliceCookie, {
            'Content-Type': 'application/json',
          }),
          method: 'POST',
        });

        const bobAdoptionAttempt = await fetch(
          `${server.url}/api/project-docs/${projectDoc.id}/notebook-adoptions`,
          {
            body: JSON.stringify({ notebookDocumentId: notebook.id }),
            headers: withSessionCookie(bobCookie, {
              'Content-Type': 'application/json',
            }),
            method: 'POST',
          },
        );
        const nonMemberAdoptionAttempt = await fetch(
          `${server.url}/api/project-docs/${projectDoc.id}/notebook-adoptions`,
          {
            body: JSON.stringify({ notebookDocumentId: notebook.id }),
            headers: withSessionCookie(charlieCookie, {
              'Content-Type': 'application/json',
            }),
            method: 'POST',
          },
        );
        const spoofedAdoption = await fetch(
          `${server.url}/api/project-docs/${projectDoc.id}/notebook-adoptions`,
          {
            body: JSON.stringify({
              notebookDocumentId: notebook.id,
              ownerId: 'user-alice',
            }),
            headers: withSessionCookie(aliceCookie, {
              'Content-Type': 'application/json',
            }),
            method: 'POST',
          },
        );
        const projectQueryAdoption = await fetch(
          `${server.url}/api/project-docs/${projectDoc.id}/notebook-adoptions?projectId=${project.project.id}`,
          {
            body: JSON.stringify({ notebookDocumentId: notebook.id }),
            headers: withSessionCookie(aliceCookie, {
              'Content-Type': 'application/json',
            }),
            method: 'POST',
          },
        );
        const extraFieldAdoption = await fetch(
          `${server.url}/api/project-docs/${projectDoc.id}/notebook-adoptions`,
          {
            body: JSON.stringify({
              metadata: { source: 'browser-local' },
              notebookDocumentId: notebook.id,
            }),
            headers: withSessionCookie(aliceCookie, {
              'Content-Type': 'application/json',
            }),
            method: 'POST',
          },
        );
        const adoptionResponse = await fetch(
          `${server.url}/api/project-docs/${projectDoc.id}/notebook-adoptions`,
          {
            body: JSON.stringify({ notebookDocumentId: notebook.id }),
            headers: withSessionCookie(aliceCookie, {
              'Content-Type': 'application/json',
            }),
            method: 'POST',
          },
        );
        const adoptionPayload = await adoptionResponse.json() as {
          citationTrace: {
            citations: Array<{
              paperAssetId: string;
              projectLibraryEntry?: { libraryEntryId: string; projectId: string };
              readerExcerpt?: { quote?: string; source: string; sourceLibraryEntryId?: string };
              source: { state: string };
            }>;
            versionNumber: number;
          };
          provenance: {
            paperAssetIds: string[];
            projectDocId: string;
            projectDocVersionId: string;
            projectDocVersionNumber: number;
            projectId: string;
            projectLibraryEntryIds: string[];
            readerExcerptIds: string[];
            sourceNotebookDocumentId: string;
            sourceNotebookVersionId: string;
            sourceNotebookVersionNumber: number;
          };
          snapshot: {
            citations: Array<{ evidenceSpan?: string; paperAssetId: string; readerExcerptId?: string }>;
            content: string;
            documentContent?: { blocks?: Array<Record<string, unknown>>; schemaVersion?: number };
            versionId: string;
            versionNumber: number;
          };
        };
        const bobTrace = await fetch(
          `${server.url}/api/project-docs/${projectDoc.id}/citation-trace`,
          { headers: withSessionCookie(bobCookie) },
        );
        const bobTracePayload = await bobTrace.json() as {
          citations: Array<{
            paperAssetId: string;
            projectLibraryEntry?: { libraryEntryId: string; projectId: string };
            readerExcerpt?: { quote?: string; source: string; sourceLibraryEntryId?: string };
            source: { state: string };
          }>;
          versionNumber: number;
        };
        const serializedAdoption = JSON.stringify(adoptionPayload);
        const serializedBobTrace = JSON.stringify(bobTracePayload);

        expect(notebookSave.status).toBe(200);
        expect(bobAdoptionAttempt.status).toBe(403);
        expect(nonMemberAdoptionAttempt.status).toBe(403);
        expect(spoofedAdoption.status).toBe(400);
        expect(projectQueryAdoption.status).toBe(400);
        expect(extraFieldAdoption.status).toBe(400);
        expect(adoptionResponse.status).toBe(200);
        expect(adoptionPayload.snapshot.versionNumber).toBe(2);
        expect(adoptionPayload.snapshot.content).toContain('HTTP existing project context.');
        expect(adoptionPayload.snapshot.content).toContain('Adopted notebook: HTTP adoption source notebook');
        expect(adoptionPayload.snapshot.content).toContain(`Source Notebook: ${notebook.id}`);
        expect(adoptionPayload.snapshot.content).toContain('HTTP private notebook adoption quote');
        expect(adoptionPayload.snapshot.content).toContain(
          `Project library entry: ${adoptionPayload.provenance.projectLibraryEntryIds[0]}`,
        );
        expect(adoptionPayload.snapshot.citations).toEqual([
          expect.objectContaining({
            evidenceSpan: 'HTTP private notebook adoption quote',
            paperAssetId: personalSource.asset.id,
            readerExcerptId: readerExcerpt.excerpt.id,
          }),
        ]);
        expect(adoptionPayload.provenance).toMatchObject({
          paperAssetIds: [personalSource.asset.id],
          projectDocId: projectDoc.id,
          projectDocVersionId: adoptionPayload.snapshot.versionId,
          projectDocVersionNumber: 2,
          projectId: project.project.id,
          readerExcerptIds: [readerExcerpt.excerpt.id],
          sourceNotebookDocumentId: notebook.id,
          sourceNotebookVersionId: notebookPayload.versionId,
          sourceNotebookVersionNumber: notebookPayload.versionNumber,
        });
        expect(adoptionPayload.provenance.projectLibraryEntryIds[0]).toBeDefined();
        expect(adoptionPayload.provenance.projectLibraryEntryIds[0]).not.toBe(
          personalSource.entry.id,
        );
        expect(adoptionPayload.citationTrace).toMatchObject({
          citations: [
            {
              paperAssetId: personalSource.asset.id,
              projectLibraryEntry: {
                libraryEntryId: adoptionPayload.provenance.projectLibraryEntryIds[0],
                projectId: project.project.id,
              },
              readerExcerpt: {
                quote: 'HTTP private notebook adoption quote',
                source: 'reader_source',
              },
              source: { state: 'available' },
            },
          ],
          versionNumber: 2,
        });
        expect(adoptionPayload.citationTrace.citations[0]?.readerExcerpt).not.toHaveProperty(
          'sourceLibraryEntryId',
        );
        expect(serializedAdoption).not.toContain(`Library entry: ${personalSource.entry.id}`);
        expect(serializedAdoption).not.toContain(personalSource.entry.id);
        expect(bobTrace.status).toBe(200);
        expect(bobTracePayload).toMatchObject({
          citations: [
            {
              paperAssetId: personalSource.asset.id,
              projectLibraryEntry: {
                libraryEntryId: adoptionPayload.provenance.projectLibraryEntryIds[0],
                projectId: project.project.id,
              },
              readerExcerpt: {
                quote: 'HTTP private notebook adoption quote',
                source: 'project_doc_snapshot',
              },
              source: { state: 'available' },
            },
          ],
          versionNumber: 2,
        });
        expect(serializedAdoption).not.toContain('HTTP private capture note must not leak');
        expect(serializedAdoption).not.toContain('HTTP private reader note must not leak');
        expect(serializedAdoption).not.toContain('storageKey');
        expect(serializedAdoption).not.toContain('checksum');
        expect(serializedAdoption).not.toContain(storageRoot);
        expect(serializedBobTrace).not.toContain(personalSource.entry.id);
        expect(serializedBobTrace).not.toContain('HTTP private capture note must not leak');
        expect(serializedBobTrace).not.toContain('HTTP private reader note must not leak');
        expect(serializedBobTrace).not.toContain('storageKey');
        expect(serializedBobTrace).not.toContain('checksum');
        expect(serializedBobTrace).not.toContain(storageRoot);
      } finally {
        await server.close();
      }
    } finally {
      rmSync(storageRoot, { force: true, recursive: true });
    }
  });
});
