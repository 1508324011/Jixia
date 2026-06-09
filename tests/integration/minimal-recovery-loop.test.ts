import { Buffer } from 'node:buffer';
import { createHash } from 'node:crypto';
import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';

import { describe, expect, it } from 'vitest';

import { createPrismaClient } from '../../src/db';
import type { PubmedConnector } from '../../src/server/connectors/pubmed.connector';
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
    hasFile?: boolean;
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

interface ReaderExcerptResponse {
  createdByUserId: string;
  endOffset: number;
  id: string;
  libraryEntryId: string;
  locator?: string;
  note?: string;
  paperAssetId: string;
  quote: string;
  startOffset: number;
}

interface ReadingDetailResponse extends LibraryEntryViewResponse {
  excerpts?: ReaderExcerptResponse[];
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

interface AdoptProjectLibraryEntryResponse {
  entry: LibraryEntryViewResponse;
  reused: boolean;
}

interface NotebookDocumentResponse {
  id: string;
  ownerId: string;
  title: string;
}

interface NotebookSnapshotResponse {
  citations?: Array<{
    evidenceSpan?: string;
    paperAssetId: string;
    readerExcerptId?: string;
  }>;
  content: string;
  document: NotebookDocumentResponse;
  versionNumber: number;
}

interface NotebookCaptureResponse {
  document: NotebookDocumentResponse;
  snapshot: NotebookSnapshotResponse;
}

interface ProjectDocResponse {
  id: string;
  projectId: string;
  title: string;
}

interface ProjectDocSnapshotResponse {
  citations: Array<{
    evidenceSpan?: string;
    libraryEntryId?: string;
    paperAssetId: string;
    readerExcerptId?: string;
  }>;
  content: string;
  document: ProjectDocResponse;
  versionNumber: number;
}

interface ProjectDocCitationTraceResponse {
  citations: Array<{
    citationId: string;
    evidenceSpan?: string;
    paper?: {
      canonicalId: string;
      hasFile?: boolean;
      id: string;
      title: string;
    };
    paperAssetId: string;
    projectLibraryEntry?: {
      libraryEntryId: string;
      projectId: string;
    };
    readerExcerpt?: {
      evidenceSpan?: string;
      id: string;
      locator?: string;
      quote?: string;
      source: string;
      sourceLibraryEntryId?: string;
    };
    readerExcerptId?: string;
    source: { state: string };
  }>;
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
  scope?: { id: string; type: 'project' | 'user' };
  scopeId?: string;
  scopeType?: 'project' | 'user';
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

interface ProjectAuditResponse {
  action: string;
  actorUserId: string;
  detail: string;
  id: string;
  metadata?: Record<string, unknown>;
  jobId?: string;
  object?: { id: string; type: string };
  projectId?: string;
  recordedAt?: string;
  scope?: { id: string; type: 'project' | 'user' };
  spaceId?: string;
}

function createMinimalRecoveryEnv(storageRoot: string) {
  return {
    JIXIA_DATABASE_URL: `file:${join(storageRoot, 'jixia-minimal-recovery.db')}`,
    JIXIA_STORAGE_ROOT: storageRoot,
  };
}

function createMinimalRecoveryPubmedConnector(): PubmedConnector {
  return {
    async lookup(locator, sourceType) {
      return {
        abstractText: `Minimal recovery fixture abstract for ${locator}.`,
        canonicalId: `${sourceType}:${locator}`,
        title: `Minimal recovery fixture ${locator}`,
      };
    },
    async search() {
      return [];
    },
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

function sha256(contents: string): string {
  return createHash('sha256').update(Buffer.from(contents, 'utf8')).digest('hex');
}

function assertBrowserPayloadIsSafe(payload: unknown, forbiddenValues: string[]): void {
  const serialized = JSON.stringify(payload);

  for (const forbiddenValue of forbiddenValues) {
    expect(serialized).not.toContain(forbiddenValue);
  }
}

function assertResponseHeadersAreSafe(
  response: Response,
  forbiddenValues: string[],
): void {
  assertBrowserPayloadIsSafe([...response.headers.entries()], forbiddenValues);
}

async function expectPdfFile(
  response: Response,
  expectedContents: string,
): Promise<void> {
  expect(response.status).toBe(200);
  expect(response.headers.get('content-type')).toBe('application/pdf');
  expect(response.headers.get('content-length')).toBe(
    String(Buffer.byteLength(expectedContents)),
  );
  expect(response.headers.get('content-disposition')).toMatch(
    /^attachment; filename=".+"$/,
  );
  expect(
    Buffer.from(await response.arrayBuffer()).equals(
      Buffer.from(expectedContents, 'utf8'),
    ),
  ).toBe(true);
}

describe('minimal recovery loop server truth smoke', () => {
  it('walks the research loop through session-authenticated server APIs and persisted Prisma state', async () => {
    const storageRoot = mkdtempSync(join(tmpdir(), 'jixia-minimal-recovery-'));
    const env = createMinimalRecoveryEnv(storageRoot);
    const rawSecret = 'minimal-recovery-provider-secret';
    const pdfContents = '%PDF-1.4 minimal recovery project adoption fixture';
    const pdfChecksum = sha256(pdfContents);
    const privateReaderNoteText = 'Alice private synthesis before project handoff.';
    const privateNotebookText = 'Alice private notebook synthesis.';
    const privateNotebookCaptureNote =
      'Private Notebook-only interpretation from the Reader excerpt.';
    const secondPrivateNotebookText = 'Alice private notebook synthesis after restart.';
    const rawJobPrompt = 'Summarize the minimal recovery project evidence.';
    const forbiddenBrowserPayloadValues = [
      rawSecret,
      Buffer.from(rawSecret, 'utf8').toString('base64'),
      rawJobPrompt,
      storageRoot,
      'papers/',
      'storageKey',
      'checksum',
      pdfChecksum,
      'encryptedSecret',
      privateReaderNoteText,
      privateNotebookText,
      privateNotebookCaptureNote,
      secondPrivateNotebookText,
    ];

    try {
      const testConnectors = {
        pubmed: createMinimalRecoveryPubmedConnector(),
      };
      const firstServer = await startTestServer(env, { connectors: testConnectors });
      let aliceCookie = '';
      let bobCookie = '';
      let charlieCookie = '';
      let space: SpaceResponse;
      let project: ProjectListItemResponse;
      let personalLibraryEntry: LibraryEntryViewResponse;
      let projectLibraryEntry: LibraryEntryViewResponse;
      let readerExcerpt: ReaderExcerptResponse;
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

        await expectError(
          await fetch(`${firstServer.url}/api/import/pdf`, {
            body: JSON.stringify({
              pdfContents,
              requestedByUserId: 'user-alice',
              scope: { id: 'user-alice', type: 'user' },
              spaceId: space.id,
              visibility: 'private',
            }),
            headers: jsonHeaders(aliceCookie),
            method: 'POST',
          }),
          400,
          /not accepted/i,
        );

        personalLibraryEntry = await expectJson<LibraryEntryViewResponse>(
          await fetch(`${firstServer.url}/api/import/pdf`, {
            body: JSON.stringify({
              pdfContents,
              scope: { id: 'user-alice', type: 'user' },
              spaceId: space.id,
              visibility: 'private',
            }),
            headers: jsonHeaders(aliceCookie),
            method: 'POST',
          }),
        );

        expect(personalLibraryEntry.entry).toMatchObject({
          scope: { id: 'user-alice', type: 'user' },
          spaceId: '',
          visibility: 'private',
        });
        expect(personalLibraryEntry.entry.paperAssetId).toBe(personalLibraryEntry.asset.id);
        expect(personalLibraryEntry.asset.hasFile).toBe(true);
        expect(personalLibraryEntry.asset).not.toHaveProperty('storageKey');
        expect(personalLibraryEntry.asset).not.toHaveProperty('checksum');
        assertBrowserPayloadIsSafe(personalLibraryEntry, forbiddenBrowserPayloadValues);

        const storedPdfPath = join(
          storageRoot,
          'papers',
          personalLibraryEntry.asset.id,
          'paper.pdf',
        );
        expect(existsSync(storedPdfPath)).toBe(true);
        expect(readFileSync(storedPdfPath, 'utf8')).toBe(pdfContents);

        await expectPdfFile(
          await fetch(`${firstServer.url}/api/library/${personalLibraryEntry.entry.id}/file`, {
            headers: withSessionCookie(aliceCookie),
          }),
          pdfContents,
        );

        await expectError(
          await fetch(`${firstServer.url}/api/library/${personalLibraryEntry.entry.id}`, {
            headers: withSessionCookie(bobCookie),
          }),
          403,
          /access denied/i,
        );
        await expectError(
          await fetch(`${firstServer.url}/api/library/${personalLibraryEntry.entry.id}`, {
            headers: withSessionCookie(charlieCookie),
          }),
          403,
          /access denied/i,
        );
        await expectError(
          await fetch(`${firstServer.url}/api/library/${personalLibraryEntry.entry.id}/file`, {
            headers: withSessionCookie(bobCookie),
          }),
          403,
          /access denied/i,
        );

        await expectError(
          await fetch(`${firstServer.url}/api/projects/${project.project.id}/library/adoptions`, {
            body: JSON.stringify({
              actorUserId: 'user-alice',
              sourceLibraryEntryId: personalLibraryEntry.entry.id,
            }),
            headers: jsonHeaders(aliceCookie),
            method: 'POST',
          }),
          400,
          /not accepted/i,
        );

        const projectAdoption = await expectJson<AdoptProjectLibraryEntryResponse>(
          await fetch(`${firstServer.url}/api/projects/${project.project.id}/library/adoptions`, {
            body: JSON.stringify({ sourceLibraryEntryId: personalLibraryEntry.entry.id }),
            headers: jsonHeaders(aliceCookie),
            method: 'POST',
          }),
        );
        expect(projectAdoption.reused).toBe(false);
        projectLibraryEntry = projectAdoption.entry;

        expect(projectLibraryEntry.entry).toMatchObject({
          scope: { id: project.project.id, type: 'project' },
          spaceId: space.id,
          visibility: 'published_to_project',
        });
        expect(projectLibraryEntry.entry.id).not.toBe(personalLibraryEntry.entry.id);
        expect(projectLibraryEntry.asset.id).toBe(personalLibraryEntry.asset.id);
        expect(projectLibraryEntry.entry.paperAssetId).toBe(personalLibraryEntry.entry.paperAssetId);
        expect(projectLibraryEntry.asset.hasFile).toBe(true);
        expect(projectLibraryEntry.asset).not.toHaveProperty('storageKey');
        expect(projectLibraryEntry.asset).not.toHaveProperty('checksum');

        const repeatedProjectAdoption = await expectJson<AdoptProjectLibraryEntryResponse>(
          await fetch(`${firstServer.url}/api/projects/${project.project.id}/library/adoptions`, {
            body: JSON.stringify({ sourceLibraryEntryId: personalLibraryEntry.entry.id }),
            headers: jsonHeaders(aliceCookie),
            method: 'POST',
          }),
        );
        expect(repeatedProjectAdoption).toMatchObject({
          reused: true,
          entry: { entry: { id: projectLibraryEntry.entry.id } },
        });
        assertBrowserPayloadIsSafe(projectAdoption, forbiddenBrowserPayloadValues);

        const bobLibraryEntry = await expectJson<LibraryEntryViewResponse>(
          await fetch(`${firstServer.url}/api/library/${projectLibraryEntry.entry.id}`, {
            headers: withSessionCookie(bobCookie),
          }),
        );
        expect(bobLibraryEntry.entry.id).toBe(projectLibraryEntry.entry.id);
        expect(bobLibraryEntry.entry.scope).toEqual({
          id: project.project.id,
          type: 'project',
        });

        await expectPdfFile(
          await fetch(`${firstServer.url}/api/library/${projectLibraryEntry.entry.id}/file`, {
            headers: withSessionCookie(aliceCookie),
          }),
          pdfContents,
        );
        const bobProjectFileResponse = await fetch(
          `${firstServer.url}/api/library/${projectLibraryEntry.entry.id}/file`,
          { headers: withSessionCookie(bobCookie) },
        );
        assertResponseHeadersAreSafe(bobProjectFileResponse, forbiddenBrowserPayloadValues);
        await expectPdfFile(bobProjectFileResponse, pdfContents);
        const bobProjectFileHeadResponse = await fetch(
          `${firstServer.url}/api/library/${projectLibraryEntry.entry.id}/file`,
          { headers: withSessionCookie(bobCookie), method: 'HEAD' },
        );
        expect(bobProjectFileHeadResponse.status).toBe(200);
        expect(bobProjectFileHeadResponse.headers.get('content-type')).toBe('application/pdf');
        expect(bobProjectFileHeadResponse.headers.get('content-length')).toBe(
          String(Buffer.byteLength(pdfContents)),
        );
        assertResponseHeadersAreSafe(bobProjectFileHeadResponse, forbiddenBrowserPayloadValues);
        expect((await bobProjectFileHeadResponse.arrayBuffer()).byteLength).toBe(0);

        await expectError(
          await fetch(`${firstServer.url}/api/library/${projectLibraryEntry.entry.id}`, {
            headers: withSessionCookie(charlieCookie),
          }),
          403,
          /access denied/i,
        );
        await expectError(
          await fetch(`${firstServer.url}/api/library/${projectLibraryEntry.entry.id}/file`, {
            headers: withSessionCookie(charlieCookie),
          }),
          403,
          /access denied/i,
        );

        await expectJson<ReadingDetailResponse>(
          await fetch(`${firstServer.url}/api/reading/${projectLibraryEntry.entry.id}`, {
            headers: withSessionCookie(aliceCookie),
          }),
        );

        const privateNote = await expectJson<NoteResponse>(
          await fetch(`${firstServer.url}/api/reading/notes`, {
            body: JSON.stringify({
              body: privateReaderNoteText,
              libraryEntryId: projectLibraryEntry.entry.id,
            }),
            headers: jsonHeaders(aliceCookie),
            method: 'POST',
          }),
        );
        const rejectedVisibilityComment = await fetch(`${firstServer.url}/api/reading/notes`, {
          body: JSON.stringify({
            body: 'Rejected visibility-switched evidence comment.',
            libraryEntryId: projectLibraryEntry.entry.id,
            visibility: 'space_shared',
          }),
          headers: jsonHeaders(aliceCookie),
          method: 'POST',
        });
        await expectError(rejectedVisibilityComment, 400, /not accepted for protected routes/i);
        const projectCommentResponse = await expectJson<{ comment: ProjectCommentResponse }>(
          await fetch(`${firstServer.url}/api/reading/${projectLibraryEntry.entry.id}/project-comments`, {
            body: JSON.stringify({
              body: 'Project-visible evidence comment.',
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
              libraryEntryId: projectLibraryEntry.entry.id,
              summary: 'The imported paper supports the minimal recovery loop.',
              title: 'Minimal recovery insight',
            }),
            headers: jsonHeaders(aliceCookie),
            method: 'POST',
          }),
        );
        expect(insight.evidenceSpans[0]?.paperAssetId).toBe(
          projectLibraryEntry.asset.id,
        );

        const readerExcerptResponse = await expectJson<{ excerpt: ReaderExcerptResponse }>(
          await fetch(`${firstServer.url}/api/reading/${projectLibraryEntry.entry.id}/excerpts`, {
            body: JSON.stringify({
              endOffset: 31,
              locator: 'page 1',
              note: 'Project-visible excerpt locator note.',
              quote: 'minimal recovery durable excerpt',
              startOffset: 0,
            }),
            headers: jsonHeaders(aliceCookie),
            method: 'POST',
          }),
        );
        readerExcerpt = readerExcerptResponse.excerpt;
        expect(readerExcerpt).toMatchObject({
          createdByUserId: 'user-alice',
          libraryEntryId: projectLibraryEntry.entry.id,
          paperAssetId: projectLibraryEntry.asset.id,
          quote: 'minimal recovery durable excerpt',
        });

        await expectError(
          await fetch(`${firstServer.url}/api/reading/${projectLibraryEntry.entry.id}/excerpts`, {
            body: JSON.stringify({
              createdByUserId: 'user-alice',
              endOffset: 9,
              quote: 'rejected',
              startOffset: 0,
            }),
            headers: jsonHeaders(aliceCookie),
            method: 'POST',
          }),
          400,
          /not accepted/i,
        );

        const bobReading = await expectJson<ReadingDetailResponse>(
          await fetch(`${firstServer.url}/api/reading/${projectLibraryEntry.entry.id}`, {
            headers: withSessionCookie(bobCookie),
          }),
        );
        expect(bobReading.projectComments.map((comment) => comment.body)).toContain(
          'Project-visible evidence comment.',
        );
        expect(bobReading.notes.map((note) => note.body)).not.toContain(privateReaderNoteText);
        expect(bobReading.excerpts?.map((excerpt) => excerpt.quote)).toContain(
          'minimal recovery durable excerpt',
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
                  paperAssetId: projectLibraryEntry.entry.id,
                },
              ],
              content: privateNotebookText,
            }),
            headers: jsonHeaders(aliceCookie),
            method: 'POST',
          }),
        );
        expect(firstNotebookSnapshot).toMatchObject({
          content: privateNotebookText,
          versionNumber: 1,
        });

        const capturedNotebookEvidence = await expectJson<NotebookCaptureResponse>(
          await fetch(`${firstServer.url}/api/notebooks/capture`, {
            body: JSON.stringify({
              notebookDocumentId: notebook.id,
              source: {
                libraryEntryId: projectLibraryEntry.entry.id,
                note: privateNotebookCaptureNote,
                readerExcerptId: readerExcerpt.id,
                type: 'readerExcerpt',
              },
            }),
            headers: jsonHeaders(aliceCookie),
            method: 'POST',
          }),
        );
        expect(capturedNotebookEvidence.document.id).toBe(notebook.id);
        expect(capturedNotebookEvidence.snapshot.versionNumber).toBe(2);
        expect(capturedNotebookEvidence.snapshot.content).toContain(
          'minimal recovery durable excerpt',
        );
        expect(capturedNotebookEvidence.snapshot.citations?.[0]).toMatchObject({
          paperAssetId: projectLibraryEntry.asset.id,
          readerExcerptId: readerExcerpt.id,
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
                  libraryEntryId: projectLibraryEntry.entry.id,
                  paperAssetId: projectLibraryEntry.asset.id,
                  readerExcerptId: readerExcerpt.id,
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
          projectLibraryEntry.asset.id,
        );
        expect(firstProjectDocSnapshot.citations[0]?.readerExcerptId).toBe(readerExcerpt.id);

        const bobProjectDocSnapshot = await expectJson<ProjectDocSnapshotResponse>(
          await fetch(`${firstServer.url}/api/project-docs/${projectDoc.id}`, {
            headers: withSessionCookie(bobCookie),
          }),
        );
        expect(bobProjectDocSnapshot.content).toBe(
          'Project-visible synthesis from Alice.',
        );
        assertBrowserPayloadIsSafe(bobProjectDocSnapshot, forbiddenBrowserPayloadValues);

        const bobCitationTrace = await expectJson<ProjectDocCitationTraceResponse>(
          await fetch(`${firstServer.url}/api/project-docs/${projectDoc.id}/citation-trace`, {
            headers: withSessionCookie(bobCookie),
          }),
        );
        expect(bobCitationTrace.document.id).toBe(projectDoc.id);
        expect(bobCitationTrace.versionNumber).toBe(1);
        expect(bobCitationTrace.citations[0]).toMatchObject({
          paperAssetId: projectLibraryEntry.asset.id,
          projectLibraryEntry: {
            libraryEntryId: projectLibraryEntry.entry.id,
            projectId: project.project.id,
          },
          readerExcerptId: readerExcerpt.id,
          source: { state: 'available' },
        });
        expect(bobCitationTrace.citations[0]?.paper?.hasFile).toBe(true);
        expect(bobCitationTrace.citations[0]?.readerExcerpt?.quote).toBe(
          'minimal recovery durable excerpt',
        );
        assertBrowserPayloadIsSafe(bobCitationTrace, forbiddenBrowserPayloadValues);

        await expectError(
          await fetch(
            `${firstServer.url}/api/project-docs/${projectDoc.id}/citation-trace?actorUserId=user-alice`,
            { headers: withSessionCookie(aliceCookie) },
          ),
          400,
          /not accepted/i,
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
        await expectError(
          await fetch(`${firstServer.url}/api/project-docs/${projectDoc.id}/citation-trace`, {
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
                prompt: rawJobPrompt,
                projectId: project.project.id,
              },
              scope: { id: project.project.id, type: 'project' },
              spaceId: space.id,
            }),
            headers: jsonHeaders(aliceCookie),
            method: 'POST',
          }),
        );
        expect(job).toMatchObject({
          credentialRef: credential.credentialRef,
          kind: 'ai.summary',
          scope: { id: project.project.id, type: 'project' },
          scopeId: project.project.id,
          scopeType: 'project',
          status: 'queued',
        });
        expect(job).not.toHaveProperty('payload');

        const bobVisibleJobs = await expectJson<JobResponse[]>(
          await fetch(
            `${firstServer.url}/api/jobs?scopeType=project&scopeId=${encodeURIComponent(project.project.id)}&spaceId=${encodeURIComponent(space.id)}`,
            { headers: withSessionCookie(bobCookie) },
          ),
        );
        expect(bobVisibleJobs.map((visibleJob) => visibleJob.id)).toContain(job.id);
        assertBrowserPayloadIsSafe(bobVisibleJobs, forbiddenBrowserPayloadValues);

        const bobVisibleJob = await expectJson<JobResponse>(
          await fetch(`${firstServer.url}/api/jobs/${job.id}`, {
            headers: withSessionCookie(bobCookie),
          }),
        );
        expect(bobVisibleJob).toMatchObject({
          id: job.id,
          scope: { id: project.project.id, type: 'project' },
          status: 'queued',
        });
        expect(bobVisibleJob).not.toHaveProperty('payload');

        await expectError(
          await fetch(`${firstServer.url}/api/jobs/${job.id}/run`, {
            body: JSON.stringify({}),
            headers: jsonHeaders(bobCookie),
            method: 'POST',
          }),
          403,
          /mutation|credential|access denied/i,
        );

        const completedJob = await expectJson<JobResponse>(
          await fetch(`${firstServer.url}/api/jobs/${job.id}/run`, {
            body: JSON.stringify({}),
            headers: jsonHeaders(aliceCookie),
            method: 'POST',
          }),
        );
        expect(completedJob.status).toBe('succeeded');
        expect(completedJob).toMatchObject({
          scope: { id: project.project.id, type: 'project' },
          scopeId: project.project.id,
          scopeType: 'project',
        });

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

        const bobEvents = await expectJson<JobEventResponse[]>(
          await fetch(`${firstServer.url}/api/jobs/${job.id}/events`, {
            headers: withSessionCookie(bobCookie),
          }),
        );
        expect(bobEvents.map((event) => event.status)).toEqual([
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

        const bobAudits = await expectJson<AuditResponse[]>(
          await fetch(`${firstServer.url}/api/jobs/${job.id}/audit`, {
            headers: withSessionCookie(bobCookie),
          }),
        );
        expect(bobAudits.map((audit) => audit.action)).toEqual([
          'job.created',
          'job.started',
          'job.completed',
        ]);
        assertBrowserPayloadIsSafe(bobAudits, forbiddenBrowserPayloadValues);

        const bobProjectAudit = await expectJson<ProjectAuditResponse[]>(
          await fetch(
            `${firstServer.url}/api/projects/${project.project.id}/audit?objectType=job&objectId=${job.id}`,
            { headers: withSessionCookie(bobCookie) },
          ),
        );
        expect(bobProjectAudit.map((audit) => audit.action)).toEqual([
          'job.created',
          'job.started',
          'job.completed',
        ]);
        assertBrowserPayloadIsSafe(bobProjectAudit, forbiddenBrowserPayloadValues);
        assertBrowserPayloadIsSafe(
          { audits, bobAudits, bobProjectAudit },
          [credential.credentialRef],
        );

        for (const deniedUrl of [
          `${firstServer.url}/api/jobs?scopeType=project&scopeId=${encodeURIComponent(project.project.id)}&spaceId=${encodeURIComponent(space.id)}`,
          `${firstServer.url}/api/jobs/${job.id}`,
          `${firstServer.url}/api/jobs/${job.id}/events`,
          `${firstServer.url}/api/jobs/${job.id}/audit`,
          `${firstServer.url}/api/projects/${project.project.id}/audit?objectType=job&objectId=${job.id}`,
        ]) {
          await expectError(
            await fetch(deniedUrl, { headers: withSessionCookie(charlieCookie) }),
            403,
            /access denied/i,
          );
        }

        assertBrowserPayloadIsSafe(
          {
            audits,
            bobAudits,
            bobCitationTrace,
            bobLibraryEntry,
            bobProjectAudit,
            bobProjectDocSnapshot,
            bobReading,
            bobVisibleJob,
            bobVisibleJobs,
            completedJob,
            credential,
            events,
            job,
            personalLibraryEntry,
            projectAdoption,
            projectDoc,
            firstProjectDocSnapshot,
            projectLibraryEntry,
            repeatedProjectAdoption,
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
                libraryEntryId: projectLibraryEntry.entry.id,
                userId: 'user-alice',
              },
            },
          }),
        ).resolves.toMatchObject({
          libraryEntryId: projectLibraryEntry.entry.id,
          userId: 'user-alice',
        });
        await expect(prisma.job.findUnique({ where: { id: job.id } })).resolves.toMatchObject({
          id: job.id,
          requestedByUserId: 'user-alice',
          scopeId: project.project.id,
          scopeType: 'project',
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

      const restartedServer = await startTestServer(env, { connectors: testConnectors });

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
          await fetch(`${restartedServer.url}/api/library/${projectLibraryEntry.entry.id}`, {
            headers: withSessionCookie(bobCookie),
          }),
        );
        expect(restartedBobLibraryEntry.asset.id).toBe(projectLibraryEntry.asset.id);
        expect(restartedBobLibraryEntry.entry.scope).toEqual({
          id: project.project.id,
          type: 'project',
        });

        await expectPdfFile(
          await fetch(`${restartedServer.url}/api/library/${projectLibraryEntry.entry.id}/file`, {
            headers: withSessionCookie(bobCookie),
          }),
          pdfContents,
        );

        await expectError(
          await fetch(`${restartedServer.url}/api/library/${personalLibraryEntry.entry.id}`, {
            headers: withSessionCookie(bobCookie),
          }),
          403,
          /access denied/i,
        );
        await expectError(
          await fetch(`${restartedServer.url}/api/library/${personalLibraryEntry.entry.id}`, {
            headers: withSessionCookie(charlieCookie),
          }),
          403,
          /access denied/i,
        );

        await expectError(
          await fetch(`${restartedServer.url}/api/library/${projectLibraryEntry.entry.id}`, {
            headers: withSessionCookie(charlieCookie),
          }),
          403,
          /access denied/i,
        );
        await expectError(
          await fetch(`${restartedServer.url}/api/library/${projectLibraryEntry.entry.id}/file`, {
            headers: withSessionCookie(charlieCookie),
          }),
          403,
          /access denied/i,
        );

        const restartedAliceReading = await expectJson<ReadingDetailResponse>(
          await fetch(`${restartedServer.url}/api/reading/${projectLibraryEntry.entry.id}`, {
            headers: withSessionCookie(aliceCookie),
          }),
        );
        expect(restartedAliceReading.notes.map((note) => note.body)).toContain(privateReaderNoteText);
        expect(restartedAliceReading.projectComments.map((comment) => comment.body)).toContain(
          'Project-visible evidence comment.',
        );
        expect(restartedAliceReading.insights.map((item) => item.summary)).toContain(
          'The imported paper supports the minimal recovery loop.',
        );

        const restartedBobReading = await expectJson<ReadingDetailResponse>(
          await fetch(`${restartedServer.url}/api/reading/${projectLibraryEntry.entry.id}`, {
            headers: withSessionCookie(bobCookie),
          }),
        );
        expect(restartedBobReading.projectComments.map((comment) => comment.body)).toContain(
          'Project-visible evidence comment.',
        );
        expect(restartedBobReading.notes.map((note) => note.body)).not.toContain(privateReaderNoteText);
        expect(restartedBobReading.excerpts?.map((excerpt) => excerpt.quote)).toContain(
          'minimal recovery durable excerpt',
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
              citations: [{ paperAssetId: projectLibraryEntry.entry.id }],
              content: secondPrivateNotebookText,
            }),
            headers: jsonHeaders(aliceCookie),
            method: 'POST',
          }),
        );
        expect(secondNotebookSnapshot.versionNumber).toBe(3);

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
        assertBrowserPayloadIsSafe(restartedProjectDoc, forbiddenBrowserPayloadValues);

        const restartedBobCitationTrace = await expectJson<ProjectDocCitationTraceResponse>(
          await fetch(`${restartedServer.url}/api/project-docs/${projectDoc.id}/citation-trace`, {
            headers: withSessionCookie(bobCookie),
          }),
        );
        expect(restartedBobCitationTrace.citations[0]).toMatchObject({
          paperAssetId: projectLibraryEntry.asset.id,
          projectLibraryEntry: {
            libraryEntryId: projectLibraryEntry.entry.id,
            projectId: project.project.id,
          },
          readerExcerptId: readerExcerpt.id,
          source: { state: 'available' },
        });
        assertBrowserPayloadIsSafe(restartedBobCitationTrace, forbiddenBrowserPayloadValues);

        await expectError(
          await fetch(`${restartedServer.url}/api/project-docs/${projectDoc.id}`, {
            headers: withSessionCookie(charlieCookie),
          }),
          403,
          /access denied/i,
        );
        await expectError(
          await fetch(`${restartedServer.url}/api/project-docs/${projectDoc.id}/citation-trace`, {
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
          scope: { id: project.project.id, type: 'project' },
          status: 'succeeded',
        });

        const restartedBobJob = await expectJson<JobResponse>(
          await fetch(`${restartedServer.url}/api/jobs/${job.id}`, {
            headers: withSessionCookie(bobCookie),
          }),
        );
        expect(restartedBobJob).toMatchObject({
          id: job.id,
          scope: { id: project.project.id, type: 'project' },
          status: 'succeeded',
        });
        assertBrowserPayloadIsSafe(restartedBobJob, forbiddenBrowserPayloadValues);

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
        const restartedBobEvents = await expectJson<JobEventResponse[]>(
          await fetch(`${restartedServer.url}/api/jobs/${job.id}/events`, {
            headers: withSessionCookie(bobCookie),
          }),
        );
        const restartedBobAudits = await expectJson<AuditResponse[]>(
          await fetch(`${restartedServer.url}/api/jobs/${job.id}/audit`, {
            headers: withSessionCookie(bobCookie),
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
        expect(restartedBobEvents.map((event) => event.status)).toEqual([
          'queued',
          'running',
          'succeeded',
        ]);
        expect(restartedBobAudits.map((audit) => audit.action)).toEqual([
          'job.created',
          'job.started',
          'job.completed',
        ]);
        const restartedBobProjectAudit = await expectJson<ProjectAuditResponse[]>(
          await fetch(
            `${restartedServer.url}/api/projects/${project.project.id}/audit?objectType=job&objectId=${job.id}`,
            { headers: withSessionCookie(bobCookie) },
          ),
        );
        expect(restartedBobProjectAudit.map((audit) => audit.action)).toEqual([
          'job.created',
          'job.started',
          'job.completed',
        ]);
        assertBrowserPayloadIsSafe(restartedBobProjectAudit, forbiddenBrowserPayloadValues);
        assertBrowserPayloadIsSafe(
          { restartedAudits, restartedBobAudits, restartedBobProjectAudit },
          [credential.credentialRef],
        );
        assertBrowserPayloadIsSafe(
          {
            restartedAudits,
            restartedBobAudits,
            restartedBobProjectAudit,
            restartedBobCitationTrace,
            restartedBobEvents,
            restartedBobJob,
            restartedBobLibraryEntry,
            restartedBobReading,
            restartedEvents,
            restartedJob,
            restartedProjectDoc,
          },
          forbiddenBrowserPayloadValues,
        );

        for (const deniedUrl of [
          `${restartedServer.url}/api/jobs?scopeType=project&scopeId=${encodeURIComponent(project.project.id)}&spaceId=${encodeURIComponent(space.id)}`,
          `${restartedServer.url}/api/jobs/${job.id}`,
          `${restartedServer.url}/api/jobs/${job.id}/events`,
          `${restartedServer.url}/api/jobs/${job.id}/audit`,
          `${restartedServer.url}/api/projects/${project.project.id}/audit?objectType=job&objectId=${job.id}`,
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
