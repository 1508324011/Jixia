import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { describe, expect, it } from 'vitest';

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

describe('http server actor boundary cleanup', () => {
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
          fetch(`${server.url}/api/projects`),
          fetch(`${server.url}/api/notebooks/notebook-1`),
          fetch(`${server.url}/api/project-docs/project-doc-1`),
          fetch(`${server.url}/api/reading/entry-1`),
          fetch(`${server.url}/api/jobs`),
          fetch(`${server.url}/api/jobs/job-1/stream`),
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

  it('derives protected access from session cookies and rejects spoofed legacy actor fields', async () => {
    const storageRoot = mkdtempSync(join(tmpdir(), 'jixia-http-actor-400-'));

    try {
      const server = await startTestServer({ JIXIA_STORAGE_ROOT: storageRoot });

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
          fetch(`${server.url}/api/project-docs`, {
            body: JSON.stringify({ createdByUserId: 'user-bob', projectId: importedRecord.projectId, title: 'Spoofed project doc' }),
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
          fetch(`${server.url}/api/project-docs/${projectDoc.id}/publish-state`, {
            body: JSON.stringify({ actorUserId: 'user-bob', publishState: 'review' }),
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
              visibility: 'private',
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
        ]);

        for (const response of mismatchResponses) {
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
          headers: {
            Authorization: 'Bearer user-bob',
            'x-jixia-actor': ' user-alice ',
          },
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
    expect(runtimeContext).not.toContain('actorUserId');
    expect(runtimeContext).not.toContain('user-alice');
  });
});
