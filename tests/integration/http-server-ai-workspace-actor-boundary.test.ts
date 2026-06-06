import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  loginAs,
  startTestServer,
  withSessionCookie,
} from './http-session-test-helpers';

function jsonHeaders(cookie?: string): HeadersInit {
  const headers: HeadersInit = { 'Content-Type': 'application/json' };

  return cookie ? withSessionCookie(cookie, headers) : headers;
}

async function expectJsonResponse<T>(response: Response): Promise<T> {
  const text = await response.text();

  if (!response.ok) {
    throw new Error(`Expected HTTP success, got ${response.status}: ${text}`);
  }

  return JSON.parse(text) as T;
}

describe('AI Workspace HTTP actor boundary', () => {
  it('requires a session cookie for every AI Workspace endpoint and ignores legacy header authority', async () => {
    const storageRoot = mkdtempSync(join(tmpdir(), 'jixia-http-ai-workspace-401-'));

    try {
      const server = await startTestServer({
        JIXIA_DATABASE_URL: `file:${join(storageRoot, 'jixia-ai-workspace-401.db')}`,
        JIXIA_STORAGE_ROOT: storageRoot,
      });

      try {
        const responses = await Promise.all([
          fetch(`${server.url}/api/ai-workspace/sessions`),
          fetch(`${server.url}/api/ai-workspace/sessions`, {
            body: JSON.stringify({ title: 'Unauthenticated personal session' }),
            headers: jsonHeaders(),
            method: 'POST',
          }),
          fetch(`${server.url}/api/ai-workspace/projects/project-1/sessions`),
          fetch(`${server.url}/api/ai-workspace/projects/project-1/sessions`, {
            body: JSON.stringify({ title: 'Unauthenticated project session' }),
            headers: jsonHeaders(),
            method: 'POST',
          }),
          fetch(`${server.url}/api/ai-workspace/sessions/session-1/context-packs`),
          fetch(`${server.url}/api/ai-workspace/sessions/session-1/context-packs`, {
            body: JSON.stringify({ title: 'Unauthenticated pack' }),
            headers: jsonHeaders(),
            method: 'POST',
          }),
          fetch(`${server.url}/api/ai-workspace/context-packs/pack-1`),
          fetch(`${server.url}/api/ai-workspace/context-packs/pack-1/items`, {
            body: JSON.stringify({
              source: { libraryEntryId: 'entry-1', sourceType: 'projectLibraryEntry' },
            }),
            headers: jsonHeaders(),
            method: 'POST',
          }),
          fetch(`${server.url}/api/ai-workspace/jobs`, {
            body: JSON.stringify({ contextPackId: 'pack-1', credentialRef: 'cred-1' }),
            headers: jsonHeaders(),
            method: 'POST',
          }),
          fetch(`${server.url}/api/ai-workspace/sessions`, {
            headers: { 'x-jixia-actor': 'user-alice' },
          }),
          fetch(`${server.url}/api/ai-workspace/sessions`, {
            headers: { Authorization: 'Bearer user-alice' },
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

  it('rejects browser-supplied AI Workspace actor, scope, project, visibility, and raw-context residue', async () => {
    const storageRoot = mkdtempSync(join(tmpdir(), 'jixia-http-ai-workspace-residue-'));

    try {
      const server = await startTestServer({
        JIXIA_DATABASE_URL: `file:${join(storageRoot, 'jixia-ai-workspace-residue.db')}`,
        JIXIA_STORAGE_ROOT: storageRoot,
      });

      try {
        const aliceCookie = await loginAs(server.url, 'user-alice');
        const space = await fetch(`${server.url}/api/spaces`, {
          body: JSON.stringify({ kind: 'shared', name: 'AI Workspace residue space' }),
          headers: jsonHeaders(aliceCookie),
          method: 'POST',
        }).then((response) => expectJsonResponse<{ id: string }>(response));
        const project = await fetch(`${server.url}/api/projects`, {
          body: JSON.stringify({ name: 'AI Workspace residue project', spaceId: space.id }),
          headers: jsonHeaders(aliceCookie),
          method: 'POST',
        }).then((response) =>
          expectJsonResponse<{ project: { id: string } }>(response)
        );
        const session = await fetch(
          `${server.url}/api/ai-workspace/projects/${project.project.id}/sessions`,
          {
            body: JSON.stringify({ title: 'Residue session' }),
            headers: jsonHeaders(aliceCookie),
            method: 'POST',
          },
        ).then((response) => expectJsonResponse<{ id: string }>(response));
        const pack = await fetch(
          `${server.url}/api/ai-workspace/sessions/${session.id}/context-packs`,
          {
            body: JSON.stringify({ title: 'Residue pack' }),
            headers: jsonHeaders(aliceCookie),
            method: 'POST',
          },
        ).then((response) => expectJsonResponse<{ id: string }>(response));

        const rejectedResponses = await Promise.all([
          fetch(`${server.url}/api/ai-workspace/sessions?actorUserId=user-alice`, {
            headers: withSessionCookie(aliceCookie),
          }),
          fetch(
            `${server.url}/api/ai-workspace/projects/${project.project.id}/sessions?scopeId=${project.project.id}`,
            { headers: withSessionCookie(aliceCookie) },
          ),
          fetch(`${server.url}/api/ai-workspace/sessions`, {
            body: JSON.stringify({ actorUserId: 'user-alice', title: 'Spoofed session' }),
            headers: jsonHeaders(aliceCookie),
            method: 'POST',
          }),
          fetch(`${server.url}/api/ai-workspace/projects/${project.project.id}/sessions`, {
            body: JSON.stringify({ projectId: project.project.id, title: 'Spoofed project session' }),
            headers: jsonHeaders(aliceCookie),
            method: 'POST',
          }),
          fetch(`${server.url}/api/ai-workspace/sessions/${session.id}/context-packs?visibility=private`, {
            headers: withSessionCookie(aliceCookie),
          }),
          fetch(`${server.url}/api/ai-workspace/sessions/${session.id}/context-packs`, {
            body: JSON.stringify({ scope: { id: project.project.id, type: 'project' }, title: 'Spoofed pack' }),
            headers: jsonHeaders(aliceCookie),
            method: 'POST',
          }),
          fetch(`${server.url}/api/ai-workspace/context-packs/${pack.id}/items`, {
            body: JSON.stringify({
              source: {
                libraryEntryId: 'entry-1',
                projectId: project.project.id,
                sourceType: 'projectLibraryEntry',
              },
            }),
            headers: jsonHeaders(aliceCookie),
            method: 'POST',
          }),
          fetch(`${server.url}/api/ai-workspace/jobs`, {
            body: JSON.stringify({
              contextPackId: pack.id,
              credentialRef: 'cred-alice',
              payload: { rawContext: 'browser-authored context must not be accepted' },
            }),
            headers: jsonHeaders(aliceCookie),
            method: 'POST',
          }),
        ]);

        for (const response of rejectedResponses) {
          expect(response.status).toBe(400);
          await expect(response.json()).resolves.toEqual({
            error: expect.stringMatching(/not accepted|actor|scope|visibility|payload|projectId/i),
          });
        }
      } finally {
        await server.close();
      }
    } finally {
      rmSync(storageRoot, { force: true, recursive: true });
    }
  });
});
