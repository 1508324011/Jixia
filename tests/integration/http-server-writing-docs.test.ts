import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { describe, expect, it } from 'vitest';

import {
  loginAs,
  startTestServer,
  withSessionCookie,
} from './http-session-test-helpers';

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
          body: JSON.stringify({ ownerId: 'user-alice', title: 'HTTP Notebook' }),
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
          body: JSON.stringify({
            createdByUserId: 'user-alice',
            projectId: project.project.id,
            title: 'Spoofed Project Draft',
          }),
          headers: withSessionCookie(bobCookie, {
            'Content-Type': 'application/json',
          }),
          method: 'POST',
        });
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

        expect(memberRead.status).toBe(200);
        expect(nonMemberRead.status).toBe(403);
        expect(spoofedCreate.status).toBe(400);
        expect(viewerSave.status).toBe(403);
      } finally {
        await server.close();
      }
    } finally {
      rmSync(storageRoot, { force: true, recursive: true });
    }
  });
});
