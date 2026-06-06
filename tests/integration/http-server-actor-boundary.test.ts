import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, rmSync, unlinkSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { describe, expect, it } from 'vitest';

import { createJixiaApp } from '../../src/server/app';
import type { PubmedConnector } from '../../src/server/connectors/pubmed.connector';
import {
  loginAs,
  startTestServer,
  withSessionCookie,
} from './http-session-test-helpers';

async function createSharedSpace(serverUrl: string, cookie: string, actorUserId: string) {
  const response = await fetch(`${serverUrl}/api/spaces`, {
    body: JSON.stringify({ kind: 'shared', name: `${actorUserId} shared` }),
    headers: withSessionCookie(cookie, {
      'Content-Type': 'application/json',
    }),
    method: 'POST',
  });

  return (await response.json()) as { id: string };
}

async function createCredential(serverUrl: string, cookie: string, actorUserId: string) {
  const response = await fetch(`${serverUrl}/api/credentials`, {
    body: JSON.stringify({
      provider: 'openai',
      rawSecret: `${actorUserId}-credential-placeholder`,
    }),
    headers: withSessionCookie(cookie, {
      'Content-Type': 'application/json',
    }),
    method: 'POST',
  });

  return (await response.json()) as { credentialRef: string };
}

async function createProject(serverUrl: string, cookie: string, actorUserId: string, spaceId: string) {
  return fetch(`${serverUrl}/api/projects`, {
    body: JSON.stringify({
      name: `${actorUserId} actor-boundary project`,
      spaceId,
    }),
    headers: withSessionCookie(cookie, {
      'Content-Type': 'application/json',
    }),
    method: 'POST',
  }).then(
    (response) => response.json() as Promise<{ project: { id: string } }>,
  );
}

async function importPaper(
  serverUrl: string,
  cookie: string,
  actorUserId: string,
  spaceId: string,
) {
  const project = await createProject(serverUrl, cookie, actorUserId, spaceId);

  const response = await fetch(`${serverUrl}/api/import/paper`, {
    body: JSON.stringify({
      scope: { id: project.project.id, type: 'project' },
      sourceLocator: `10.1000/${actorUserId}-actor-boundary`,
      sourceType: 'doi',
      spaceId,
      visibility: 'space_shared',
    }),
    headers: withSessionCookie(cookie, {
      'Content-Type': 'application/json',
    }),
    method: 'POST',
  });

  const imported = (await response.json()) as { entry: { id: string } };

  return { ...imported, projectId: project.project.id };
}

async function importPersonalPaper(serverUrl: string, cookie: string) {
  const response = await fetch(`${serverUrl}/api/library/personal/import`, {
    body: JSON.stringify({
      sourceLocator: '10.1000/personal-actor-boundary',
      sourceType: 'doi',
    }),
    headers: withSessionCookie(cookie, {
      'Content-Type': 'application/json',
    }),
    method: 'POST',
  });

  return (await response.json()) as { entry: { id: string } };
}

async function createNotebook(serverUrl: string, cookie: string, actorUserId: string) {
  const response = await fetch(`${serverUrl}/api/notebooks`, {
    body: JSON.stringify({ title: `${actorUserId} notebook` }),
    headers: withSessionCookie(cookie, {
      'Content-Type': 'application/json',
    }),
    method: 'POST',
  });

  return (await response.json()) as { id: string };
}

async function createProjectDoc(
  serverUrl: string,
  cookie: string,
  actorUserId: string,
  projectId: string,
) {
  const response = await fetch(`${serverUrl}/api/project-docs`, {
    body: JSON.stringify({ projectId, title: `${actorUserId} project doc` }),
    headers: withSessionCookie(cookie, {
      'Content-Type': 'application/json',
    }),
    method: 'POST',
  });

  return (await response.json()) as { id: string };
}

async function createJob(
  serverUrl: string,
  cookie: string,
  actorUserId: string,
  credentialRef: string,
  spaceId: string,
) {
  const response = await fetch(`${serverUrl}/api/jobs`, {
    body: JSON.stringify({
      credentialRef,
      kind: 'ai.summary',
      payload: { prompt: `Summarize for ${actorUserId}.` },
      spaceId,
    }),
    headers: withSessionCookie(cookie, {
      'Content-Type': 'application/json',
    }),
    method: 'POST',
  });

  return (await response.json()) as { id: string };
}

function sha256(contents: string): string {
  return createHash('sha256').update(Buffer.from(contents, 'utf8')).digest('hex');
}

function createActorBoundaryPubmedConnector(): PubmedConnector {
  return {
    async lookup(locator, sourceType) {
      return {
        abstractText: `Actor-boundary fixture abstract for ${locator}.`,
        canonicalId: `${sourceType}:${locator}`,
        title: `Actor-boundary fixture ${locator}`,
      };
    },
    async search() {
      return [];
    },
  };
}

describe('http server actor boundary cleanup', () => {
  it('allows supported login selectors and rejects legacy login identity fields', async () => {
    const storageRoot = mkdtempSync(join(tmpdir(), 'jixia-http-login-authority-'));

    try {
      const server = await startTestServer({ JIXIA_STORAGE_ROOT: storageRoot });

      try {
        const loginResponse = await fetch(`${server.url}/api/session/login`, {
          body: JSON.stringify({ loginProfileKey: 'alice' }),
          headers: { 'Content-Type': 'application/json' },
          method: 'POST',
        });

        expect(loginResponse.status).toBe(200);
        await expect(loginResponse.json()).resolves.toMatchObject({
          user: {
            displayName: 'Alice',
            email: 'alice@example.test',
            id: 'user-alice',
          },
        });

        const sessionCookie = loginResponse.headers.get('set-cookie');
        expect(sessionCookie).toContain('jixia_session=');

        const currentUserResponse = await fetch(`${server.url}/api/session/me`, {
          headers: { Cookie: sessionCookie?.split(';')[0] ?? '' },
        });
        expect(currentUserResponse.status).toBe(200);
        await expect(currentUserResponse.json()).resolves.toMatchObject({
          user: {
            displayName: 'Alice',
            email: 'alice@example.test',
            id: 'user-alice',
          },
        });

        const rejectedRequests = await Promise.all([
          fetch(`${server.url}/api/session/login`, {
            body: JSON.stringify({ userId: 'user-alice' }),
            headers: { 'Content-Type': 'application/json' },
            method: 'POST',
          }),
          fetch(`${server.url}/api/session/login`, {
            body: JSON.stringify({ email: 'alice@example.test' }),
            headers: { 'Content-Type': 'application/json' },
            method: 'POST',
          }),
          fetch(`${server.url}/api/session/login`, {
            body: JSON.stringify({ actorUserId: 'user-alice', loginProfileKey: 'alice' }),
            headers: { 'Content-Type': 'application/json' },
            method: 'POST',
          }),
          fetch(`${server.url}/api/session/login`, {
            body: JSON.stringify({ actorId: 'user-alice', loginProfileKey: 'alice' }),
            headers: { 'Content-Type': 'application/json' },
            method: 'POST',
          }),
          fetch(`${server.url}/api/session/login`, {
            body: JSON.stringify({ user: 'user-alice', loginProfileKey: 'alice' }),
            headers: { 'Content-Type': 'application/json' },
            method: 'POST',
          }),
          fetch(`${server.url}/api/session/login`, {
            body: JSON.stringify({ actor: 'user-alice', loginProfileKey: 'alice' }),
            headers: { 'Content-Type': 'application/json' },
            method: 'POST',
          }),
          fetch(`${server.url}/api/session/login?userId=user-alice`, {
            body: JSON.stringify({ loginProfileKey: 'alice' }),
            headers: { 'Content-Type': 'application/json' },
            method: 'POST',
          }),
          fetch(`${server.url}/api/session/login`, {
            body: JSON.stringify({ loginProfileKey: 'unknown' }),
            headers: { 'Content-Type': 'application/json' },
            method: 'POST',
          }),
        ]);

        for (const response of rejectedRequests) {
          expect(response.status).toBe(400);
          expect(response.headers.get('set-cookie')).toBeNull();
        }

        await expect(rejectedRequests[0]?.json()).resolves.toMatchObject({
          error: expect.stringMatching(/userId is not accepted for session login/i),
        });
        await expect(rejectedRequests[1]?.json()).resolves.toMatchObject({
          error: expect.stringMatching(/email is not accepted for session login/i),
        });
        await expect(rejectedRequests[2]?.json()).resolves.toMatchObject({
          error: expect.stringMatching(/actorUserId is not accepted for session login/i),
        });
        await expect(rejectedRequests[3]?.json()).resolves.toMatchObject({
          error: expect.stringMatching(/actorId is not accepted for session login/i),
        });
        await expect(rejectedRequests[4]?.json()).resolves.toMatchObject({
          error: expect.stringMatching(/user is not accepted for session login/i),
        });
        await expect(rejectedRequests[5]?.json()).resolves.toMatchObject({
          error: expect.stringMatching(/actor is not accepted for session login/i),
        });
        await expect(rejectedRequests[6]?.json()).resolves.toMatchObject({
          error: expect.stringMatching(/userId is not accepted for session login/i),
        });
        await expect(rejectedRequests[7]?.json()).resolves.toMatchObject({
          error: expect.stringMatching(/supported login profile|requested login profile/i),
        });
      } finally {
        await server.close();
      }
    } finally {
      rmSync(storageRoot, { force: true, recursive: true });
    }
  });

  it('returns 401 when protected routes have no server-derived actor', async () => {
    const storageRoot = mkdtempSync(join(tmpdir(), 'jixia-http-actor-401-'));

    try {
      const server = await startTestServer({ JIXIA_STORAGE_ROOT: storageRoot });

      try {
        const responses = await Promise.all([
          fetch(`${server.url}/api/spaces`),
          fetch(`${server.url}/api/credentials`),
          fetch(`${server.url}/api/settings/me`),
          fetch(`${server.url}/api/library/personal`),
          fetch(`${server.url}/api/library/entry-1/file`),
          fetch(`${server.url}/api/import/pdf`, {
            body: JSON.stringify({
              pdfContents: '%PDF-1.4 unauthenticated upload',
              spaceId: 'space-1',
              visibility: 'private',
            }),
            headers: { 'Content-Type': 'application/json' },
            method: 'POST',
          }),
          fetch(`${server.url}/api/projects/project-1/library/adoptions`, {
            body: JSON.stringify({ sourceLibraryEntryId: 'entry-1' }),
            headers: { 'Content-Type': 'application/json' },
            method: 'POST',
          }),
          fetch(`${server.url}/api/projects`),
          fetch(`${server.url}/api/notebooks/notebook-1`),
          fetch(`${server.url}/api/project-docs/project-doc-1`),
          fetch(`${server.url}/api/project-docs/project-doc-1/citation-trace`),
          fetch(`${server.url}/api/project-docs/project-doc-1/notebook-adoptions`, {
            body: JSON.stringify({ notebookDocumentId: 'notebook-1' }),
            headers: { 'Content-Type': 'application/json' },
            method: 'POST',
          }),
          fetch(`${server.url}/api/reading/entry-1`),
          fetch(`${server.url}/api/reading/project-comments`, {
            body: JSON.stringify({ body: 'Unauthenticated project comment', libraryEntryId: 'entry-1' }),
            headers: { 'Content-Type': 'application/json' },
            method: 'POST',
          }),
          fetch(`${server.url}/api/reading/entry-1/excerpts`),
          fetch(`${server.url}/api/reading/entry-1/excerpts`, {
            body: JSON.stringify({
              endOffset: 12,
              quote: 'Unauthenticated reader excerpt',
              startOffset: 0,
            }),
            headers: { 'Content-Type': 'application/json' },
            method: 'POST',
          }),
          fetch(`${server.url}/api/jobs`),
          fetch(`${server.url}/api/jobs/job-1/cancel`, { method: 'POST' }),
          fetch(`${server.url}/api/jobs/job-1/stream`),
          fetch(`${server.url}/api/ai-results`),
          fetch(`${server.url}/api/ai-results/result-1`),
          fetch(`${server.url}/api/ai-results/result-1/apply/notebook`, {
            body: JSON.stringify({ notebookDocumentId: 'notebook-1' }),
            headers: { 'Content-Type': 'application/json' },
            method: 'POST',
          }),
          fetch(`${server.url}/api/ai-results/result-1/apply/project-doc`, {
            body: JSON.stringify({ projectDocId: 'project-doc-1' }),
            headers: { 'Content-Type': 'application/json' },
            method: 'POST',
          }),
        ]);

        for (const response of responses) {
          expect(response.status).toBe(401);
        }
      } finally {
        await server.close();
      }
    } finally {
      rmSync(storageRoot, { force: true, recursive: true });
    }
  });

  it('serves paper files only through authorized library entry access and never by raw storage key', async () => {
    const storageRoot = mkdtempSync(join(tmpdir(), 'jixia-http-paper-file-'));
    const env = {
      JIXIA_DATABASE_URL: `file:${join(storageRoot, 'jixia-paper-file.db')}`,
      JIXIA_STORAGE_ROOT: storageRoot,
    };

    const personalPdf = '%PDF-1.4 personal authorized file';
    const projectPdf = '%PDF-1.4 project authorized file';

    try {
      const app = createJixiaApp({ env });
      let personalUpload: Awaited<ReturnType<typeof app.imports.uploadPdf>>;
      let projectUpload: Awaited<ReturnType<typeof app.imports.uploadPdf>>;

      try {
        const sharedSpace = await app.spaces.createSpace(
          { kind: 'shared', name: 'Paper file shared space' },
          'user-alice',
        );
        const project = await app.projects.createProject(
          { name: 'Paper file project', spaceId: sharedSpace.id },
          'user-alice',
        );
        await app.projects.addProjectMember(
          project.project.id,
          { role: 'viewer', userId: 'user-bob' },
          'user-alice',
        );

        personalUpload = await app.imports.uploadPdf(
          {
            pdfContents: personalPdf,
            requestedByUserId: 'user-alice',
            scope: { id: 'user-alice', type: 'user' },
            spaceId: sharedSpace.id,
            visibility: 'private',
          },
          'user-alice',
        );
        projectUpload = await app.imports.uploadPdf(
          {
            pdfContents: projectPdf,
            requestedByUserId: 'user-alice',
            scope: { id: project.project.id, type: 'project' },
            spaceId: sharedSpace.id,
            visibility: 'published_to_project',
          },
          'user-alice',
        );

        expect(personalUpload.asset).not.toHaveProperty('storageKey');
        expect(personalUpload.asset.hasFile).toBe(true);
        expect(projectUpload.asset).not.toHaveProperty('storageKey');
        expect(projectUpload.asset.hasFile).toBe(true);
      } finally {
        await app.close();
      }

      const server = await startTestServer(env);

      try {
        const aliceCookie = await loginAs(server.url, 'user-alice');
        const bobCookie = await loginAs(server.url, 'user-bob');
        const charlieCookie = await loginAs(server.url, 'user-charlie');

        const personalFileResponse = await fetch(
          `${server.url}/api/library/${personalUpload.entry.id}/file`,
          { headers: withSessionCookie(aliceCookie) },
        );
        expect(personalFileResponse.status).toBe(200);
        expect(personalFileResponse.headers.get('content-type')).toBe('application/pdf');
        expect(personalFileResponse.headers.get('content-length')).toBe(
          String(Buffer.byteLength(personalPdf)),
        );
        expect(personalFileResponse.headers.get('content-disposition')).toMatch(
          /^attachment; filename=".+"$/,
        );
        expect(
          Buffer.from(await personalFileResponse.arrayBuffer()).equals(
            Buffer.from(personalPdf, 'utf8'),
          ),
        ).toBe(true);

        const personalHeadResponse = await fetch(
          `${server.url}/api/library/${personalUpload.entry.id}/file`,
          { headers: withSessionCookie(aliceCookie), method: 'HEAD' },
        );
        expect(personalHeadResponse.status).toBe(200);
        expect(personalHeadResponse.headers.get('content-type')).toBe('application/pdf');
        expect(personalHeadResponse.headers.get('content-length')).toBe(
          String(Buffer.byteLength(personalPdf)),
        );
        expect(await personalHeadResponse.text()).toBe('');

        const personalFileDenied = await fetch(
          `${server.url}/api/library/${personalUpload.entry.id}/file`,
          { headers: withSessionCookie(bobCookie) },
        );
        expect(personalFileDenied.status).toBe(403);

        const personalHeadDenied = await fetch(
          `${server.url}/api/library/${personalUpload.entry.id}/file`,
          { headers: withSessionCookie(bobCookie), method: 'HEAD' },
        );
        expect(personalHeadDenied.status).toBe(403);

        const projectFileResponse = await fetch(
          `${server.url}/api/library/${projectUpload.entry.id}/file`,
          { headers: withSessionCookie(bobCookie) },
        );
        expect(projectFileResponse.status).toBe(200);
        expect(projectFileResponse.headers.get('content-type')).toBe('application/pdf');
        expect(projectFileResponse.headers.get('content-length')).toBe(
          String(Buffer.byteLength(projectPdf)),
        );
        expect(
          Buffer.from(await projectFileResponse.arrayBuffer()).equals(
            Buffer.from(projectPdf, 'utf8'),
          ),
        ).toBe(true);

        const projectFileDenied = await fetch(
          `${server.url}/api/library/${projectUpload.entry.id}/file`,
          { headers: withSessionCookie(charlieCookie) },
        );
        expect(projectFileDenied.status).toBe(403);

        const matchingActorQueryResponse = await fetch(
          `${server.url}/api/library/${personalUpload.entry.id}/file?actorUserId=user-alice`,
          { headers: withSessionCookie(aliceCookie) },
        );
        expect(matchingActorQueryResponse.status).toBe(400);

        const rawPathAttempt = await fetch(
          `${server.url}/api/library/${encodeURIComponent(`papers/${personalUpload.asset.id}/paper.pdf`)}/file`,
          { headers: withSessionCookie(aliceCookie) },
        );
        const rawPathAttemptBody = await rawPathAttempt.json() as { error: string };
        expect(rawPathAttempt.status).toBe(400);
        expect(rawPathAttemptBody.error).toMatch(/does not exist/i);
        expect(rawPathAttemptBody.error).not.toContain('papers/');
        expect(rawPathAttemptBody.error).not.toContain(storageRoot);

        const personalFilePath = join(
          storageRoot,
          'papers',
          personalUpload.asset.id,
          'paper.pdf',
        );
        unlinkSync(personalFilePath);

        const missingFileResponse = await fetch(
          `${server.url}/api/library/${personalUpload.entry.id}/file`,
          { headers: withSessionCookie(aliceCookie) },
        );
        expect(missingFileResponse.status).toBe(404);
        const missingFileBody = await missingFileResponse.json() as { error: string };
        expect(missingFileBody.error).toMatch(/file is not available/i);
        expect(missingFileBody.error).not.toContain('papers/');
        expect(missingFileBody.error).not.toContain(storageRoot);
      } finally {
        await server.close();
      }
    } finally {
      rmSync(storageRoot, { force: true, recursive: true });
    }
  }, 30_000);

  it('uploads paper files through the protected HTTP route without leaking storage internals', async () => {
    const storageRoot = mkdtempSync(join(tmpdir(), 'jixia-http-paper-upload-'));
    const env = {
      JIXIA_DATABASE_URL: `file:${join(storageRoot, 'jixia-paper-upload.db')}`,
      JIXIA_STORAGE_ROOT: storageRoot,
    };
    const pdfContents = '%PDF-1.4 protected http upload';
    const pdfChecksum = sha256(pdfContents);

    try {
      const server = await startTestServer(env);

      try {
        const aliceCookie = await loginAs(server.url, 'user-alice');
        const sharedSpace = await createSharedSpace(server.url, aliceCookie, 'user-alice');
        const uploadResponse = await fetch(`${server.url}/api/import/pdf`, {
          body: JSON.stringify({
            pdfContents,
            scope: { id: 'user-alice', type: 'user' },
            spaceId: sharedSpace.id,
            visibility: 'private',
          }),
          headers: withSessionCookie(aliceCookie, {
            'Content-Type': 'application/json',
          }),
          method: 'POST',
        });
        const uploadBody = await uploadResponse.json() as {
          asset: {
            checksum?: string;
            hasFile?: boolean;
            id: string;
            storageKey?: string;
          };
          entry: { id: string; paperAssetId: string; scope: { id: string; type: string } };
        };

        expect(uploadResponse.status).toBe(200);
        expect(uploadBody.asset.hasFile).toBe(true);
        expect(uploadBody.asset).not.toHaveProperty('storageKey');
        expect(uploadBody.asset).not.toHaveProperty('checksum');
        expect(JSON.stringify(uploadBody)).not.toContain('papers/');
        expect(JSON.stringify(uploadBody)).not.toContain(storageRoot);
        expect(JSON.stringify(uploadBody)).not.toContain(pdfChecksum);
        expect(uploadBody.entry.paperAssetId).toBe(uploadBody.asset.id);
        expect(uploadBody.entry.scope).toEqual({ id: 'user-alice', type: 'user' });

        const storedPdfPath = join(storageRoot, 'papers', uploadBody.asset.id, 'paper.pdf');
        expect(existsSync(storedPdfPath)).toBe(true);
        expect(readFileSync(storedPdfPath, 'utf8')).toBe(pdfContents);

        const fileResponse = await fetch(
          `${server.url}/api/library/${uploadBody.entry.id}/file`,
          { headers: withSessionCookie(aliceCookie) },
        );
        expect(fileResponse.status).toBe(200);
        expect(fileResponse.headers.get('content-type')).toBe('application/pdf');
        expect(fileResponse.headers.get('content-length')).toBe(
          String(Buffer.byteLength(pdfContents)),
        );
        expect(
          Buffer.from(await fileResponse.arrayBuffer()).equals(
            Buffer.from(pdfContents, 'utf8'),
          ),
        ).toBe(true);
      } finally {
        await server.close();
      }
    } finally {
      rmSync(storageRoot, { force: true, recursive: true });
    }
  }, 30_000);

  it('derives protected access from session cookies and rejects spoofed legacy actor fields', async () => {
    const storageRoot = mkdtempSync(join(tmpdir(), 'jixia-http-actor-400-'));

    try {
      const server = await startTestServer(
        { JIXIA_STORAGE_ROOT: storageRoot },
        { connectors: { pubmed: createActorBoundaryPubmedConnector() } },
      );

      try {
        const aliceCookie = await loginAs(server.url, 'user-alice');
        const bobCookie = await loginAs(server.url, 'user-bob');

        const createdSpace = await createSharedSpace(server.url, aliceCookie, 'user-alice');
        const importedRecord = await importPaper(
          server.url,
          aliceCookie,
          'user-alice',
          createdSpace.id,
        );
        const personalImportedRecord = await importPersonalPaper(server.url, aliceCookie);
        const credential = await createCredential(server.url, aliceCookie, 'user-alice');
        const job = await createJob(
          server.url,
          aliceCookie,
          'user-alice',
          credential.credentialRef,
          createdSpace.id,
        );

        const notebook = await createNotebook(server.url, aliceCookie, 'user-alice');
        const projectDoc = await createProjectDoc(
          server.url,
          aliceCookie,
          'user-alice',
          importedRecord.projectId,
        );

        const mismatchResponses = await Promise.all([
          fetch(`${server.url}/api/projects`, {
            body: JSON.stringify({
              actorUserId: 'user-bob',
              name: 'Mismatch',
              spaceId: createdSpace.id,
            }),
            headers: withSessionCookie(aliceCookie, {
              'Content-Type': 'application/json',
            }),
            method: 'POST',
          }),
          fetch(`${server.url}/api/import/paper`, {
            body: JSON.stringify({
              requestedByUserId: 'user-bob',
              sourceLocator: '10.1000/spoof-import',
              sourceType: 'doi',
              spaceId: createdSpace.id,
              visibility: 'space_shared',
            }),
            headers: withSessionCookie(aliceCookie, {
              'Content-Type': 'application/json',
            }),
            method: 'POST',
          }),
          fetch(`${server.url}/api/import/pdf`, {
            body: JSON.stringify({
              pdfContents: '%PDF-1.4 spoofed upload',
              requestedByUserId: 'user-bob',
              spaceId: createdSpace.id,
              visibility: 'private',
            }),
            headers: withSessionCookie(aliceCookie, {
              'Content-Type': 'application/json',
            }),
            method: 'POST',
          }),
          fetch(`${server.url}/api/notebooks`, {
            body: JSON.stringify({ ownerId: 'user-bob', title: 'Spoofed notebook' }),
            headers: withSessionCookie(aliceCookie, {
              'Content-Type': 'application/json',
            }),
            method: 'POST',
          }),
          fetch(`${server.url}/api/notebooks/${notebook.id}/versions`, {
            body: JSON.stringify({ actorUserId: 'user-bob', citations: [], content: 'Spoofed notebook save' }),
            headers: withSessionCookie(aliceCookie, {
              'Content-Type': 'application/json',
            }),
            method: 'POST',
          }),
          fetch(`${server.url}/api/notebooks?ownerId=user-bob`, {
            headers: withSessionCookie(aliceCookie),
          }),
          fetch(`${server.url}/api/notebooks/${notebook.id}/snapshot?spaceId=${createdSpace.id}`, {
            headers: withSessionCookie(aliceCookie),
          }),
          fetch(`${server.url}/api/notebooks/capture`, {
            body: JSON.stringify({
              ownerId: 'user-bob',
              source: {
                generatedInsightId: 'insight-spoofed',
                libraryEntryId: importedRecord.entry.id,
                type: 'generatedInsight',
              },
            }),
            headers: withSessionCookie(aliceCookie, {
              'Content-Type': 'application/json',
            }),
            method: 'POST',
          }),
          fetch(`${server.url}/api/notebooks/capture`, {
            body: JSON.stringify({
              notebookTitle: 'Spoofed reader excerpt notebook',
              source: {
                ownerId: 'user-bob',
                readerExcerptId: 'excerpt-spoofed',
                type: 'readerExcerpt',
              },
            }),
            headers: withSessionCookie(aliceCookie, {
              'Content-Type': 'application/json',
            }),
            method: 'POST',
          }),
          fetch(`${server.url}/api/notebooks/capture`, {
            body: JSON.stringify({
              notebookTitle: 'Spoofed reader excerpt project notebook',
              source: {
                projectId: importedRecord.projectId,
                readerExcerptId: 'excerpt-spoofed',
                type: 'readerExcerpt',
              },
            }),
            headers: withSessionCookie(aliceCookie, {
              'Content-Type': 'application/json',
            }),
            method: 'POST',
          }),
          fetch(`${server.url}/api/project-docs`, {
            body: JSON.stringify({ createdByUserId: 'user-bob', projectId: importedRecord.projectId, title: 'Spoofed project doc' }),
            headers: withSessionCookie(aliceCookie, {
              'Content-Type': 'application/json',
            }),
            method: 'POST',
          }),
          fetch(`${server.url}/api/project-docs?createdByUserId=user-bob`, {
            body: JSON.stringify({ projectId: importedRecord.projectId, title: 'Spoofed query project doc' }),
            headers: withSessionCookie(aliceCookie, {
              'Content-Type': 'application/json',
            }),
            method: 'POST',
          }),
          fetch(`${server.url}/api/project-docs/${projectDoc.id}/versions`, {
            body: JSON.stringify({ actorUserId: 'user-bob', citations: [], content: 'Spoofed project-doc save' }),
            headers: withSessionCookie(aliceCookie, {
              'Content-Type': 'application/json',
            }),
            method: 'POST',
          }),
          fetch(`${server.url}/api/project-docs/${projectDoc.id}/versions`, {
            body: JSON.stringify({ citations: [], content: 'Spoofed project-doc save creator', createdByUserId: 'user-bob' }),
            headers: withSessionCookie(aliceCookie, {
              'Content-Type': 'application/json',
            }),
            method: 'POST',
          }),
          fetch(`${server.url}/api/project-docs/${projectDoc.id}/publish-state`, {
            body: JSON.stringify({ actorUserId: 'user-bob', publishState: 'review' }),
            headers: withSessionCookie(aliceCookie, {
              'Content-Type': 'application/json',
            }),
            method: 'POST',
          }),
          fetch(`${server.url}/api/project-docs/${projectDoc.id}/publish-state?createdByUserId=user-bob`, {
            body: JSON.stringify({ publishState: 'review' }),
            headers: withSessionCookie(aliceCookie, {
              'Content-Type': 'application/json',
            }),
            method: 'POST',
          }),
          fetch(`${server.url}/api/project-docs/${projectDoc.id}/notebook-adoptions`, {
            body: JSON.stringify({ actorUserId: 'user-bob', notebookDocumentId: notebook.id }),
            headers: withSessionCookie(aliceCookie, {
              'Content-Type': 'application/json',
            }),
            method: 'POST',
          }),
          fetch(`${server.url}/api/project-docs/${projectDoc.id}/notebook-adoptions?projectId=${importedRecord.projectId}`, {
            body: JSON.stringify({ notebookDocumentId: notebook.id }),
            headers: withSessionCookie(aliceCookie, {
              'Content-Type': 'application/json',
            }),
            method: 'POST',
          }),
          fetch(`${server.url}/api/project-docs/${projectDoc.id}/citation-trace?actorUserId=user-bob`, {
            headers: withSessionCookie(aliceCookie),
          }),
          fetch(`${server.url}/api/project-docs/${projectDoc.id}/citation-trace?userId=user-bob`, {
            headers: withSessionCookie(aliceCookie),
          }),
          fetch(`${server.url}/api/project-docs/${projectDoc.id}/citation-trace?createdByUserId=user-bob`, {
            headers: withSessionCookie(aliceCookie),
          }),
          fetch(`${server.url}/api/project-docs/${projectDoc.id}/citation-trace?ownerId=user-bob`, {
            headers: withSessionCookie(aliceCookie),
          }),
          fetch(`${server.url}/api/project-docs/${projectDoc.id}/citation-trace?spaceId=${createdSpace.id}`, {
            headers: withSessionCookie(aliceCookie),
          }),
          fetch(`${server.url}/api/project-docs/${projectDoc.id}/citation-trace?scope=${encodeURIComponent(`project:${importedRecord.projectId}`)}`, {
            headers: withSessionCookie(aliceCookie),
          }),
          fetch(`${server.url}/api/project-docs/${projectDoc.id}/citation-trace?scopeId=${importedRecord.projectId}`, {
            headers: withSessionCookie(aliceCookie),
          }),
          fetch(`${server.url}/api/project-docs/${projectDoc.id}/citation-trace?scopeType=project`, {
            headers: withSessionCookie(aliceCookie),
          }),
          fetch(`${server.url}/api/project-docs/${projectDoc.id}/citation-trace?visibility=published_to_project`, {
            headers: withSessionCookie(aliceCookie),
          }),
          fetch(`${server.url}/api/project-docs/${projectDoc.id}/citation-trace?projectId=${importedRecord.projectId}`, {
            headers: withSessionCookie(aliceCookie),
          }),
          fetch(`${server.url}/api/projects/${importedRecord.projectId}/library/adoptions`, {
            body: JSON.stringify({
              actorUserId: 'user-bob',
              sourceLibraryEntryId: importedRecord.entry.id,
            }),
            headers: withSessionCookie(aliceCookie, {
              'Content-Type': 'application/json',
            }),
            method: 'POST',
          }),
          fetch(`${server.url}/api/projects/${importedRecord.projectId}/library/adoptions?projectId=project-override`, {
            body: JSON.stringify({
              sourceLibraryEntryId: importedRecord.entry.id,
            }),
            headers: withSessionCookie(aliceCookie, {
              'Content-Type': 'application/json',
            }),
            method: 'POST',
          }),
          fetch(`${server.url}/api/reading/notes`, {
            body: JSON.stringify({
              authorUserId: 'user-bob',
              body: 'Spoofed note',
              libraryEntryId: importedRecord.entry.id,
            }),
            headers: withSessionCookie(aliceCookie, {
              'Content-Type': 'application/json',
            }),
            method: 'POST',
          }),
          fetch(`${server.url}/api/reading/project-comments`, {
            body: JSON.stringify({
              authorUserId: 'user-bob',
              body: 'Spoofed project comment',
              libraryEntryId: importedRecord.entry.id,
            }),
            headers: withSessionCookie(aliceCookie, {
              'Content-Type': 'application/json',
            }),
            method: 'POST',
          }),
          fetch(`${server.url}/api/reading/insights`, {
            body: JSON.stringify({
              evidenceSpans: [],
              libraryEntryId: importedRecord.entry.id,
              startedByUserId: 'user-bob',
              summary: 'Spoofed insight',
              title: 'Spoofed',
            }),
            headers: withSessionCookie(aliceCookie, {
              'Content-Type': 'application/json',
            }),
            method: 'POST',
          }),
          fetch(`${server.url}/api/reading/${importedRecord.entry.id}/excerpts`, {
            body: JSON.stringify({
              endOffset: 22,
              quote: 'Spoofed excerpt actor should be rejected.',
              requestedByUserId: 'user-bob',
              startOffset: 0,
            }),
            headers: withSessionCookie(aliceCookie, {
              'Content-Type': 'application/json',
            }),
            method: 'POST',
          }),
          fetch(`${server.url}/api/reading/${importedRecord.entry.id}/excerpts`, {
            body: JSON.stringify({
              createdByUserId: 'user-bob',
              endOffset: 23,
              quote: 'Spoofed excerpt creator should be rejected.',
              startOffset: 0,
            }),
            headers: withSessionCookie(aliceCookie, {
              'Content-Type': 'application/json',
            }),
            method: 'POST',
          }),
          fetch(`${server.url}/api/reading/${importedRecord.entry.id}/excerpts`, {
            body: JSON.stringify({
              endOffset: 24,
              projectId: importedRecord.projectId,
              quote: 'Spoofed excerpt scope should be rejected.',
              startOffset: 0,
            }),
            headers: withSessionCookie(aliceCookie, {
              'Content-Type': 'application/json',
            }),
            method: 'POST',
          }),
          fetch(`${server.url}/api/reading/${importedRecord.entry.id}/excerpts?scopeType=project`, {
            headers: withSessionCookie(aliceCookie),
          }),
          fetch(`${server.url}/api/reading/${importedRecord.entry.id}/excerpts?createdByUserId=user-bob`, {
            headers: withSessionCookie(aliceCookie),
          }),
          fetch(`${server.url}/api/credentials?userId=user-bob`, {
            headers: withSessionCookie(aliceCookie),
          }),
          fetch(`${server.url}/api/settings/me?userId=user-bob`, {
            headers: withSessionCookie(aliceCookie),
          }),
          fetch(`${server.url}/api/settings/me`, {
            body: JSON.stringify({
              defaultImportTarget: 'personal-library',
              userId: 'user-bob',
            }),
            headers: withSessionCookie(aliceCookie, {
              'Content-Type': 'application/json',
            }),
            method: 'POST',
          }),
          fetch(`${server.url}/api/jobs`, {
            body: JSON.stringify({
              credentialRef: credential.credentialRef,
              kind: 'ai.summary',
              payload: { prompt: 'Spoofed job' },
              requestedByUserId: 'user-bob',
              spaceId: createdSpace.id,
            }),
            headers: withSessionCookie(aliceCookie, {
              'Content-Type': 'application/json',
            }),
            method: 'POST',
          }),
          fetch(`${server.url}/api/jobs/${job.id}/run`, {
            body: JSON.stringify({ actorUserId: 'user-bob' }),
            headers: withSessionCookie(aliceCookie, {
              'Content-Type': 'application/json',
            }),
            method: 'POST',
          }),
          fetch(`${server.url}/api/jobs/${job.id}/cancel`, {
            body: JSON.stringify({ actorUserId: 'user-bob' }),
            headers: withSessionCookie(aliceCookie, {
              'Content-Type': 'application/json',
            }),
            method: 'POST',
          }),
        ]);

        for (const response of mismatchResponses) {
          expect(response.status).toBe(400);
        }

        const invalidProjectCommentResponses = await Promise.all([
          fetch(`${server.url}/api/reading/notes`, {
            body: JSON.stringify({
              body: 'Visibility must not create a project comment.',
              libraryEntryId: importedRecord.entry.id,
              visibility: 'space_shared',
            }),
            headers: withSessionCookie(aliceCookie, {
              'Content-Type': 'application/json',
            }),
            method: 'POST',
          }),
          fetch(`${server.url}/api/reading/project-comments`, {
            body: JSON.stringify({
              body: 'Browser-supplied project context comment.',
              libraryEntryId: importedRecord.entry.id,
              projectId: importedRecord.projectId,
            }),
            headers: withSessionCookie(aliceCookie, {
              'Content-Type': 'application/json',
            }),
            method: 'POST',
          }),
          fetch(`${server.url}/api/reading/${importedRecord.entry.id}/project-comments`, {
            body: JSON.stringify({
              body: 'Browser-supplied nested project context comment.',
              projectId: importedRecord.projectId,
            }),
            headers: withSessionCookie(aliceCookie, {
              'Content-Type': 'application/json',
            }),
            method: 'POST',
          }),
          fetch(`${server.url}/api/reading/${importedRecord.entry.id}/project-comments`, {
            body: JSON.stringify({
              body: 'Browser-supplied comment visibility should be rejected.',
              visibility: 'published_to_project',
            }),
            headers: withSessionCookie(aliceCookie, {
              'Content-Type': 'application/json',
            }),
            method: 'POST',
          }),
          fetch(`${server.url}/api/reading/project-comments?projectId=${importedRecord.projectId}`, {
            body: JSON.stringify({
              body: 'Browser-supplied query project context comment.',
              libraryEntryId: importedRecord.entry.id,
            }),
            headers: withSessionCookie(aliceCookie, {
              'Content-Type': 'application/json',
            }),
            method: 'POST',
          }),
          fetch(`${server.url}/api/reading/${importedRecord.entry.id}/project-comments?scopeType=project`, {
            body: JSON.stringify({
              body: 'Browser-supplied nested query scope comment.',
            }),
            headers: withSessionCookie(aliceCookie, {
              'Content-Type': 'application/json',
            }),
            method: 'POST',
          }),
          fetch(`${server.url}/api/reading/project-comments`, {
            body: JSON.stringify({
              body: 'Personal entry comment.',
              libraryEntryId: personalImportedRecord.entry.id,
            }),
            headers: withSessionCookie(aliceCookie, {
              'Content-Type': 'application/json',
            }),
            method: 'POST',
          }),
        ]);

        for (const response of invalidProjectCommentResponses) {
          expect(response.status).toBe(400);
        }

        const unauthorizedMemberships = await fetch(
          `${server.url}/api/spaces/${createdSpace.id}/memberships`,
          { headers: withSessionCookie(bobCookie) },
        );
        expect(unauthorizedMemberships.status).toBe(403);
      } finally {
        await server.close();
      }
    } finally {
      rmSync(storageRoot, { force: true, recursive: true });
    }
  }, 30_000);

  it('rejects authority residue on generic reading note and insight writes', async () => {
    const storageRoot = mkdtempSync(join(tmpdir(), 'jixia-http-reading-residue-'));

    try {
      const server = await startTestServer(
        { JIXIA_STORAGE_ROOT: storageRoot },
        { connectors: { pubmed: createActorBoundaryPubmedConnector() } },
      );

      try {
        const aliceCookie = await loginAs(server.url, 'user-alice');
        const sharedSpace = await createSharedSpace(server.url, aliceCookie, 'user-alice');
        const importedRecord = await importPaper(
          server.url,
          aliceCookie,
          'user-alice',
          sharedSpace.id,
        );
        const jsonHeaders = withSessionCookie(aliceCookie, {
          'Content-Type': 'application/json',
        });
        const authorityBodyResidueCases: Array<[string, unknown]> = [
          ['ownerId', 'user-alice'],
          ['createdByUserId', 'user-alice'],
          ['projectId', importedRecord.projectId],
          ['scope', { id: importedRecord.projectId, type: 'project' }],
          ['scopeId', importedRecord.projectId],
          ['scopeType', 'project'],
          ['spaceId', sharedSpace.id],
          ['visibility', 'private'],
        ];
        const authorityQueryResidueCases: Array<[string, string]> = [
          ['ownerId', 'user-alice'],
          ['createdByUserId', 'user-alice'],
          ['projectId', importedRecord.projectId],
          ['scope', `project:${importedRecord.projectId}`],
          ['scopeId', importedRecord.projectId],
          ['scopeType', 'project'],
          ['spaceId', sharedSpace.id],
          ['visibility', 'private'],
        ];
        const expectProtectedRouteRejection = async (response: Response) => {
          const payload = (await response.json()) as { error: string };

          expect(response.status).toBe(400);
          expect(payload.error).toMatch(/not accepted for protected routes/i);
        };
        const withResidueQuery = (
          pathname: string,
          fieldName: string,
          value: string,
        ) => {
          const requestUrl = new URL(pathname, server.url);
          requestUrl.searchParams.set(fieldName, value);

          return requestUrl.toString();
        };

        for (const [fieldName, value] of authorityBodyResidueCases) {
          await expectProtectedRouteRejection(
            await fetch(`${server.url}/api/reading/notes`, {
              body: JSON.stringify({
                body: `Residue note body ${fieldName}`,
                libraryEntryId: importedRecord.entry.id,
                [fieldName]: value,
              }),
              headers: jsonHeaders,
              method: 'POST',
            }),
          );
          await expectProtectedRouteRejection(
            await fetch(`${server.url}/api/reading/insights`, {
              body: JSON.stringify({
                evidenceSpans: [],
                libraryEntryId: importedRecord.entry.id,
                summary: `Residue insight body ${fieldName}`,
                title: `Residue Insight ${fieldName}`,
                [fieldName]: value,
              }),
              headers: jsonHeaders,
              method: 'POST',
            }),
          );
        }

        for (const [fieldName, value] of authorityQueryResidueCases) {
          await expectProtectedRouteRejection(
            await fetch(withResidueQuery('/api/reading/notes', fieldName, value), {
              body: JSON.stringify({
                body: `Residue note query ${fieldName}`,
                libraryEntryId: importedRecord.entry.id,
              }),
              headers: jsonHeaders,
              method: 'POST',
            }),
          );
          await expectProtectedRouteRejection(
            await fetch(withResidueQuery('/api/reading/insights', fieldName, value), {
              body: JSON.stringify({
                evidenceSpans: [],
                libraryEntryId: importedRecord.entry.id,
                summary: `Residue insight query ${fieldName}`,
                title: `Residue Insight Query ${fieldName}`,
              }),
              headers: jsonHeaders,
              method: 'POST',
            }),
          );
        }
      } finally {
        await server.close();
      }
    } finally {
      rmSync(storageRoot, { force: true, recursive: true });
    }
  }, 30_000);

  it('rejects matching legacy identity fields on protected browser-facing routes', async () => {
    const storageRoot = mkdtempSync(join(tmpdir(), 'jixia-http-actor-matching-'));

    try {
      const server = await startTestServer(
        { JIXIA_STORAGE_ROOT: storageRoot },
        { connectors: { pubmed: createActorBoundaryPubmedConnector() } },
      );

      try {
        const aliceCookie = await loginAs(server.url, 'user-alice');

        const createdSpace = await createSharedSpace(server.url, aliceCookie, 'user-alice');
        const importedRecord = await importPaper(
          server.url,
          aliceCookie,
          'user-alice',
          createdSpace.id,
        );
        const credential = await createCredential(server.url, aliceCookie, 'user-alice');
        const job = await createJob(
          server.url,
          aliceCookie,
          'user-alice',
          credential.credentialRef,
          createdSpace.id,
        );
        const notebook = await createNotebook(server.url, aliceCookie, 'user-alice');
        const projectDoc = await createProjectDoc(
          server.url,
          aliceCookie,
          'user-alice',
          importedRecord.projectId,
        );

        const matchingResponses = await Promise.all([
          fetch(`${server.url}/api/spaces?actorUserId=user-alice`, {
            headers: withSessionCookie(aliceCookie),
          }),
          fetch(`${server.url}/api/spaces?userId=user-alice`, {
            body: JSON.stringify({ kind: 'shared', name: 'Matching Query Space' }),
            headers: withSessionCookie(aliceCookie, {
              'Content-Type': 'application/json',
            }),
            method: 'POST',
          }),
          fetch(`${server.url}/api/projects?actorUserId=user-alice`, {
            headers: withSessionCookie(aliceCookie),
          }),
          fetch(`${server.url}/api/projects?userId=user-alice`, {
            body: JSON.stringify({
              name: 'Matching Query Project',
              spaceId: createdSpace.id,
            }),
            headers: withSessionCookie(aliceCookie, {
              'Content-Type': 'application/json',
            }),
            method: 'POST',
          }),
          fetch(`${server.url}/api/projects/${importedRecord.projectId}/members?actorUserId=user-alice`, {
            body: JSON.stringify({ role: 'viewer', userId: 'user-bob' }),
            headers: withSessionCookie(aliceCookie, {
              'Content-Type': 'application/json',
            }),
            method: 'POST',
          }),
          fetch(`${server.url}/api/library/${importedRecord.entry.id}?actorSpaceId=${createdSpace.id}`, {
            headers: withSessionCookie(aliceCookie),
          }),
          fetch(`${server.url}/api/library/${importedRecord.entry.id}/file?actorSpaceId=${createdSpace.id}`, {
            headers: withSessionCookie(aliceCookie),
          }),
          fetch(`${server.url}/api/import/paper`, {
            body: JSON.stringify({
              requestedByUserId: 'user-alice',
              sourceLocator: '10.1000/matching-import',
              sourceType: 'doi',
              spaceId: createdSpace.id,
              visibility: 'space_shared',
            }),
            headers: withSessionCookie(aliceCookie, {
              'Content-Type': 'application/json',
            }),
            method: 'POST',
          }),
          fetch(`${server.url}/api/import/paper?actorUserId=user-alice`, {
            body: JSON.stringify({
              sourceLocator: '10.1000/matching-query-import',
              sourceType: 'doi',
              spaceId: createdSpace.id,
              visibility: 'space_shared',
            }),
            headers: withSessionCookie(aliceCookie, {
              'Content-Type': 'application/json',
            }),
            method: 'POST',
          }),
          fetch(`${server.url}/api/import/paper?requestedByUserId=user-alice`, {
            body: JSON.stringify({
              sourceLocator: '10.1000/matching-requested-query-import',
              sourceType: 'doi',
              spaceId: createdSpace.id,
              visibility: 'space_shared',
            }),
            headers: withSessionCookie(aliceCookie, {
              'Content-Type': 'application/json',
            }),
            method: 'POST',
          }),
          fetch(`${server.url}/api/import/pdf`, {
            body: JSON.stringify({
              pdfContents: '%PDF-1.4 matching upload',
              requestedByUserId: 'user-alice',
              spaceId: createdSpace.id,
              visibility: 'private',
            }),
            headers: withSessionCookie(aliceCookie, {
              'Content-Type': 'application/json',
            }),
            method: 'POST',
          }),
          fetch(`${server.url}/api/import/pdf?actorUserId=user-alice`, {
            body: JSON.stringify({
              pdfContents: '%PDF-1.4 matching query upload',
              spaceId: createdSpace.id,
              visibility: 'private',
            }),
            headers: withSessionCookie(aliceCookie, {
              'Content-Type': 'application/json',
            }),
            method: 'POST',
          }),
          fetch(`${server.url}/api/notebooks`, {
            body: JSON.stringify({ ownerId: 'user-alice', title: 'Matching owner notebook' }),
            headers: withSessionCookie(aliceCookie, {
              'Content-Type': 'application/json',
            }),
            method: 'POST',
          }),
          fetch(`${server.url}/api/notebooks?actorUserId=user-alice`, {
            body: JSON.stringify({ title: 'Matching query notebook' }),
            headers: withSessionCookie(aliceCookie, {
              'Content-Type': 'application/json',
            }),
            method: 'POST',
          }),
          fetch(`${server.url}/api/notebooks/${notebook.id}/versions`, {
            body: JSON.stringify({ actorUserId: 'user-alice', citations: [], content: 'Matching notebook save' }),
            headers: withSessionCookie(aliceCookie, {
              'Content-Type': 'application/json',
            }),
            method: 'POST',
          }),
          fetch(`${server.url}/api/notebooks/${notebook.id}/versions?userId=user-alice`, {
            body: JSON.stringify({ citations: [], content: 'Matching query notebook save' }),
            headers: withSessionCookie(aliceCookie, {
              'Content-Type': 'application/json',
            }),
            method: 'POST',
          }),
          fetch(`${server.url}/api/notebooks?ownerId=user-alice`, {
            headers: withSessionCookie(aliceCookie),
          }),
          fetch(`${server.url}/api/notebooks?spaceId=${createdSpace.id}`, {
            headers: withSessionCookie(aliceCookie),
          }),
          fetch(`${server.url}/api/notebooks/${notebook.id}/snapshot?ownerId=user-alice`, {
            headers: withSessionCookie(aliceCookie),
          }),
          fetch(`${server.url}/api/notebooks/${notebook.id}/versions`, {
            body: JSON.stringify({ citations: [], content: 'Matching owner field', ownerId: 'user-alice' }),
            headers: withSessionCookie(aliceCookie, {
              'Content-Type': 'application/json',
            }),
            method: 'POST',
          }),
          fetch(`${server.url}/api/notebooks/${notebook.id}/versions`, {
            body: JSON.stringify({ citations: [], content: 'Matching visibility field', visibility: 'private' }),
            headers: withSessionCookie(aliceCookie, {
              'Content-Type': 'application/json',
            }),
            method: 'POST',
          }),
          fetch(`${server.url}/api/notebooks/capture`, {
            body: JSON.stringify({
              ownerId: 'user-alice',
              source: {
                generatedInsightId: 'insight-matching',
                libraryEntryId: importedRecord.entry.id,
                type: 'generatedInsight',
              },
            }),
            headers: withSessionCookie(aliceCookie, {
              'Content-Type': 'application/json',
            }),
            method: 'POST',
          }),
          fetch(`${server.url}/api/notebooks/capture`, {
            body: JSON.stringify({
              notebookTitle: 'Matching reader excerpt notebook',
              source: {
                actorUserId: 'user-alice',
                readerExcerptId: 'excerpt-matching',
                type: 'readerExcerpt',
              },
            }),
            headers: withSessionCookie(aliceCookie, {
              'Content-Type': 'application/json',
            }),
            method: 'POST',
          }),
          fetch(`${server.url}/api/notebooks/capture`, {
            body: JSON.stringify({
              notebookTitle: 'Matching reader excerpt scope notebook',
              source: {
                readerExcerptId: 'excerpt-matching',
                scopeType: 'project',
                type: 'readerExcerpt',
              },
            }),
            headers: withSessionCookie(aliceCookie, {
              'Content-Type': 'application/json',
            }),
            method: 'POST',
          }),
          fetch(`${server.url}/api/notebooks/capture`, {
            body: JSON.stringify({
              notebookTitle: 'Matching nested capture owner',
              source: {
                ownerId: 'user-alice',
                readerExcerptId: 'excerpt-matching',
                type: 'readerExcerpt',
              },
            }),
            headers: withSessionCookie(aliceCookie, {
              'Content-Type': 'application/json',
            }),
            method: 'POST',
          }),
          fetch(`${server.url}/api/notebooks/capture`, {
            body: JSON.stringify({
              notebookTitle: 'Matching nested capture project',
              source: {
                projectId: importedRecord.projectId,
                readerExcerptId: 'excerpt-matching',
                type: 'readerExcerpt',
              },
            }),
            headers: withSessionCookie(aliceCookie, {
              'Content-Type': 'application/json',
            }),
            method: 'POST',
          }),
          fetch(`${server.url}/api/project-docs`, {
            body: JSON.stringify({ createdByUserId: 'user-alice', projectId: importedRecord.projectId, title: 'Matching project doc' }),
            headers: withSessionCookie(aliceCookie, {
              'Content-Type': 'application/json',
            }),
            method: 'POST',
          }),
          fetch(`${server.url}/api/project-docs?createdByUserId=user-alice`, {
            body: JSON.stringify({ projectId: importedRecord.projectId, title: 'Matching query creator project doc' }),
            headers: withSessionCookie(aliceCookie, {
              'Content-Type': 'application/json',
            }),
            method: 'POST',
          }),
          fetch(`${server.url}/api/project-docs?actorUserId=user-alice`, {
            body: JSON.stringify({ projectId: importedRecord.projectId, title: 'Matching query project doc' }),
            headers: withSessionCookie(aliceCookie, {
              'Content-Type': 'application/json',
            }),
            method: 'POST',
          }),
          fetch(`${server.url}/api/project-docs/${projectDoc.id}/versions`, {
            body: JSON.stringify({ actorUserId: 'user-alice', citations: [], content: 'Matching project-doc save' }),
            headers: withSessionCookie(aliceCookie, {
              'Content-Type': 'application/json',
            }),
            method: 'POST',
          }),
          fetch(`${server.url}/api/project-docs/${projectDoc.id}/versions?userId=user-alice`, {
            body: JSON.stringify({ citations: [], content: 'Matching query project-doc save' }),
            headers: withSessionCookie(aliceCookie, {
              'Content-Type': 'application/json',
            }),
            method: 'POST',
          }),
          fetch(`${server.url}/api/project-docs/${projectDoc.id}/versions`, {
            body: JSON.stringify({ citations: [], content: 'Matching creator project-doc save', createdByUserId: 'user-alice' }),
            headers: withSessionCookie(aliceCookie, {
              'Content-Type': 'application/json',
            }),
            method: 'POST',
          }),
          fetch(`${server.url}/api/project-docs/${projectDoc.id}/notebook-adoptions`, {
            body: JSON.stringify({ actorUserId: 'user-alice', notebookDocumentId: notebook.id }),
            headers: withSessionCookie(aliceCookie, {
              'Content-Type': 'application/json',
            }),
            method: 'POST',
          }),
          fetch(`${server.url}/api/project-docs/${projectDoc.id}/notebook-adoptions?ownerId=user-alice`, {
            body: JSON.stringify({ notebookDocumentId: notebook.id }),
            headers: withSessionCookie(aliceCookie, {
              'Content-Type': 'application/json',
            }),
            method: 'POST',
          }),
          fetch(`${server.url}/api/project-docs/${projectDoc.id}/citation-trace?actorUserId=user-alice`, {
            headers: withSessionCookie(aliceCookie),
          }),
          fetch(`${server.url}/api/project-docs/${projectDoc.id}/citation-trace?userId=user-alice`, {
            headers: withSessionCookie(aliceCookie),
          }),
          fetch(`${server.url}/api/project-docs/${projectDoc.id}/citation-trace?createdByUserId=user-alice`, {
            headers: withSessionCookie(aliceCookie),
          }),
          fetch(`${server.url}/api/project-docs/${projectDoc.id}/citation-trace?ownerId=user-alice`, {
            headers: withSessionCookie(aliceCookie),
          }),
          fetch(`${server.url}/api/project-docs/${projectDoc.id}/citation-trace?spaceId=${createdSpace.id}`, {
            headers: withSessionCookie(aliceCookie),
          }),
          fetch(`${server.url}/api/project-docs/${projectDoc.id}/citation-trace?scope=${encodeURIComponent(`project:${importedRecord.projectId}`)}`, {
            headers: withSessionCookie(aliceCookie),
          }),
          fetch(`${server.url}/api/project-docs/${projectDoc.id}/citation-trace?scopeId=${importedRecord.projectId}`, {
            headers: withSessionCookie(aliceCookie),
          }),
          fetch(`${server.url}/api/project-docs/${projectDoc.id}/citation-trace?scopeType=project`, {
            headers: withSessionCookie(aliceCookie),
          }),
          fetch(`${server.url}/api/project-docs/${projectDoc.id}/citation-trace?visibility=published_to_project`, {
            headers: withSessionCookie(aliceCookie),
          }),
          fetch(`${server.url}/api/project-docs/${projectDoc.id}/citation-trace?projectId=${importedRecord.projectId}`, {
            headers: withSessionCookie(aliceCookie),
          }),
          fetch(`${server.url}/api/projects/${importedRecord.projectId}/library/adoptions?ownerId=user-alice`, {
            body: JSON.stringify({
              sourceLibraryEntryId: importedRecord.entry.id,
            }),
            headers: withSessionCookie(aliceCookie, {
              'Content-Type': 'application/json',
            }),
            method: 'POST',
          }),
          fetch(`${server.url}/api/projects/${importedRecord.projectId}/library/adoptions?scope=${encodeURIComponent(`project:${importedRecord.projectId}`)}`, {
            body: JSON.stringify({
              sourceLibraryEntryId: importedRecord.entry.id,
            }),
            headers: withSessionCookie(aliceCookie, {
              'Content-Type': 'application/json',
            }),
            method: 'POST',
          }),
          fetch(`${server.url}/api/projects/${importedRecord.projectId}/library/adoptions`, {
            body: JSON.stringify({
              sourceLibraryEntryId: importedRecord.entry.id,
              spaceId: createdSpace.id,
            }),
            headers: withSessionCookie(aliceCookie, {
              'Content-Type': 'application/json',
            }),
            method: 'POST',
          }),
          fetch(`${server.url}/api/projects/${importedRecord.projectId}/library/adoptions`, {
            body: JSON.stringify({
              scopeType: 'project',
              sourceLibraryEntryId: importedRecord.entry.id,
            }),
            headers: withSessionCookie(aliceCookie, {
              'Content-Type': 'application/json',
            }),
            method: 'POST',
          }),
          fetch(`${server.url}/api/projects/${importedRecord.projectId}/library/adoptions`, {
            body: JSON.stringify({
              sourceLibraryEntryId: importedRecord.entry.id,
              visibility: 'published_to_project',
            }),
            headers: withSessionCookie(aliceCookie, {
              'Content-Type': 'application/json',
            }),
            method: 'POST',
          }),
          fetch(`${server.url}/api/reading/${importedRecord.entry.id}?actorSpaceId=${createdSpace.id}`, {
            headers: withSessionCookie(aliceCookie),
          }),
          fetch(`${server.url}/api/reading/notes`, {
            body: JSON.stringify({
              authorUserId: 'user-alice',
              body: 'Matching note should be rejected.',
              libraryEntryId: importedRecord.entry.id,
            }),
            headers: withSessionCookie(aliceCookie, {
              'Content-Type': 'application/json',
            }),
            method: 'POST',
          }),
          fetch(`${server.url}/api/reading/notes`, {
            body: JSON.stringify({
              actorSpaceId: createdSpace.id,
              body: 'Matching note actor space should be rejected.',
              libraryEntryId: importedRecord.entry.id,
            }),
            headers: withSessionCookie(aliceCookie, {
              'Content-Type': 'application/json',
            }),
            method: 'POST',
          }),
          fetch(`${server.url}/api/reading/notes?actorUserId=user-alice`, {
            body: JSON.stringify({
              body: 'Matching query note should be rejected.',
              libraryEntryId: importedRecord.entry.id,
            }),
            headers: withSessionCookie(aliceCookie, {
              'Content-Type': 'application/json',
            }),
            method: 'POST',
          }),
          fetch(`${server.url}/api/reading/notes?authorUserId=user-alice`, {
            body: JSON.stringify({
              body: 'Matching query note author should be rejected.',
              libraryEntryId: importedRecord.entry.id,
            }),
            headers: withSessionCookie(aliceCookie, {
              'Content-Type': 'application/json',
            }),
            method: 'POST',
          }),
          fetch(`${server.url}/api/reading/project-comments`, {
            body: JSON.stringify({
              body: 'Matching project comment project context should be rejected.',
              libraryEntryId: importedRecord.entry.id,
              projectId: importedRecord.projectId,
            }),
            headers: withSessionCookie(aliceCookie, {
              'Content-Type': 'application/json',
            }),
            method: 'POST',
          }),
          fetch(`${server.url}/api/reading/${importedRecord.entry.id}/project-comments`, {
            body: JSON.stringify({
              body: 'Matching nested project comment project context should be rejected.',
              projectId: importedRecord.projectId,
            }),
            headers: withSessionCookie(aliceCookie, {
              'Content-Type': 'application/json',
            }),
            method: 'POST',
          }),
          fetch(`${server.url}/api/reading/project-comments?projectId=${importedRecord.projectId}`, {
            body: JSON.stringify({
              body: 'Matching query project comment project context should be rejected.',
              libraryEntryId: importedRecord.entry.id,
            }),
            headers: withSessionCookie(aliceCookie, {
              'Content-Type': 'application/json',
            }),
            method: 'POST',
          }),
          fetch(`${server.url}/api/reading/${importedRecord.entry.id}/project-comments?spaceId=${createdSpace.id}`, {
            body: JSON.stringify({
              body: 'Matching nested query project comment space context should be rejected.',
            }),
            headers: withSessionCookie(aliceCookie, {
              'Content-Type': 'application/json',
            }),
            method: 'POST',
          }),
          fetch(`${server.url}/api/reading/${importedRecord.entry.id}/excerpts?actorUserId=user-alice`, {
            headers: withSessionCookie(aliceCookie),
          }),
          fetch(`${server.url}/api/reading/${importedRecord.entry.id}/excerpts?visibility=published_to_project`, {
            headers: withSessionCookie(aliceCookie),
          }),
          fetch(`${server.url}/api/reading/${importedRecord.entry.id}/excerpts?createdByUserId=user-alice`, {
            headers: withSessionCookie(aliceCookie),
          }),
          fetch(`${server.url}/api/reading/${importedRecord.entry.id}/excerpts`, {
            body: JSON.stringify({
              endOffset: 22,
              quote: 'Matching excerpt actor should be rejected.',
              startOffset: 0,
              userId: 'user-alice',
            }),
            headers: withSessionCookie(aliceCookie, {
              'Content-Type': 'application/json',
            }),
            method: 'POST',
          }),
          fetch(`${server.url}/api/reading/${importedRecord.entry.id}/excerpts`, {
            body: JSON.stringify({
              createdByUserId: 'user-alice',
              endOffset: 23,
              quote: 'Matching excerpt creator should be rejected.',
              startOffset: 0,
            }),
            headers: withSessionCookie(aliceCookie, {
              'Content-Type': 'application/json',
            }),
            method: 'POST',
          }),
          fetch(`${server.url}/api/reading/${importedRecord.entry.id}/excerpts`, {
            body: JSON.stringify({
              endOffset: 24,
              ownerId: 'user-alice',
              quote: 'Matching excerpt owner should be rejected.',
              startOffset: 0,
            }),
            headers: withSessionCookie(aliceCookie, {
              'Content-Type': 'application/json',
            }),
            method: 'POST',
          }),
          fetch(`${server.url}/api/reading/${importedRecord.entry.id}/excerpts`, {
            body: JSON.stringify({
              endOffset: 25,
              quote: 'Matching excerpt scope should be rejected.',
              scope: { id: importedRecord.projectId, type: 'project' },
              startOffset: 0,
            }),
            headers: withSessionCookie(aliceCookie, {
              'Content-Type': 'application/json',
            }),
            method: 'POST',
          }),
          fetch(`${server.url}/api/reading/insights`, {
            body: JSON.stringify({
              evidenceSpans: [],
              libraryEntryId: importedRecord.entry.id,
              startedByUserId: 'user-alice',
              summary: 'Matching insight should be rejected.',
              title: 'Matching Insight',
            }),
            headers: withSessionCookie(aliceCookie, {
              'Content-Type': 'application/json',
            }),
            method: 'POST',
          }),
          fetch(`${server.url}/api/reading/insights?userId=user-alice`, {
            body: JSON.stringify({
              evidenceSpans: [],
              libraryEntryId: importedRecord.entry.id,
              summary: 'Matching query insight should be rejected.',
              title: 'Matching Query Insight',
            }),
            headers: withSessionCookie(aliceCookie, {
              'Content-Type': 'application/json',
            }),
            method: 'POST',
          }),
          fetch(`${server.url}/api/reading/insights?startedByUserId=user-alice`, {
            body: JSON.stringify({
              evidenceSpans: [],
              libraryEntryId: importedRecord.entry.id,
              summary: 'Matching query insight starter should be rejected.',
              title: 'Matching Query Insight Starter',
            }),
            headers: withSessionCookie(aliceCookie, {
              'Content-Type': 'application/json',
            }),
            method: 'POST',
          }),
          fetch(`${server.url}/api/credentials?userId=user-alice`, {
            headers: withSessionCookie(aliceCookie),
          }),
          fetch(`${server.url}/api/credentials?actorUserId=user-alice`, {
            body: JSON.stringify({
              provider: 'openai',
              rawSecret: 'matching-query-credential-placeholder',
            }),
            headers: withSessionCookie(aliceCookie, {
              'Content-Type': 'application/json',
            }),
            method: 'POST',
          }),
          fetch(`${server.url}/api/settings/me?userId=user-alice`, {
            headers: withSessionCookie(aliceCookie),
          }),
          fetch(`${server.url}/api/settings/me`, {
            body: JSON.stringify({
              defaultImportTarget: 'personal-library',
              userId: 'user-alice',
            }),
            headers: withSessionCookie(aliceCookie, {
              'Content-Type': 'application/json',
            }),
            method: 'POST',
          }),
          fetch(`${server.url}/api/jobs?actorSpaceId=${createdSpace.id}`, {
            headers: withSessionCookie(aliceCookie),
          }),
          fetch(`${server.url}/api/jobs?actorUserId=user-alice`, {
            body: JSON.stringify({
              credentialRef: credential.credentialRef,
              kind: 'ai.summary',
              payload: { prompt: 'Matching query job should be rejected.' },
              spaceId: createdSpace.id,
            }),
            headers: withSessionCookie(aliceCookie, {
              'Content-Type': 'application/json',
            }),
            method: 'POST',
          }),
          fetch(`${server.url}/api/jobs?requestedByUserId=user-alice`, {
            body: JSON.stringify({
              credentialRef: credential.credentialRef,
              kind: 'ai.summary',
              payload: { prompt: 'Matching query requested job should be rejected.' },
              spaceId: createdSpace.id,
            }),
            headers: withSessionCookie(aliceCookie, {
              'Content-Type': 'application/json',
            }),
            method: 'POST',
          }),
          fetch(`${server.url}/api/jobs`, {
            body: JSON.stringify({
              credentialRef: credential.credentialRef,
              kind: 'ai.summary',
              payload: { prompt: 'Matching job should be rejected.' },
              requestedByUserId: 'user-alice',
              spaceId: createdSpace.id,
            }),
            headers: withSessionCookie(aliceCookie, {
              'Content-Type': 'application/json',
            }),
            method: 'POST',
          }),
          fetch(`${server.url}/api/jobs/${job.id}/run?userId=user-alice`, {
            body: JSON.stringify({}),
            headers: withSessionCookie(aliceCookie, {
              'Content-Type': 'application/json',
            }),
            method: 'POST',
          }),
          fetch(`${server.url}/api/jobs/${job.id}/run`, {
            body: JSON.stringify({ actorUserId: 'user-alice' }),
            headers: withSessionCookie(aliceCookie, {
              'Content-Type': 'application/json',
            }),
            method: 'POST',
          }),
          fetch(`${server.url}/api/jobs/${job.id}/cancel?userId=user-alice`, {
            body: JSON.stringify({}),
            headers: withSessionCookie(aliceCookie, {
              'Content-Type': 'application/json',
            }),
            method: 'POST',
          }),
          fetch(`${server.url}/api/jobs/${job.id}/cancel`, {
            body: JSON.stringify({ actorUserId: 'user-alice' }),
            headers: withSessionCookie(aliceCookie, {
              'Content-Type': 'application/json',
            }),
            method: 'POST',
          }),
        ]);

        for (const response of matchingResponses) {
          const payload = (await response.json()) as { error: string };

          expect(response.status).toBe(400);
          expect(payload.error).toMatch(/not accepted for protected routes/i);
        }
      } finally {
        await server.close();
      }
    } finally {
      rmSync(storageRoot, { force: true, recursive: true });
    }
  }, 30_000);

  it('creates and lists reader excerpts through session actor authority only', async () => {
    const storageRoot = mkdtempSync(join(tmpdir(), 'jixia-http-reader-excerpts-'));

    try {
      const server = await startTestServer(
        { JIXIA_STORAGE_ROOT: storageRoot },
        { connectors: { pubmed: createActorBoundaryPubmedConnector() } },
      );

      try {
        const aliceCookie = await loginAs(server.url, 'user-alice');
        const bobCookie = await loginAs(server.url, 'user-bob');
        const charlieCookie = await loginAs(server.url, 'user-charlie');
        const sharedSpace = await createSharedSpace(server.url, aliceCookie, 'user-alice');
        const importedRecord = await importPaper(
          server.url,
          aliceCookie,
          'user-alice',
          sharedSpace.id,
        );

        const bobMemberResponse = await fetch(
          `${server.url}/api/projects/${importedRecord.projectId}/members`,
          {
            body: JSON.stringify({ role: 'viewer', userId: 'user-bob' }),
            headers: withSessionCookie(aliceCookie, {
              'Content-Type': 'application/json',
            }),
            method: 'POST',
          },
        );
        expect(bobMemberResponse.status).toBe(200);

        const createdResponse = await fetch(
          `${server.url}/api/reading/${importedRecord.entry.id}/excerpts`,
          {
            body: JSON.stringify({
              endOffset: 32,
              locator: 'p. 3',
              note: 'Traceable HTTP reader evidence.',
              quote: 'HTTP durable reader evidence',
              startOffset: 4,
            }),
            headers: withSessionCookie(aliceCookie, {
              'Content-Type': 'application/json',
            }),
            method: 'POST',
          },
        );
        const createdBody = await createdResponse.json() as {
          excerpt: {
            createdByUserId: string;
            id: string;
            libraryEntryId: string;
            locator?: string;
            projectId?: string;
            quote: string;
            scopeType?: string;
            visibility?: string;
          };
        };

        expect(createdResponse.status).toBe(201);
        expect(createdBody.excerpt).toMatchObject({
          createdByUserId: 'user-alice',
          libraryEntryId: importedRecord.entry.id,
          locator: 'p. 3',
          quote: 'HTTP durable reader evidence',
        });
        expect(createdBody.excerpt).not.toHaveProperty('visibility');
        expect(createdBody.excerpt).not.toHaveProperty('projectId');
        expect(createdBody.excerpt).not.toHaveProperty('scopeType');

        const aliceListResponse = await fetch(
          `${server.url}/api/reading/${importedRecord.entry.id}/excerpts`,
          { headers: withSessionCookie(aliceCookie) },
        );
        const bobListResponse = await fetch(
          `${server.url}/api/reading/${importedRecord.entry.id}/excerpts`,
          { headers: withSessionCookie(bobCookie) },
        );
        const charlieListResponse = await fetch(
          `${server.url}/api/reading/${importedRecord.entry.id}/excerpts`,
          { headers: withSessionCookie(charlieCookie) },
        );

        expect(aliceListResponse.status).toBe(200);
        await expect(aliceListResponse.json()).resolves.toMatchObject({
          excerpts: [
            expect.objectContaining({
              id: createdBody.excerpt.id,
              quote: 'HTTP durable reader evidence',
            }),
          ],
        });
        expect(bobListResponse.status).toBe(200);
        await expect(bobListResponse.json()).resolves.toMatchObject({
          excerpts: [
            expect.objectContaining({
              id: createdBody.excerpt.id,
            }),
          ],
        });
        expect(charlieListResponse.status).toBe(403);
      } finally {
        await server.close();
      }
    } finally {
      rmSync(storageRoot, { force: true, recursive: true });
    }
  }, 30_000);

  it('adopts project library entries through the session-protected canonical route', async () => {
    const storageRoot = mkdtempSync(join(tmpdir(), 'jixia-http-library-adoption-'));

    try {
      const server = await startTestServer(
        { JIXIA_STORAGE_ROOT: storageRoot },
        { connectors: { pubmed: createActorBoundaryPubmedConnector() } },
      );

      try {
        const aliceCookie = await loginAs(server.url, 'user-alice');
        const bobCookie = await loginAs(server.url, 'user-bob');
        const charlieCookie = await loginAs(server.url, 'user-charlie');
        const createdSpace = await createSharedSpace(server.url, aliceCookie, 'user-alice');
        const project = await createProject(
          server.url,
          aliceCookie,
          'user-alice',
          createdSpace.id,
        );
        const viewerMembership = await fetch(
          `${server.url}/api/projects/${project.project.id}/members`,
          {
            body: JSON.stringify({ role: 'viewer', userId: 'user-charlie' }),
            headers: withSessionCookie(aliceCookie, {
              'Content-Type': 'application/json',
            }),
            method: 'POST',
          },
        );
        const sourceResponse = await fetch(`${server.url}/api/import/paper`, {
          body: JSON.stringify({
            scope: { id: 'user-alice', type: 'user' },
            sourceLocator: '10.1000/http-adopt-source',
            sourceType: 'doi',
            spaceId: createdSpace.id,
            visibility: 'private',
          }),
          headers: withSessionCookie(aliceCookie, {
            'Content-Type': 'application/json',
          }),
          method: 'POST',
        });
        const source = await sourceResponse.json() as {
          asset: { id: string };
          entry: { id: string };
        };

        const firstAdoption = await fetch(
          `${server.url}/api/projects/${project.project.id}/library/adoptions`,
          {
            body: JSON.stringify({ sourceLibraryEntryId: source.entry.id }),
            headers: withSessionCookie(aliceCookie, {
              'Content-Type': 'application/json',
            }),
            method: 'POST',
          },
        );
        const firstAdoptionBody = await firstAdoption.json() as {
          entry: {
            asset: { id: string; storageKey?: string };
            entry: { id: string; paperAssetId: string; scope: { id: string; type: string } };
          };
          reused: boolean;
        };
        const repeatedAdoption = await fetch(
          `${server.url}/api/projects/${project.project.id}/library/adoptions`,
          {
            body: JSON.stringify({ sourceLibraryEntryId: source.entry.id }),
            headers: withSessionCookie(aliceCookie, {
              'Content-Type': 'application/json',
            }),
            method: 'POST',
          },
        );
        const repeatedAdoptionBody = await repeatedAdoption.json() as {
          entry: { entry: { id: string } };
          reused: boolean;
        };
        const emptyBodyResponse = await fetch(
          `${server.url}/api/projects/${project.project.id}/library/adoptions`,
          {
            body: JSON.stringify({ sourceLibraryEntryId: ' ' }),
            headers: withSessionCookie(aliceCookie, {
              'Content-Type': 'application/json',
            }),
            method: 'POST',
          },
        );
        const viewerDeniedResponse = await fetch(
          `${server.url}/api/projects/${project.project.id}/library/adoptions`,
          {
            body: JSON.stringify({ sourceLibraryEntryId: firstAdoptionBody.entry.entry.id }),
            headers: withSessionCookie(charlieCookie, {
              'Content-Type': 'application/json',
            }),
            method: 'POST',
          },
        );
        const unreadableSourceResponse = await fetch(
          `${server.url}/api/projects/${project.project.id}/library/adoptions`,
          {
            body: JSON.stringify({ sourceLibraryEntryId: source.entry.id }),
            headers: withSessionCookie(bobCookie, {
              'Content-Type': 'application/json',
            }),
            method: 'POST',
          },
        );

        expect(sourceResponse.status).toBe(200);
        expect(viewerMembership.status).toBe(200);
        expect(firstAdoption.status).toBe(200);
        expect(firstAdoptionBody).toMatchObject({
          entry: {
            asset: { id: source.asset.id },
            entry: {
              paperAssetId: source.asset.id,
              scope: { id: project.project.id, type: 'project' },
            },
          },
          reused: false,
        });
        expect(firstAdoptionBody.entry.asset).not.toHaveProperty('storageKey');
        expect(repeatedAdoption.status).toBe(200);
        expect(repeatedAdoptionBody.reused).toBe(true);
        expect(repeatedAdoptionBody.entry.entry.id).toBe(firstAdoptionBody.entry.entry.id);
        expect(emptyBodyResponse.status).toBe(400);
        expect(viewerDeniedResponse.status).toBe(403);
        expect(unreadableSourceResponse.status).toBe(403);
      } finally {
        await server.close();
      }
    } finally {
      rmSync(storageRoot, { force: true, recursive: true });
    }
  }, 30_000);

  it('supports an explicit legacy test override only when gated on the server', async () => {
    const storageRoot = mkdtempSync(join(tmpdir(), 'jixia-http-actor-legacy-'));

    try {
      const server = await startTestServer({
        JIXIA_ALLOW_LEGACY_ACTOR_OVERRIDE: 'true',
        JIXIA_STORAGE_ROOT: storageRoot,
      });

      try {
        const createdSpace = await fetch(`${server.url}/api/spaces`, {
          body: JSON.stringify({ kind: 'shared', name: 'Legacy Override Shared' }),
          headers: {
            'Content-Type': 'application/json',
            'x-jixia-actor': 'user-alice',
          },
          method: 'POST',
        });

        expect(createdSpace.status).toBe(200);

        const conflictResponse = await fetch(`${server.url}/api/spaces`, {
          body: JSON.stringify({ kind: 'shared', name: 'Conflicting Legacy Override' }),
          headers: {
            Authorization: 'Bearer user-bob',
            'Content-Type': 'application/json',
            'x-jixia-actor': ' user-alice ',
          },
          method: 'POST',
        });

        expect(conflictResponse.status).toBe(400);
        await expect(conflictResponse.json()).resolves.toMatchObject({
          error: expect.stringMatching(/conflicting actor sessions/i),
        });
      } finally {
        await server.close();
      }
    } finally {
      rmSync(storageRoot, { force: true, recursive: true });
    }
  });

  it('rejects production startup when legacy actor override is enabled', async () => {
    const storageRoot = mkdtempSync(join(tmpdir(), 'jixia-http-actor-prod-guard-'));

    try {
      await expect(
        startTestServer({
          JIXIA_ALLOW_LEGACY_ACTOR_OVERRIDE: 'true',
          JIXIA_STORAGE_ROOT: storageRoot,
          NODE_ENV: 'production',
        }),
      ).rejects.toThrow(/must not be enabled in production/i);
    } finally {
      rmSync(storageRoot, { force: true, recursive: true });
    }
  });

  it('keeps static guards against browser actor header authority regressions', () => {
    const actorSource = readFileSync('src/server/auth/actor.ts', 'utf8');
    const httpClient = readFileSync('src/web/lib/http-client.ts', 'utf8');
    const demoApi = readFileSync('src/web/lib/demo-api.ts', 'utf8');
    const httpServer = readFileSync('src/server/http-server.ts', 'utf8');
    const loginPage = readFileSync('src/web/pages/login-page.tsx', 'utf8');
    const sessionContract = readFileSync('src/shared/contracts/session.ts', 'utf8');
    const runtimeContext = readFileSync('src/web/presenters/runtime-context.ts', 'utf8');
    const sessionSchema = readFileSync('prisma/schema.prisma', 'utf8');

    expect(sessionSchema).toContain('model UserSession');
    expect(sessionSchema).toContain('tokenHash  String   @unique');
    expect(actorSource).toContain('readSessionTokenFromCookieHeader');
    expect(actorSource).toContain('allowLegacyTestOverride');
    expect(actorSource).not.toContain('Send x-jixia-actor for the lab-hosted MVP');
    expect(actorSource).not.toContain('return normalizedDevHeaderActor ?? bearerActor');
    expect(httpClient).not.toContain('x-jixia-actor');
    expect(demoApi).not.toContain("x-jixia-actor");
    expect(httpServer).toContain('assertNoLegacyLoginAuthorityFields');
    expect(loginPage).toContain('loginProfileKey');
    expect(loginPage).not.toContain('await login({ userId:');
    expect(sessionContract).toContain('loginProfileKey: LoginProfileKey');
    expect(sessionContract).not.toContain('userId?: string');
    expect(sessionContract).not.toContain('email?: string');
    expect(runtimeContext).not.toContain('actorUserId');
    expect(runtimeContext).not.toContain('user-alice');
  });
});
