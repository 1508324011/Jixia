import { mkdtempSync, rmSync } from 'node:fs';
import { once } from 'node:events';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { describe, expect, it } from 'vitest';

import { createHttpServer } from '../../src/server/http-server';

async function startTestServer(storageRoot: string) {
  const httpServer = createHttpServer({
    env: {
      JIXIA_DATABASE_URL: `file:${join(storageRoot, 'jixia-http-writing-docs.db')}`,
      JIXIA_STORAGE_ROOT: storageRoot,
    },
  });

  httpServer.server.listen(0, '127.0.0.1');
  await once(httpServer.server, 'listening');
  const address = httpServer.server.address();

  if (!address || typeof address === 'string') {
    throw new Error('Failed to bind test server.');
  }

  return {
    close: async () => {
      httpServer.server.close();
      await once(httpServer.server, 'close');
    },
    url: `http://127.0.0.1:${address.port}`,
  };
}

async function createSpace(serverUrl: string, actorUserId: string) {
  return fetch(`${serverUrl}/api/spaces`, {
    body: JSON.stringify({ kind: 'shared', name: `${actorUserId} writing docs` }),
    headers: {
      'Content-Type': 'application/json',
      'x-jixia-actor': actorUserId,
    },
    method: 'POST',
  }).then((response) => response.json() as Promise<{ id: string }>);
}

describe('http server notebook and project-doc api', () => {
  it('enforces owner-only notebook access and actor-boundary checks', async () => {
    const storageRoot = mkdtempSync(join(tmpdir(), 'jixia-http-notebooks-'));

    try {
      const server = await startTestServer(storageRoot);

      try {
        const createResponse = await fetch(`${server.url}/api/notebooks`, {
          body: JSON.stringify({ ownerId: 'user-alice', title: 'HTTP Notebook' }),
          headers: {
            'Content-Type': 'application/json',
            'x-jixia-actor': 'user-alice',
          },
          method: 'POST',
        });
        const notebook = (await createResponse.json()) as { id: string };

        expect(createResponse.status).toBe(200);

        const ownerRead = await fetch(`${server.url}/api/notebooks/${notebook.id}`, {
          headers: { 'x-jixia-actor': 'user-alice' },
        });
        const nonOwnerRead = await fetch(`${server.url}/api/notebooks/${notebook.id}`, {
          headers: { 'x-jixia-actor': 'user-bob' },
        });
        const actorMismatch = await fetch(`${server.url}/api/notebooks`, {
          body: JSON.stringify({ ownerId: 'user-alice', title: 'Spoofed Notebook' }),
          headers: {
            'Content-Type': 'application/json',
            'x-jixia-actor': 'user-bob',
          },
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
      const server = await startTestServer(storageRoot);

      try {
        const sharedSpace = await createSpace(server.url, 'user-alice');
        const project = await fetch(`${server.url}/api/projects`, {
          body: JSON.stringify({ name: 'HTTP Project Docs', spaceId: sharedSpace.id }),
          headers: {
            'Content-Type': 'application/json',
            'x-jixia-actor': 'user-alice',
          },
          method: 'POST',
        }).then(
          (response) => response.json() as Promise<{ project: { id: string } }>,
        );
        await fetch(`${server.url}/api/projects/${project.project.id}/members`, {
          body: JSON.stringify({ role: 'viewer', userId: 'user-bob' }),
          headers: {
            'Content-Type': 'application/json',
            'x-jixia-actor': 'user-alice',
          },
          method: 'POST',
        });

        const createResponse = await fetch(`${server.url}/api/project-docs`, {
          body: JSON.stringify({ projectId: project.project.id, title: 'HTTP Project Draft' }),
          headers: {
            'Content-Type': 'application/json',
            'x-jixia-actor': 'user-alice',
          },
          method: 'POST',
        });
        const projectDoc = (await createResponse.json()) as { id: string };

        expect(createResponse.status).toBe(200);

        const memberRead = await fetch(
          `${server.url}/api/project-docs/${projectDoc.id}`,
          { headers: { 'x-jixia-actor': 'user-bob' } },
        );
        const nonMemberRead = await fetch(
          `${server.url}/api/project-docs/${projectDoc.id}`,
          { headers: { 'x-jixia-actor': 'user-charlie' } },
        );
        const spoofedCreate = await fetch(`${server.url}/api/project-docs`, {
          body: JSON.stringify({
            createdByUserId: 'user-alice',
            projectId: project.project.id,
            title: 'Spoofed Project Draft',
          }),
          headers: {
            'Content-Type': 'application/json',
            'x-jixia-actor': 'user-bob',
          },
          method: 'POST',
        });
        const viewerSave = await fetch(
          `${server.url}/api/project-docs/${projectDoc.id}/versions`,
          {
            body: JSON.stringify({ citations: [], content: 'Viewer cannot write' }),
            headers: {
              'Content-Type': 'application/json',
              'x-jixia-actor': 'user-bob',
            },
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
