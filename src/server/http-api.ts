import type { IncomingMessage } from 'node:http';

import type { EvidenceSpanRecord } from '@shared/contracts/evidence';
import type { GovernedJobResponse } from '@shared/contracts/jobs';
import type { LibraryEntryVisibility, LibraryListResponse } from '@shared/contracts/library';
import type {
  NoteVisibility,
  ReadingInsightResponse,
  ReadingNoteResponse,
} from '@shared/contracts/reading';
import type { DemoSpaceListResponse } from '@shared/contracts/spaces';
import type { WritingDocumentView } from '@shared/contracts/writing';

import type { JixiaApp } from './app';
import { nativeDemoFixture } from './demo/demo-fixture';

export interface HttpApiResponse {
  payload: unknown;
  statusCode: number;
}

interface ImportRequestBody {
  sourceLocator?: string;
  sourceType?: 'arxiv' | 'doi' | 'pmid';
  visibility?: LibraryEntryVisibility;
}

interface SaveDocumentRequestBody {
  citations?: Array<{ evidenceSpan?: string; paperAssetId: string }>;
  content?: string;
  title?: string;
}

interface CreateNoteRequestBody {
  body?: string;
  visibility?: NoteVisibility;
}

interface CreateInsightRequestBody {
  evidenceSpans?: Array<Omit<EvidenceSpanRecord, 'paperAssetId'>>;
  summary?: string;
  title?: string;
}

interface PublishDocumentRequestBody {
  publishState?: 'draft' | 'published' | 'review';
}

async function readJsonBody<T>(request: IncomingMessage): Promise<T> {
  const chunks: Buffer[] = [];

  for await (const chunk of request) {
    chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
  }

  if (chunks.length === 0) {
    return {} as T;
  }

  return JSON.parse(Buffer.concat(chunks).toString('utf8')) as T;
}

function createJsonResponse(statusCode: number, payload: unknown): HttpApiResponse {
  return { payload, statusCode };
}

function matchPath(pathname: string, pattern: RegExp): string[] | null {
  const match = pathname.match(pattern);

  return match ? match.slice(1).map((value) => decodeURIComponent(value)) : null;
}

function toErrorResponse(error: unknown): HttpApiResponse {
  if (error instanceof SyntaxError) {
    return createJsonResponse(400, { error: 'Invalid JSON body.' });
  }

  if (error instanceof Error) {
    if (/access denied/i.test(error.message)) {
      return createJsonResponse(403, { error: error.message });
    }

    if (/does not exist/i.test(error.message)) {
      return createJsonResponse(404, { error: error.message });
    }

    if (/required/i.test(error.message)) {
      return createJsonResponse(400, { error: error.message });
    }
  }

  return createJsonResponse(500, { error: 'Unexpected API failure.' });
}

function mapWritingDocument(document: WritingDocumentView): { document: WritingDocumentView } {
  return { document };
}

async function mapGovernedJobResponse(
  app: JixiaApp,
  actorUserId: string,
  spaceId: string,
): Promise<GovernedJobResponse> {
  const latestJob = await app.jobs.getLatestJob({
    actorSpaceId: spaceId,
    actorUserId,
    kind: nativeDemoFixture.jobKind,
    spaceId,
  });

  if (!latestJob) {
    return { governedJob: null };
  }

  const events = app.jobStream.listLatestEvents({
    actorSpaceId: spaceId,
    actorUserId,
    kind: nativeDemoFixture.jobKind,
    spaceId,
  });
  const audits = await app.jobs.listAuditRecords({
    actorSpaceId: spaceId,
    actorUserId,
    jobId: latestJob.id,
  });

  return {
    governedJob: {
      audits,
      events,
      job: latestJob,
    },
  };
}

export async function handleHttpApiRequest(
  app: JixiaApp,
  request: IncomingMessage,
  requestUrl: URL,
): Promise<HttpApiResponse | null> {
  const method = request.method ?? 'GET';
  const pathname = requestUrl.pathname;
  const actorUserId = nativeDemoFixture.actorUserId;

  try {
    if (pathname === '/api/spaces' && method === 'GET') {
      const spaces = await app.spaces.listSpaces(actorUserId);
      const payload: DemoSpaceListResponse = {
        spaces: spaces.map((space) => ({
          importLocator: nativeDemoFixture.importLocator,
          kind: space.kind,
          name: space.name,
          projectId: nativeDemoFixture.projectId,
          spaceId: space.id,
          visibility: nativeDemoFixture.visibility,
        })),
      };

      return createJsonResponse(200, payload);
    }

    const governedSummaryMatch = matchPath(
      pathname,
      /^\/api\/spaces\/([^/]+)\/governed-summary$/,
    );

    if (governedSummaryMatch && method === 'GET') {
      const [spaceId] = governedSummaryMatch;

      return createJsonResponse(200, await mapGovernedJobResponse(app, actorUserId, spaceId));
    }

    if (governedSummaryMatch && method === 'POST') {
      const [spaceId] = governedSummaryMatch;
      const job = await app.jobs.createJob({
        credentialRef: nativeDemoFixture.credentialRef,
        kind: nativeDemoFixture.jobKind,
        payload: {
          prompt: 'Summarize the shared tumor-board evidence trail.',
        },
        requestedByUserId: actorUserId,
        spaceId,
      });

      await app.jobs.runJob({
        actorSpaceId: spaceId,
        actorUserId,
        jobId: job.id,
      });

      return createJsonResponse(200, await mapGovernedJobResponse(app, actorUserId, spaceId));
    }

    const importMatch = matchPath(pathname, /^\/api\/spaces\/([^/]+)\/import$/);

    if (importMatch && method === 'POST') {
      const [spaceId] = importMatch;
      const body = await readJsonBody<ImportRequestBody>(request);

      if (!body.sourceLocator || !body.sourceType) {
        throw new Error('sourceLocator and sourceType are required.');
      }

      const result = await app.imports.importPaper({
        requestedByUserId: actorUserId,
        sourceLocator: body.sourceLocator,
        sourceType: body.sourceType,
        spaceId,
        visibility: body.visibility ?? nativeDemoFixture.visibility,
      });

      return createJsonResponse(201, result);
    }

    const libraryListMatch = matchPath(
      pathname,
      /^\/api\/spaces\/([^/]+)\/projects\/([^/]+)\/library$/,
    );

    if (libraryListMatch && method === 'GET') {
      const [spaceId] = libraryListMatch;
      const entries = await app.library.listEntries({
        actorSpaceId: spaceId,
        actorUserId,
        spaceId,
      });
      const payload: LibraryListResponse = {
        entries: entries.map(({ asset, entry }) => ({
          addedAt: entry.addedAt,
          canonicalId: asset.canonicalId,
          entryId: entry.id,
          paperAssetId: entry.paperAssetId,
          spaceId: entry.spaceId,
          title: asset.title,
          visibility: entry.visibility,
        })),
      };

      return createJsonResponse(200, payload);
    }

    const libraryEntryMatch = matchPath(pathname, /^\/api\/library\/([^/]+)$/);

    if (libraryEntryMatch && method === 'GET') {
      const [entryId] = libraryEntryMatch;
      const entry = await app.library.getEntry({
        actorSpaceId: nativeDemoFixture.sharedSpaceId,
        actorUserId,
        entryId,
      });

      if (!entry) {
        return createJsonResponse(404, { error: 'Library entry not found.' });
      }

      return createJsonResponse(200, entry);
    }

    const readingMatch = matchPath(pathname, /^\/api\/reading\/([^/]+)$/);

    if (readingMatch && method === 'GET') {
      const [entryId] = readingMatch;
      const detail = await app.reading.getDetail({
        actorSpaceId: nativeDemoFixture.sharedSpaceId,
        actorUserId,
        libraryEntryId: entryId,
      });

      if (!detail) {
        return createJsonResponse(404, { error: 'Reading detail not found.' });
      }

      return createJsonResponse(200, detail);
    }

    const noteMatch = matchPath(pathname, /^\/api\/reading\/([^/]+)\/notes$/);

    if (noteMatch && method === 'POST') {
      const [entryId] = noteMatch;
      const body = await readJsonBody<CreateNoteRequestBody>(request);

      if (!body.body) {
        throw new Error('body is required.');
      }

      const note = await app.reading.createNote({
        actorSpaceId: nativeDemoFixture.sharedSpaceId,
        authorUserId: actorUserId,
        body: body.body,
        libraryEntryId: entryId,
        visibility: body.visibility ?? nativeDemoFixture.visibility,
      });
      const payload: ReadingNoteResponse = { note };

      return createJsonResponse(201, payload);
    }

    const insightMatch = matchPath(pathname, /^\/api\/reading\/([^/]+)\/insights$/);

    if (insightMatch && method === 'POST') {
      const [entryId] = insightMatch;
      const body = await readJsonBody<CreateInsightRequestBody>(request);

      if (!body.summary) {
        throw new Error('summary is required.');
      }

      const insight = await app.reading.saveGeneratedInsight({
        actorSpaceId: nativeDemoFixture.sharedSpaceId,
        evidenceSpans: body.evidenceSpans ?? [
          {
            endOffset: 24,
            quote: 'Key mutation evidence',
            startOffset: 0,
          },
        ],
        libraryEntryId: entryId,
        startedByUserId: actorUserId,
        summary: body.summary,
        title: body.title ?? 'Tumor board summary',
      });
      const payload: ReadingInsightResponse = { insight };

      return createJsonResponse(201, payload);
    }

    const writingMatch = matchPath(
      pathname,
      /^\/api\/writing\/([^/]+)\/projects\/([^/]+)\/document$/,
    );

    if (writingMatch && method === 'GET') {
      const [spaceId, projectId] = writingMatch;
      const document = await app.writing.getDocument({
        actorSpaceId: spaceId,
        actorUserId,
        projectId,
        spaceId,
      });

      if (!document) {
        return createJsonResponse(404, { error: 'Writing document not found.' });
      }

      return createJsonResponse(200, mapWritingDocument(document));
    }

    if (writingMatch && method === 'POST') {
      const [spaceId, projectId] = writingMatch;
      const body = await readJsonBody<SaveDocumentRequestBody>(request);
      const existingDocument = await app.writing.getDocument({
        actorSpaceId: spaceId,
        actorUserId,
        projectId,
        spaceId,
      });
      const documentId =
        existingDocument?.documentId ??
        (
          await app.writing.createDocument({
            actorSpaceId: spaceId,
            actorUserId,
            ownerUserId: actorUserId,
            spaceId,
            title: body.title ?? nativeDemoFixture.documentTitle,
          })
        ).id;

      await app.writing.saveDocument({
        actorSpaceId: spaceId,
        actorUserId,
        citations: body.citations ?? [],
        content: body.content ?? '',
        docId: documentId,
      });

      const document = await app.writing.getDocument({
        actorSpaceId: spaceId,
        actorUserId,
        projectId,
        spaceId,
      });

      if (!document) {
        return createJsonResponse(404, { error: 'Writing document not found.' });
      }

      return createJsonResponse(200, mapWritingDocument(document));
    }

    const publishMatch = matchPath(pathname, /^\/api\/writing\/([^/]+)\/publish$/);

    if (publishMatch && method === 'POST') {
      const [documentId] = publishMatch;
      const body = await readJsonBody<PublishDocumentRequestBody>(request);

      await app.writing.transitionPublishState({
        actorSpaceId: nativeDemoFixture.sharedSpaceId,
        actorUserId,
        docId: documentId,
        publishState: body.publishState ?? 'published',
      });

      const document = await app.writing.getDocument({
        actorSpaceId: nativeDemoFixture.sharedSpaceId,
        actorUserId,
        projectId: nativeDemoFixture.projectId,
        spaceId: nativeDemoFixture.sharedSpaceId,
      });

      if (!document) {
        return createJsonResponse(404, { error: 'Writing document not found.' });
      }

      return createJsonResponse(200, mapWritingDocument(document));
    }

    if (pathname.startsWith('/api/')) {
      return createJsonResponse(404, { error: 'API route not found.' });
    }

    return null;
  } catch (error: unknown) {
    return toErrorResponse(error);
  }
}
