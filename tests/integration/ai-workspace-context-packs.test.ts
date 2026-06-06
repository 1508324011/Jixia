import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  createJobRepository,
  createPrismaClient,
} from '../../src/db';
import { AI_WORKSPACE_JOB_KIND } from '../../src/shared/contracts/ai-workspace';
import { createJixiaApp } from '../../src/server/app';
import {
  loginAs,
  startTestServer,
  withSessionCookie,
} from './http-session-test-helpers';

describe('AI Workspace context packs', () => {
  it('launches governed project jobs from authorized context refs only', async () => {
    const storageRoot = mkdtempSync(join(tmpdir(), 'jixia-ai-workspace-'));
    const databaseUrl = `file:${join(storageRoot, 'jixia-ai-workspace.db')}`;
    const env = {
      JIXIA_DATABASE_URL: databaseUrl,
      JIXIA_STORAGE_ROOT: storageRoot,
    };
    const prisma = createPrismaClient({ url: databaseUrl });
    const jobRepository = createJobRepository(prisma);
    const app = createJixiaApp({ env });

    try {
      const space = await app.spaces.createSpace(
        { kind: 'shared', name: 'AI Workspace Project Space' },
        'user-alice',
      );
      const project = await app.projects.createProject(
        {
          name: 'AI Workspace Project',
          spaceId: space.id,
        },
        'user-alice',
      );
      await app.projects.addProjectMember(
        project.project.id,
        { role: 'editor', userId: 'user-bob' },
        'user-alice',
      );
      await app.projects.addProjectMember(
        project.project.id,
        { role: 'viewer', userId: 'user-charlie' },
        'user-alice',
      );
      const projectEntry = await app.imports.uploadPdf(
        {
          pdfContents: 'project paper bytes',
          scope: { id: project.project.id, type: 'project' },
          spaceId: space.id,
          visibility: 'published_to_project',
        },
        'user-alice',
      );
      const personalEntry = await app.imports.uploadPdf(
        {
          pdfContents: 'personal paper bytes',
          scope: { id: 'user-alice', type: 'user' },
          spaceId: space.id,
          visibility: 'private',
        },
        'user-alice',
      );
      const credential = await app.credentials.createCredential(
        {
          provider: 'openai',
          rawSecret: 'ai-workspace-secret-placeholder',
        },
        'user-alice',
      );

      const personalSession = await app.aiWorkspace.createSession(
        {
          scope: { id: 'user-alice', type: 'user' },
          title: 'Alice private AI session',
        },
        'user-alice',
      );
      await app.aiWorkspace.createContextPack(
        { sessionId: personalSession.id, title: 'Alice private pack' },
        'user-alice',
      );

      await expect(
        app.aiWorkspace.listSessions({ id: 'user-alice', type: 'user' }, 'user-bob'),
      ).rejects.toThrow(/personal AI Workspace session/i);
      await expect(
        app.aiWorkspace.listContextPacks(personalSession.id, 'user-bob'),
      ).rejects.toThrow(/personal AI Workspace session/i);

      const session = await app.aiWorkspace.createSession(
        {
          scope: { id: project.project.id, type: 'project' },
          title: 'Project synthesis session',
        },
        'user-alice',
      );
      const pack = await app.aiWorkspace.createContextPack(
        { sessionId: session.id, title: 'Project source pack' },
        'user-alice',
      );

      await expect(
        app.aiWorkspace.listSessions(
          { id: project.project.id, type: 'project' },
          'user-dana',
        ),
      ).rejects.toThrow(/access denied/i);

      await expect(
        app.aiWorkspace.createContextPack(
          { sessionId: session.id, title: 'Viewer mutation attempt' },
          'user-charlie',
        ),
      ).rejects.toThrow(/mutation/i);

      await expect(
        app.aiWorkspace.addContextItem(
          {
            contextPackId: pack.id,
            source: {
              libraryEntryId: personalEntry.entry.id,
              sourceType: 'projectLibraryEntry',
            },
          },
          'user-alice',
        ),
      ).rejects.toThrow(/must already be visible in project/i);

      const item = await app.aiWorkspace.addContextItem(
        {
          contextPackId: pack.id,
          source: {
            libraryEntryId: projectEntry.entry.id,
            sourceType: 'projectLibraryEntry',
          },
        },
        'user-alice',
      );
      const detail = await app.aiWorkspace.getContextPack(pack.id, 'user-alice');
      expect(item.source).toEqual({
        libraryEntryId: projectEntry.entry.id,
        sourceType: 'projectLibraryEntry',
      });
      expect(detail.items).toHaveLength(1);
      expect(detail.items[0]?.source).toEqual({
        libraryEntryId: projectEntry.entry.id,
        sourceType: 'projectLibraryEntry',
      });

      const bobProjectSessions = await app.aiWorkspace.listSessions(
        { id: project.project.id, type: 'project' },
        'user-bob',
      );
      const bobPackDetail = await app.aiWorkspace.getContextPack(pack.id, 'user-bob');
      const charliePackDetail = await app.aiWorkspace.getContextPack(
        pack.id,
        'user-charlie',
      );

      expect(bobProjectSessions.sessions.map((visibleSession) => visibleSession.id)).toContain(
        session.id,
      );
      expect(bobPackDetail.items[0]?.source).toEqual({
        libraryEntryId: projectEntry.entry.id,
        sourceType: 'projectLibraryEntry',
      });
      expect(charliePackDetail.pack.id).toBe(pack.id);

      const launched = await app.aiWorkspace.createJob(
        {
          contextPackId: pack.id,
          credentialRef: credential.credentialRef,
          instruction: 'Synthesize the selected source refs.',
        },
        'user-alice',
      );
      const persistedJob = await jobRepository.getJob({ jobId: launched.job.id });
      const payload = JSON.parse(persistedJob?.payload ?? '{}') as Record<string, unknown>;

      expect(launched.job.kind).toBe(AI_WORKSPACE_JOB_KIND);
      expect(launched.job.scope).toEqual({ id: project.project.id, type: 'project' });
      expect(launched.job.spaceId).toBe(space.id);
      expect(payload).toMatchObject({
        contextPackId: pack.id,
        contextRefs: [
          {
            libraryEntryId: projectEntry.entry.id,
            sourceType: 'projectLibraryEntry',
          },
        ],
        instruction: 'Synthesize the selected source refs.',
        session: {
          id: session.id,
          scope: { id: project.project.id, type: 'project' },
        },
      });
      expect(JSON.stringify({ launched, payload })).not.toMatch(
        /ai-workspace-secret-placeholder|rawSecret|apiKey|password|token|secret|storageKey|checksum|papers\/|JIXIA_STORAGE_ROOT|notebookDocumentVersion|rawContext/i,
      );

      await expect(
        app.aiWorkspace.createJob(
          {
            contextPackId: pack.id,
            credentialRef: credential.credentialRef,
            instruction: 'Viewer should not mutate.',
          },
          'user-charlie',
        ),
      ).rejects.toThrow(/mutation|job/i);

      await expect(
        app.aiWorkspace.listContextPacks(session.id, 'user-bob'),
      ).resolves.toMatchObject({ session: { id: session.id } });

      await expect(
        app.aiWorkspace.listContextPacks(session.id, 'user-dana'),
      ).rejects.toThrow(/access denied/i);
    } finally {
      await app.close();
      await prisma.$disconnect();
      rmSync(storageRoot, { force: true, recursive: true });
    }
  });

  it('rejects browser-supplied authority fields on protected HTTP routes', async () => {
    const storageRoot = mkdtempSync(join(tmpdir(), 'jixia-ai-workspace-http-'));
    const server = await startTestServer({
      JIXIA_DATABASE_URL: `file:${join(storageRoot, 'ai-workspace-http.db')}`,
      JIXIA_STORAGE_ROOT: storageRoot,
    });

    try {
      const aliceCookie = await loginAs(server.url, 'user-alice');
      const unauthorized = await fetch(`${server.url}/api/ai-workspace/sessions`);

      expect(unauthorized.status).toBe(401);

      for (const query of [
        'actorUserId=user-alice',
        'requestedByUserId=user-alice',
        'scopeType=user',
        'scopeId=user-alice',
        'projectId=project-alpha',
        'spaceId=space-alpha',
        'visibility=private',
      ]) {
        const response = await fetch(`${server.url}/api/ai-workspace/sessions?${query}`, {
          headers: withSessionCookie(aliceCookie),
        });

        expect(response.status).toBe(400);
      }

      for (const body of [
        { actorUserId: 'user-alice', title: 'Matching actor residue' },
        { scopeType: 'user', title: 'Client-selected scope type' },
        { scopeId: 'user-alice', title: 'Client-selected scope id' },
        { projectId: 'project-alpha', title: 'Client-selected project' },
        { spaceId: 'space-alpha', title: 'Client-selected space' },
        { visibility: 'private', title: 'Client-selected visibility' },
      ]) {
        const response = await fetch(`${server.url}/api/ai-workspace/sessions`, {
          body: JSON.stringify(body),
          headers: withSessionCookie(aliceCookie, {
            'Content-Type': 'application/json',
          }),
          method: 'POST',
        });

        expect(response.status).toBe(400);
      }

      const validResponse = await fetch(`${server.url}/api/ai-workspace/sessions`, {
        body: JSON.stringify({ title: 'HTTP actor-derived AI session' }),
        headers: withSessionCookie(aliceCookie, {
          'Content-Type': 'application/json',
        }),
        method: 'POST',
      });
      const validSession = (await validResponse.json()) as {
        id: string;
        scope: { id: string; type: string };
        title: string;
      };

      expect(validResponse.status).toBe(201);
      expect(validSession).toMatchObject({
        scope: { id: 'user-alice', type: 'user' },
        title: 'HTTP actor-derived AI session',
      });
      expect(JSON.stringify(validSession)).not.toMatch(
        /actorUserId|requestedByUserId|ownerId|createdByUserId|actorSpaceId|visibility|storageKey|checksum|rawContext/i,
      );
    } finally {
      await server.close();
      rmSync(storageRoot, { force: true, recursive: true });
    }
  });
});
