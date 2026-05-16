import { Buffer } from 'node:buffer';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { describe, expect, it } from 'vitest';

import { createPrismaClient } from '../../src/db';
import {
  startTestServer,
  loginAs,
  withSessionCookie,
} from './http-session-test-helpers';

interface SpaceResponse {
  id: string;
}

interface ProjectListItemResponse {
  membership: {
    role: 'owner' | 'editor' | 'viewer';
    userId: string;
  };
  project: {
    id: string;
    name: string;
    spaceId: string;
  };
}

interface LibraryEntryViewResponse {
  asset: {
    canonicalId: string;
    createdAt: string;
    id: string;
    title: string;
  };
  entry: {
    id: string;
    paperAssetId: string;
    scope: { id: string; type: 'project' | 'user' };
    spaceId: string;
    visibility: string;
  };
}

interface NoteResponse {
  authorUserId: string;
  body: string;
  id: string;
  kind: 'private_note';
  libraryEntryId: string;
}

interface ProjectCommentResponse {
  authorUserId: string;
  body: string;
  id: string;
  kind: 'project_comment';
  libraryEntryId: string;
  projectId: string;
}

interface ReadingDetailResponse extends LibraryEntryViewResponse {
  insights: Array<{
    evidenceSpans: Array<{
      paperAssetId: string;
      quote: string;
    }>;
    id: string;
    libraryEntryId: string;
    summary: string;
  }>;
  notes: NoteResponse[];
  projectComments: ProjectCommentResponse[];
}

interface NotebookDocumentResponse {
  id: string;
  ownerId: string;
  title: string;
}

interface NotebookSnapshotResponse {
  content: string;
  document: NotebookDocumentResponse;
  versionNumber: number;
}

interface ProjectDocResponse {
  id: string;
  projectId: string;
  title: string;
}

interface ProjectDocSnapshotResponse {
  citations: Array<{
    evidenceSpan?: string;
    paperAssetId: string;
  }>;
  content: string;
  document: ProjectDocResponse;
  versionNumber: number;
}

interface CredentialResponse {
  credentialRef: string;
  provider: string;
  userId: string;
}

interface JobResponse {
  credentialRef: string;
  id: string;
  kind: string;
  status: 'queued' | 'running' | 'succeeded' | 'failed' | 'cancelled';
}

interface JobEventResponse {
  id: string;
  jobId: string;
  status: JobResponse['status'];
}

interface AuditResponse {
  action: string;
  actorUserId: string;
  detail: string;
  id: string;
  jobId?: string;
}

function createMinimalRecoveryEnv(storageRoot: string) {
  return {
    JIXIA_DATABASE_URL: `file:${join(storageRoot, 'jixia-minimal-recovery.db')}`,
    JIXIA_STORAGE_ROOT: storageRoot,
  };
}

async function expectJson<T>(response: Response): Promise<T> {
  const rawBody = await response.text();

  if (!response.ok) {
    throw new Error(
      `Expected ${response.url} to succeed, got ${response.status}: ${rawBody}`,
    );
  }

  return JSON.parse(rawBody) as T;
}

async function expectError(
  response: Response,
  status: number,
  message: RegExp,
): Promise<void> {
  expect(response.status).toBe(status);
  await expect(response.json()).resolves.toMatchObject({
    error: expect.stringMatching(message),
  });
}

function jsonHeaders(cookie: string): HeadersInit {
  return withSessionCookie(cookie, { 'Content-Type': 'application/json' });
}

function assertBrowserPayloadIsSafe(payload: unknown, forbiddenValues: string[]): void {
  const serialized = JSON.stringify(payload);

  for (const forbiddenValue of forbiddenValues) {
    expect(serialized).not.toContain(forbiddenValue);
  }
}

describe('minimal recovery loop server truth smoke', () => {
  it('walks the research loop through session-authenticated server APIs and persisted Prisma state', async () => {
    const storageRoot = mkdtempSync(join(tmpdir(), 'jixia-minimal-recovery-'));
    const env = createMinimalRecoveryEnv(storageRoot);
    const rawSecret = 'minimal-recovery-provider-secret';
    const forbiddenBrowserPayloadValues = [
      rawSecret,
      Buffer.from(rawSecret, 'utf8').toString('base64'),
      storageRoot,
      'papers/',
      'storageKey',
      'encryptedSecret',
    ];

    try {
      const firstServer = await startTestServer(env);
      let aliceCookie = '';
      let bobCookie = '';
      let charlieCookie = '';
      let space: SpaceResponse;
      let project: ProjectListItemResponse;
      let importedProjectEntry: LibraryEntryViewResponse;
      let notebook: NotebookDocumentResponse;
      let projectDoc: ProjectDocResponse;
      let credential: CredentialResponse;
      let job: JobResponse;

      try {
        aliceCookie = await loginAs(firstServer.url, 'user-alice');
        bobCookie = await loginAs(firstServer.url, 'user-bob');
        charlieCookie = await loginAs(firstServer.url, 'user-charlie');

        space = await expectJson<SpaceResponse>(
          await fetch(`${firstServer.url}/api/spaces`, {
            body: JSON.stringify({ kind: 'shared', name: 'Minimal Recovery Space' }),
            headers: jsonHeaders(aliceCookie),
            method: 'POST',
          }),
        );

        project = await expectJson<ProjectListItemResponse>(
          await fetch(`${firstServer.url}/api/projects`, {
            body: JSON.stringify({
              name: 'Minimal Recovery Project',
              spaceId: space.id,
            }),
            headers: jsonHeaders(aliceCookie),
            method: 'POST',
          }),
        );

        expect(project.project.spaceId).toBe(space.id);
        expect(project.membership).toMatchObject({
          role: 'owner',
          userId: 'user-alice',
        });

        await expectJson(
          await fetch(`${firstServer.url}/api/projects/${project.project.id}/members`, {
            body: JSON.stringify({ role: 'viewer', userId: 'user-bob' }),
            headers: jsonHeaders(aliceCookie),
            method: 'POST',
          }),
        );

        const bobProject = await expectJson<ProjectListItemResponse>(
          await fetch(`${firstServer.url}/api/projects/${project.project.id}`, {
            headers: withSessionCookie(bobCookie),
          }),
        );
        expect(bobProject.membership).toMatchObject({
          role: 'viewer',
          userId: 'user-bob',
        });

        await expectError(
          await fetch(`${firstServer.url}/api/projects/${project.project.id}`, {
            headers: withSessionCookie(charlieCookie),
          }),
          403,
          /access denied/i,
        );

        importedProjectEntry = await expectJson<LibraryEntryViewResponse>(
          await fetch(`${firstServer.url}/api/import/paper`, {
            body: JSON.stringify({
              scope: { id: project.project.id, type: 'project' },
              sourceLocator: '10.1000/minimal-recovery-loop',
              sourceType: 'doi',
              spaceId: space.id,
              visibility: 'published_to_project',
            }),
            headers: jsonHeaders(aliceCookie),
            method: 'POST',
          }),
        );

        expect(importedProjectEntry.entry).toMatchObject({
          scope: { id: project.project.id, type: 'project' },
          spaceId: space.id,
          visibility: 'published_to_project',
        });
        expect(importedProjectEntry.asset).not.toHaveProperty('storageKey');

        const bobLibraryEntry = await expectJson<LibraryEntryViewResponse>(
          await fetch(`${firstServer.url}/api/library/${importedProjectEntry.entry.id}`, {
            headers: withSessionCookie(bobCookie),
          }),
        );
        expect(bobLibraryEntry.entry.id).toBe(importedProjectEntry.entry.id);

        await expectError(
          await fetch(`${firstServer.url}/api/library/${importedProjectEntry.entry.id}`, {
            headers: withSessionCookie(charlieCookie),
          }),
          403,
          /access denied/i,
        );

        await expectJson<ReadingDetailResponse>(
          await fetch(`${firstServer.url}/api/reading/${importedProjectEntry.entry.id}`, {
            headers: withSessionCookie(aliceCookie),
          }),
        );

        const privateNote = await expectJson<NoteResponse>(
          await fetch(`${firstServer.url}/api/reading/notes`, {
            body: JSON.stringify({
              body: 'Alice private synthesis before project handoff.',
              libraryEntryId: importedProjectEntry.entry.id,
            }),
            headers: jsonHeaders(aliceCookie),
            method: 'POST',
          }),
        );
        const rejectedVisibilityComment = await fetch(`${firstServer.url}/api/reading/notes`, {
          body: JSON.stringify({
            body: 'Rejected visibility-switched evidence comment.',
            libraryEntryId: importedProjectEntry.entry.id,
            visibility: 'space_shared',
          }),
          headers: jsonHeaders(aliceCookie),
          method: 'POST',
        });
        await expectError(rejectedVisibilityComment, 400, /project-comments endpoint/i);
        const projectCommentResponse = await expectJson<{ comment: ProjectCommentResponse }>(
          await fetch(`${firstServer.url}/api/reading/${importedProjectEntry.entry.id}/project-comments`, {
            body: JSON.stringify({
              body: 'Project-visible evidence comment.',
              projectId: project.project.id,
            }),
            headers: jsonHeaders(aliceCookie),
            method: 'POST',
          }),
        );

        expect(privateNote).toMatchObject({
          authorUserId: 'user-alice',
          kind: 'private_note',
        });
        expect(projectCommentResponse.comment).toMatchObject({
          authorUserId: 'user-alice',
          kind: 'project_comment',
          projectId: project.project.id,
        });

        const insight = await expectJson<{
          evidenceSpans: Array<{ paperAssetId: string; quote: string }>;
          summary: string;
        }>(
          await fetch(`${firstServer.url}/api/reading/insights`, {
            body: JSON.stringify({
              evidenceSpans: [
                {
                  endOffset: 31,
                  quote: 'minimal recovery evidence quote',
                  startOffset: 0,
                },
              ],
              libraryEntryId: importedProjectEntry.entry.id,
              summary: 'The imported paper supports the minimal recovery loop.',
              title: 'Minimal recovery insight',
            }),
            headers: jsonHeaders(aliceCookie),
            method: 'POST',
          }),
        );
        expect(insight.evidenceSpans[0]?.paperAssetId).toBe(
          importedProjectEntry.asset.id,
        );

        const bobReading = await expectJson<ReadingDetailResponse>(
          await fetch(`${firstServer.url}/api/reading/${importedProjectEntry.entry.id}`, {
            headers: withSessionCookie(bobCookie),
          }),
        );
        expect(bobReading.projectComments.map((comment) => comment.body)).toContain(
          'Project-visible evidence comment.',
        );
        expect(bobReading.notes.map((note) => note.body)).not.toContain(
          'Alice private synthesis before project handoff.',
        );

        notebook = await expectJson<NotebookDocumentResponse>(
          await fetch(`${firstServer.url}/api/notebooks`, {
            body: JSON.stringify({ title: 'Alice private notebook' }),
            headers: jsonHeaders(aliceCookie),
            method: 'POST',
          }),
        );
        expect(notebook).toMatchObject({
          ownerId: 'user-alice',
          title: 'Alice private notebook',
        });

        const firstNotebookSnapshot = await expectJson<NotebookSnapshotResponse>(
          await fetch(`${firstServer.url}/api/notebooks/${notebook.id}/versions`, {
            body: JSON.stringify({
              citations: [
                {
                  evidenceSpan: 'private notebook evidence span',
                  paperAssetId: importedProjectEntry.entry.id,
                },
              ],
              content: 'Alice private notebook synthesis.',
            }),
            headers: jsonHeaders(aliceCookie),
            method: 'POST',
          }),
        );
        expect(firstNotebookSnapshot).toMatchObject({
          content: 'Alice private notebook synthesis.',
          versionNumber: 1,
        });

        await expectError(
          await fetch(`${firstServer.url}/api/notebooks/${notebook.id}`, {
            headers: withSessionCookie(bobCookie),
          }),
          403,
          /access denied/i,
        );
        await expectError(
          await fetch(`${firstServer.url}/api/project-docs/${notebook.id}`, {
            headers: withSessionCookie(bobCookie),
          }),
          400,
          /does not exist/i,
        );

        projectDoc = await expectJson<ProjectDocResponse>(
          await fetch(`${firstServer.url}/api/project-docs`, {
            body: JSON.stringify({
              projectId: project.project.id,
              title: 'Minimal recovery project document',
            }),
            headers: jsonHeaders(aliceCookie),
            method: 'POST',
          }),
        );

        const firstProjectDocSnapshot = await expectJson<ProjectDocSnapshotResponse>(
          await fetch(`${firstServer.url}/api/project-docs/${projectDoc.id}/versions`, {
            body: JSON.stringify({
              citations: [
                {
                  evidenceSpan: 'project evidence span',
                  paperAssetId: importedProjectEntry.entry.id,
                },
              ],
              content: 'Project-visible synthesis from Alice.',
            }),
            headers: jsonHeaders(aliceCookie),
            method: 'POST',
          }),
        );
        expect(firstProjectDocSnapshot).toMatchObject({
          content: 'Project-visible synthesis from Alice.',
          versionNumber: 1,
        });
        expect(firstProjectDocSnapshot.citations[0]?.paperAssetId).toBe(
          importedProjectEntry.asset.id,
        );

        const bobProjectDocSnapshot = await expectJson<ProjectDocSnapshotResponse>(
          await fetch(`${firstServer.url}/api/project-docs/${projectDoc.id}`, {
            headers: withSessionCookie(bobCookie),
          }),
        );
        expect(bobProjectDocSnapshot.content).toBe(
          'Project-visible synthesis from Alice.',
        );

        await expectError(
          await fetch(`${firstServer.url}/api/project-docs/${projectDoc.id}/versions`, {
            body: JSON.stringify({ citations: [], content: 'Viewer write attempt.' }),
            headers: jsonHeaders(bobCookie),
            method: 'POST',
          }),
          403,
          /mutation/i,
        );
        await expectError(
          await fetch(`${firstServer.url}/api/project-docs/${projectDoc.id}`, {
            headers: withSessionCookie(charlieCookie),
          }),
          403,
          /access denied/i,
        );

        credential = await expectJson<CredentialResponse>(
          await fetch(`${firstServer.url}/api/credentials`, {
            body: JSON.stringify({ provider: 'openai', rawSecret }),
            headers: jsonHeaders(aliceCookie),
            method: 'POST',
          }),
        );
        expect(credential).toMatchObject({
          provider: 'openai',
          userId: 'user-alice',
        });

        job = await expectJson<JobResponse>(
          await fetch(`${firstServer.url}/api/jobs`, {
            body: JSON.stringify({
              credentialRef: credential.credentialRef,
              kind: 'ai.summary',
              payload: {
                prompt: 'Summarize the minimal recovery project evidence.',
                projectId: project.project.id,
              },
              spaceId: space.id,
            }),
            headers: jsonHeaders(aliceCookie),
            method: 'POST',
          }),
        );
        expect(job).toMatchObject({
          credentialRef: credential.credentialRef,
          kind: 'ai.summary',
          status: 'queued',
        });
        expect(job).not.toHaveProperty('payload');

        const completedJob = await expectJson<JobResponse>(
          await fetch(`${firstServer.url}/api/jobs/${job.id}/run`, {
            body: JSON.stringify({}),
            headers: jsonHeaders(aliceCookie),
            method: 'POST',
          }),
        );
        expect(completedJob.status).toBe('succeeded');

        const events = await expectJson<JobEventResponse[]>(
          await fetch(`${firstServer.url}/api/jobs/${job.id}/events`, {
            headers: withSessionCookie(aliceCookie),
          }),
        );
        expect(events.map((event) => event.status)).toEqual([
          'queued',
          'running',
          'succeeded',
        ]);

        const audits = await expectJson<AuditResponse[]>(
          await fetch(`${firstServer.url}/api/jobs/${job.id}/audit`, {
            headers: withSessionCookie(aliceCookie),
          }),
        );
        expect(audits.map((audit) => audit.action)).toEqual([
          'job.created',
          'job.started',
          'job.completed',
        ]);

        for (const deniedUrl of [
          `${firstServer.url}/api/jobs/${job.id}`,
          `${firstServer.url}/api/jobs/${job.id}/events`,
          `${firstServer.url}/api/jobs/${job.id}/audit`,
        ]) {
          await expectError(
            await fetch(deniedUrl, { headers: withSessionCookie(charlieCookie) }),
            403,
            /access denied/i,
          );
        }
        await expectError(
          await fetch(`${firstServer.url}/api/jobs/${job.id}`, {
            headers: withSessionCookie(bobCookie),
          }),
          403,
          /access denied/i,
        );

        assertBrowserPayloadIsSafe(
          {
            audits,
            completedJob,
            credential,
            events,
            importedProjectEntry,
            job,
            projectDoc,
            firstProjectDocSnapshot,
          },
          forbiddenBrowserPayloadValues,
        );
      } finally {
        await firstServer.close();
      }

      const prisma = createPrismaClient({ url: env.JIXIA_DATABASE_URL });

      try {
        await expect(
          prisma.readingState.findUnique({
            where: {
              libraryEntryId_userId: {
                libraryEntryId: importedProjectEntry.entry.id,
                userId: 'user-alice',
              },
            },
          }),
        ).resolves.toMatchObject({
          libraryEntryId: importedProjectEntry.entry.id,
          userId: 'user-alice',
        });
        await expect(prisma.job.findUnique({ where: { id: job.id } })).resolves.toMatchObject({
          id: job.id,
          requestedByUserId: 'user-alice',
          status: 'succeeded',
        });
        await expect(prisma.jobEvent.findMany({ where: { jobId: job.id } })).resolves.toHaveLength(3);
        await expect(prisma.auditLog.findMany({ where: { jobId: job.id } })).resolves.toHaveLength(3);
      } finally {
        await prisma.$disconnect();
      }

      const statePath = join(storageRoot, 'server-state.json');
      const persistedStateText = existsSync(statePath)
        ? readFileSync(statePath, 'utf8')
        : '';

      expect(persistedStateText).not.toContain(job.id);
      expect(persistedStateText).not.toContain(rawSecret);
      expect(persistedStateText).not.toContain(
        Buffer.from(rawSecret, 'utf8').toString('base64'),
      );
      expect(persistedStateText).not.toContain('jobs');
      expect(persistedStateText).not.toContain('jobEvents');
      expect(persistedStateText).not.toContain('auditLogs');

      const restartedServer = await startTestServer(env);

      try {
        const restoredSession = await expectJson<{ user: { id: string } }>(
          await fetch(`${restartedServer.url}/api/session/me`, {
            headers: withSessionCookie(aliceCookie),
          }),
        );
        expect(restoredSession.user.id).toBe('user-alice');

        const restartedBobProject = await expectJson<ProjectListItemResponse>(
          await fetch(`${restartedServer.url}/api/projects/${project.project.id}`, {
            headers: withSessionCookie(bobCookie),
          }),
        );
        expect(restartedBobProject.project.id).toBe(project.project.id);

        const restartedBobLibraryEntry = await expectJson<LibraryEntryViewResponse>(
          await fetch(`${restartedServer.url}/api/library/${importedProjectEntry.entry.id}`, {
            headers: withSessionCookie(bobCookie),
          }),
        );
        expect(restartedBobLibraryEntry.asset.id).toBe(importedProjectEntry.asset.id);

        await expectError(
          await fetch(`${restartedServer.url}/api/library/${importedProjectEntry.entry.id}`, {
            headers: withSessionCookie(charlieCookie),
          }),
          403,
          /access denied/i,
        );

        const restartedAliceReading = await expectJson<ReadingDetailResponse>(
          await fetch(`${restartedServer.url}/api/reading/${importedProjectEntry.entry.id}`, {
            headers: withSessionCookie(aliceCookie),
          }),
        );
        expect(restartedAliceReading.notes.map((note) => note.body)).toContain(
          'Alice private synthesis before project handoff.',
        );
        expect(restartedAliceReading.projectComments.map((comment) => comment.body)).toContain(
          'Project-visible evidence comment.',
        );
        expect(restartedAliceReading.insights.map((item) => item.summary)).toContain(
          'The imported paper supports the minimal recovery loop.',
        );

        const restartedBobReading = await expectJson<ReadingDetailResponse>(
          await fetch(`${restartedServer.url}/api/reading/${importedProjectEntry.entry.id}`, {
            headers: withSessionCookie(bobCookie),
          }),
        );
        expect(restartedBobReading.projectComments.map((comment) => comment.body)).toContain(
          'Project-visible evidence comment.',
        );
        expect(restartedBobReading.notes.map((note) => note.body)).not.toContain(
          'Alice private synthesis before project handoff.',
        );

        const restartedNotebook = await expectJson<NotebookDocumentResponse>(
          await fetch(`${restartedServer.url}/api/notebooks/${notebook.id}`, {
            headers: withSessionCookie(aliceCookie),
          }),
        );
        expect(restartedNotebook.id).toBe(notebook.id);

        const secondNotebookSnapshot = await expectJson<NotebookSnapshotResponse>(
          await fetch(`${restartedServer.url}/api/notebooks/${notebook.id}/versions`, {
            body: JSON.stringify({
              citations: [{ paperAssetId: importedProjectEntry.entry.id }],
              content: 'Alice private notebook synthesis after restart.',
            }),
            headers: jsonHeaders(aliceCookie),
            method: 'POST',
          }),
        );
        expect(secondNotebookSnapshot.versionNumber).toBe(2);

        await expectError(
          await fetch(`${restartedServer.url}/api/notebooks/${notebook.id}`, {
            headers: withSessionCookie(bobCookie),
          }),
          403,
          /access denied/i,
        );

        const restartedProjectDoc = await expectJson<ProjectDocSnapshotResponse>(
          await fetch(`${restartedServer.url}/api/project-docs/${projectDoc.id}`, {
            headers: withSessionCookie(bobCookie),
          }),
        );
        expect(restartedProjectDoc).toMatchObject({
          content: 'Project-visible synthesis from Alice.',
          versionNumber: 1,
        });

        await expectError(
          await fetch(`${restartedServer.url}/api/project-docs/${projectDoc.id}`, {
            headers: withSessionCookie(charlieCookie),
          }),
          403,
          /access denied/i,
        );

        const restartedJob = await expectJson<JobResponse>(
          await fetch(`${restartedServer.url}/api/jobs/${job.id}`, {
            headers: withSessionCookie(aliceCookie),
          }),
        );
        expect(restartedJob).toMatchObject({
          id: job.id,
          status: 'succeeded',
        });

        const restartedEvents = await expectJson<JobEventResponse[]>(
          await fetch(`${restartedServer.url}/api/jobs/${job.id}/events`, {
            headers: withSessionCookie(aliceCookie),
          }),
        );
        const restartedAudits = await expectJson<AuditResponse[]>(
          await fetch(`${restartedServer.url}/api/jobs/${job.id}/audit`, {
            headers: withSessionCookie(aliceCookie),
          }),
        );

        expect(restartedEvents.map((event) => event.status)).toEqual([
          'queued',
          'running',
          'succeeded',
        ]);
        expect(restartedAudits.map((audit) => audit.action)).toEqual([
          'job.created',
          'job.started',
          'job.completed',
        ]);

        for (const deniedUrl of [
          `${restartedServer.url}/api/jobs/${job.id}`,
          `${restartedServer.url}/api/jobs/${job.id}/events`,
          `${restartedServer.url}/api/jobs/${job.id}/audit`,
        ]) {
          await expectError(
            await fetch(deniedUrl, { headers: withSessionCookie(charlieCookie) }),
            403,
            /access denied/i,
          );
        }
      } finally {
        await restartedServer.close();
      }
    } finally {
      rmSync(storageRoot, { force: true, recursive: true });
    }
  }, 60_000);
});
