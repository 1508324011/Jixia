import { mkdtempSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { describe, expect, it } from 'vitest';

import type { HomeCockpitResponse } from '../../src/shared/contracts/home-cockpit';

import {
  loginAs,
  startTestServer,
  withSessionCookie,
} from './http-session-test-helpers';

describe('http server Home cockpit API', () => {
  it('builds the Home cockpit from server-visible actor state', async () => {
    const storageRoot = mkdtempSync(join(tmpdir(), 'jixia-http-home-cockpit-'));

    try {
      const server = await startTestServer({
        JIXIA_DATABASE_URL: `file:${join(storageRoot, 'jixia-http-home-cockpit.db')}`,
        JIXIA_STORAGE_ROOT: storageRoot,
      });

      try {
        const aliceCookie = await loginAs(server.url, 'user-alice');
        const bobCookie = await loginAs(server.url, 'user-bob');

        const createdSpace = await fetch(`${server.url}/api/spaces`, {
          body: JSON.stringify({ kind: 'shared', name: 'Home Cockpit Space' }),
          headers: withSessionCookie(aliceCookie, {
            'Content-Type': 'application/json',
          }),
          method: 'POST',
        }).then((response) => response.json() as Promise<{ id: string }>);

        const createdProject = await fetch(`${server.url}/api/projects`, {
          body: JSON.stringify({
            name: 'Home Cockpit Project',
            spaceId: createdSpace.id,
          }),
          headers: withSessionCookie(aliceCookie, {
            'Content-Type': 'application/json',
          }),
          method: 'POST',
        }).then(
          (response) =>
            response.json() as Promise<{
              project: { id: string; name: string; spaceId: string };
            }>,
        );

        const credential = await fetch(`${server.url}/api/credentials`, {
          body: JSON.stringify({
            provider: 'openai',
            rawSecret: 'home-cockpit-test-credential',
          }),
          headers: withSessionCookie(aliceCookie, {
            'Content-Type': 'application/json',
          }),
          method: 'POST',
        }).then(
          (response) => response.json() as Promise<{ credentialRef: string }>,
        );

        const reviewDocument = await fetch(`${server.url}/api/project-docs`, {
          body: JSON.stringify({
            projectId: createdProject.project.id,
            publishState: 'review',
            title: 'Home Cockpit Review Draft',
          }),
          headers: withSessionCookie(aliceCookie, {
            'Content-Type': 'application/json',
          }),
          method: 'POST',
        }).then(
          (response) => response.json() as Promise<{ id: string; title: string }>,
        );

        const projectJob = await fetch(`${server.url}/api/jobs`, {
          body: JSON.stringify({
            credentialRef: credential.credentialRef,
            kind: 'ai.summary',
            payload: { instruction: 'summarize project review status' },
            scope: { id: createdProject.project.id, type: 'project' },
            spaceId: createdProject.project.spaceId,
          }),
          headers: withSessionCookie(aliceCookie, {
            'Content-Type': 'application/json',
          }),
          method: 'POST',
        }).then(
          (response) => response.json() as Promise<{ id: string; status: string }>,
        );

        await fetch(`${server.url}/api/notebooks`, {
          body: JSON.stringify({ title: 'Home Cockpit Notebook' }),
          headers: withSessionCookie(aliceCookie, {
            'Content-Type': 'application/json',
          }),
          method: 'POST',
        });

        const cockpitResponse = await fetch(`${server.url}/api/home-cockpit`, {
          headers: withSessionCookie(aliceCookie),
        });
        const cockpit = (await cockpitResponse.json()) as HomeCockpitResponse;

        expect(cockpitResponse.status).toBe(200);
        expect(cockpit).toMatchObject({
          actor: {
            email: 'alice@example.test',
            id: 'user-alice',
          },
          contract: 'jixia-home-cockpit-contract',
          workbench: {
            route: '/home',
            scope: { id: 'user-alice', type: 'user' },
          },
        });
        expect(cockpit.sections.map((section) => section.id)).toEqual([
          'collaboration',
          'library',
          'writing',
          'jobs',
        ]);
        expect(
          cockpit.sections.find((section) => section.id === 'collaboration')?.metrics,
        ).toEqual(
          expect.arrayContaining([
            expect.objectContaining({ label: 'Visible projects', value: 1 }),
          ]),
        );
        expect(
          cockpit.sections.find((section) => section.id === 'writing')?.metrics,
        ).toEqual(
          expect.arrayContaining([
            expect.objectContaining({ label: 'Private notebooks', value: 1 }),
          ]),
        );
        expect(cockpit.recentActivity).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              href: `/projects/${createdProject.project.id}`,
              kind: 'project',
              title: 'Home Cockpit Project',
            }),
            expect.objectContaining({
              href: '/notebook',
              kind: 'notebook',
              title: 'Home Cockpit Notebook',
            }),
          ]),
        );
        expect(cockpit.projectReview.summary).toEqual(
          expect.objectContaining({
            documentsInReview: 1,
            jobsNeedingAttention: 1,
            projectsWithReviewItems: 1,
            totalReviewItems: 2,
            visibleProjects: 1,
          }),
        );
        expect(cockpit.projectReview.items).toEqual(
          expect.arrayContaining([
            expect.objectContaining({
              kind: 'job-attention',
              priority: 'monitor',
              projectId: createdProject.project.id,
              sourceId: projectJob.id,
            }),
            expect.objectContaining({
              kind: 'project-doc-review',
              priority: 'review',
              projectId: createdProject.project.id,
              sourceId: reviewDocument.id,
              title: 'Home Cockpit Review Draft',
            }),
          ]),
        );
        expect(cockpit.projectReview.items[0]).not.toHaveProperty('credentialRef');
        expect(cockpit.projectReview.items[0]).not.toHaveProperty('payload');
        expect(cockpit.projectReview.items[0]).not.toHaveProperty('actorUserId');
        expect(cockpit.notices.map((notice) => notice.id)).toContain(
          'server-owned-read-model',
        );

        const bobCockpitResponse = await fetch(`${server.url}/api/home-cockpit`, {
          headers: withSessionCookie(bobCookie),
        });
        const bobCockpit = (await bobCockpitResponse.json()) as HomeCockpitResponse;

        expect(bobCockpitResponse.status).toBe(200);
        expect(bobCockpit.actor.id).toBe('user-bob');
        expect(
          bobCockpit.sections.find((section) => section.id === 'collaboration')?.metrics,
        ).toEqual(
          expect.arrayContaining([
            expect.objectContaining({ label: 'Visible projects', value: 0 }),
          ]),
        );
        expect(bobCockpit.recentActivity).not.toEqual(
          expect.arrayContaining([
            expect.objectContaining({ title: 'Home Cockpit Project' }),
          ]),
        );
        expect(bobCockpit.projectReview.summary.totalReviewItems).toBe(0);
        expect(bobCockpit.projectReview.items).not.toEqual(
          expect.arrayContaining([
            expect.objectContaining({ projectId: createdProject.project.id }),
          ]),
        );
      } finally {
        await server.close();
      }
    } finally {
      rmSync(storageRoot, { force: true, recursive: true });
    }
  });

  it('rejects missing sessions and legacy identity query fields on Home cockpit reads', async () => {
    const storageRoot = mkdtempSync(join(tmpdir(), 'jixia-http-home-cockpit-'));

    try {
      const server = await startTestServer({
        JIXIA_DATABASE_URL: `file:${join(storageRoot, 'jixia-http-home-cockpit.db')}`,
        JIXIA_STORAGE_ROOT: storageRoot,
      });

      try {
        const aliceCookie = await loginAs(server.url, 'user-alice');

        const missingSessionResponse = await fetch(
          `${server.url}/api/home-cockpit?actorUserId=user-alice`,
        );
        const missingSessionPayload = (await missingSessionResponse.json()) as { error: string };

        expect(missingSessionResponse.status).toBe(401);
        expect(missingSessionPayload.error).toMatch(/server-derived actor session/i);

        const matchingLegacyResponse = await fetch(
          `${server.url}/api/home-cockpit?actorUserId=user-alice`,
          { headers: withSessionCookie(aliceCookie) },
        );
        const matchingLegacyPayload = (await matchingLegacyResponse.json()) as { error: string };

        expect(matchingLegacyResponse.status).toBe(400);
        expect(matchingLegacyPayload.error).toMatch(/not accepted for protected routes/i);

        const contextLegacyResponse = await fetch(
          `${server.url}/api/home-cockpit?actorSpaceId=space-alpha`,
          { headers: withSessionCookie(aliceCookie) },
        );
        const contextLegacyPayload = (await contextLegacyResponse.json()) as { error: string };

        expect(contextLegacyResponse.status).toBe(400);
        expect(contextLegacyPayload.error).toMatch(/actorSpaceId is not accepted/i);
      } finally {
        await server.close();
      }
    } finally {
      rmSync(storageRoot, { force: true, recursive: true });
    }
  });
});
