import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { describe, expect, it } from 'vitest';

import {
  loginAs,
  startTestServer,
  withSessionCookie,
} from './http-session-test-helpers';

describe('http server project api', () => {
  it('creates and lists projects from the server-derived session cookie', async () => {
    const storageRoot = mkdtempSync(join(tmpdir(), 'jixia-http-projects-'));

    try {
      const server = await startTestServer({
        JIXIA_DATABASE_URL: `file:${join(storageRoot, 'jixia-http-projects.db')}`,
        JIXIA_STORAGE_ROOT: storageRoot,
      });

      try {
        const aliceCookie = await loginAs(server.url, 'user-alice');
        const bobCookie = await loginAs(server.url, 'user-bob');

        const createdSpace = await fetch(`${server.url}/api/spaces`, {
          body: JSON.stringify({ kind: 'shared', name: 'HTTP Projects' }),
          headers: withSessionCookie(aliceCookie, {
            'Content-Type': 'application/json',
          }),
          method: 'POST',
        }).then((response) => response.json() as Promise<{ id: string }>);

        const createdProject = await fetch(`${server.url}/api/projects`, {
          body: JSON.stringify({
            actorUserId: 'user-alice',
            name: 'HTTP Project-first Recovery',
            spaceId: createdSpace.id,
          }),
          headers: withSessionCookie(aliceCookie, {
            'Content-Type': 'application/json',
          }),
          method: 'POST',
        }).then(
          (response) =>
            response.json() as Promise<{
              membership: { role: string; userId: string };
              project: { id: string; name: string; spaceId: string };
            }>,
        );

        expect(createdProject.project.spaceId).toBe(createdSpace.id);
        expect(createdProject.membership).toMatchObject({
          role: 'owner',
          userId: 'user-alice',
        });

        const aliceProjects = await fetch(`${server.url}/api/projects`, {
          headers: withSessionCookie(aliceCookie),
        }).then(
          (response) =>
            response.json() as Promise<Array<{ project: { id: string } }>>,
        );
        expect(aliceProjects.map((item) => item.project.id)).toContain(
          createdProject.project.id,
        );

        const bobProjects = await fetch(`${server.url}/api/projects`, {
          headers: withSessionCookie(bobCookie),
        }).then(
          (response) =>
            response.json() as Promise<Array<{ project: { id: string } }>>,
        );
        expect(bobProjects).toEqual([]);

        const bobProjectResponse = await fetch(
          `${server.url}/api/projects/${createdProject.project.id}`,
          { headers: withSessionCookie(bobCookie) },
        );
        const bobProjectPayload = (await bobProjectResponse.json()) as { error: string };
        expect(bobProjectResponse.status).toBe(403);
        expect(bobProjectPayload.error).toMatch(/access denied/i);
      } finally {
        await server.close();
      }
    } finally {
      rmSync(storageRoot, { force: true, recursive: true });
    }
  });

  it('rejects body actor impersonation on project creation', async () => {
    const storageRoot = mkdtempSync(join(tmpdir(), 'jixia-http-projects-'));

    try {
      const server = await startTestServer({
        JIXIA_DATABASE_URL: `file:${join(storageRoot, 'jixia-http-projects.db')}`,
        JIXIA_STORAGE_ROOT: storageRoot,
      });

      try {
        const aliceCookie = await loginAs(server.url, 'user-alice');
        const bobCookie = await loginAs(server.url, 'user-bob');

        const createdSpace = await fetch(`${server.url}/api/spaces`, {
          body: JSON.stringify({ kind: 'shared', name: 'HTTP Impersonation' }),
          headers: withSessionCookie(aliceCookie, {
            'Content-Type': 'application/json',
          }),
          method: 'POST',
        }).then((response) => response.json() as Promise<{ id: string }>);

        const response = await fetch(`${server.url}/api/projects`, {
          body: JSON.stringify({
            actorUserId: 'user-alice',
            name: 'Spoofed Project',
            spaceId: createdSpace.id,
          }),
          headers: withSessionCookie(bobCookie, {
            'Content-Type': 'application/json',
          }),
          method: 'POST',
        });
        const payload = (await response.json()) as { error: string };

        expect(response.status).toBe(400);
        expect(payload.error).toMatch(/actor does not match/i);
      } finally {
        await server.close();
      }
    } finally {
      rmSync(storageRoot, { force: true, recursive: true });
    }
  });

  it('rejects query actor impersonation on project reads', async () => {
    const storageRoot = mkdtempSync(join(tmpdir(), 'jixia-http-projects-'));

    try {
      const server = await startTestServer({
        JIXIA_DATABASE_URL: `file:${join(storageRoot, 'jixia-http-projects.db')}`,
        JIXIA_STORAGE_ROOT: storageRoot,
      });

      try {
        const aliceCookie = await loginAs(server.url, 'user-alice');
        const bobCookie = await loginAs(server.url, 'user-bob');

        const createdSpace = await fetch(`${server.url}/api/spaces`, {
          body: JSON.stringify({ kind: 'shared', name: 'HTTP Query Mismatch' }),
          headers: withSessionCookie(aliceCookie, {
            'Content-Type': 'application/json',
          }),
          method: 'POST',
        }).then((response) => response.json() as Promise<{ id: string }>);

        const createdProject = await fetch(`${server.url}/api/projects`, {
          body: JSON.stringify({
            name: 'Query Mismatch Project',
            spaceId: createdSpace.id,
          }),
          headers: withSessionCookie(aliceCookie, {
            'Content-Type': 'application/json',
          }),
          method: 'POST',
        }).then(
          (response) => response.json() as Promise<{ project: { id: string } }>,
        );

        const [listResponse, readResponse, membersResponse] = await Promise.all([
          fetch(`${server.url}/api/projects?actorUserId=user-alice`, {
            headers: withSessionCookie(bobCookie),
          }),
          fetch(
            `${server.url}/api/projects/${createdProject.project.id}?actorUserId=user-alice`,
            { headers: withSessionCookie(bobCookie) },
          ),
          fetch(
            `${server.url}/api/projects/${createdProject.project.id}/members?actorUserId=user-alice`,
            { headers: withSessionCookie(bobCookie) },
          ),
        ]);

        for (const response of [listResponse, readResponse, membersResponse]) {
          const payload = (await response.json()) as { error: string };

          expect(response.status).toBe(400);
          expect(payload.error).toMatch(/actor does not match/i);
        }
      } finally {
        await server.close();
      }
    } finally {
      rmSync(storageRoot, { force: true, recursive: true });
    }
  });

  it('rejects missing project actors before trusting request payload identity', async () => {
    const storageRoot = mkdtempSync(join(tmpdir(), 'jixia-http-projects-'));

    try {
      const server = await startTestServer({
        JIXIA_DATABASE_URL: `file:${join(storageRoot, 'jixia-http-projects.db')}`,
        JIXIA_STORAGE_ROOT: storageRoot,
      });

      try {
        const response = await fetch(`${server.url}/api/projects`, {
          body: JSON.stringify({
            actorUserId: 'user-alice',
            name: 'Missing Actor Project',
            spaceId: 'space-unknown',
          }),
          headers: { 'Content-Type': 'application/json' },
          method: 'POST',
        });
        const payload = (await response.json()) as { error: string };

        expect(response.status).toBe(401);
        expect(payload.error).toMatch(/server-derived actor session/i);
      } finally {
        await server.close();
      }
    } finally {
      rmSync(storageRoot, { force: true, recursive: true });
    }
  });
});
