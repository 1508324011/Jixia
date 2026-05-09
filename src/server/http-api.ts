import type {
  DiscoverySearchResponse,
  DiscoveryTodayResponse,
  TodayRecommendation,
} from '@shared/contracts/discovery';
import type { EvidenceSpanRecord } from '@shared/contracts/evidence';
import type { LibraryListResponse } from '@shared/contracts/library';
import type {
  NoteVisibility,
  ReadingDetailView,
  ReadingInsightResponse,
  ReadingNoteResponse,
} from '@shared/contracts/reading';
import type {
  DefaultImportTarget,
  UpdateWorkbenchSettingsRequest,
} from '@shared/contracts/settings';
import type { WritingDocumentResponse } from '@shared/contracts/writing';

import {
  assertNoActorImpersonation,
  type ActorContext,
} from './auth/actor';
import type { JixiaApp } from './app';

export interface HttpApiResponse {
  payload: unknown;
  statusCode: number;
}

const TODAY_DISCOVERY_QUERY = 'tumor board biomarkers';

interface ImportToPersonalLibraryRequestBody {
  requestedByUserId?: string;
  sourceLocator?: string;
  sourceType?: 'doi' | 'pmid' | 'arxiv';
}

interface CreateReadingNoteRequestBody {
  actorSpaceId?: string;
  authorUserId?: string;
  body?: string;
  visibility?: NoteVisibility;
}

interface SaveReadingInsightRequestBody {
  actorSpaceId?: string;
  evidenceSpans?: Array<Omit<EvidenceSpanRecord, 'paperAssetId'>>;
  startedByUserId?: string;
  summary?: string;
  title?: string;
}

interface SaveWritingDocumentRequestBody {
  actorUserId?: string;
  citations?: Array<{ evidenceSpan?: string; paperAssetId: string }>;
  content?: string;
  title?: string;
}

interface WorkbenchSettingsUpdatePayload extends UpdateWorkbenchSettingsRequest {
  actorUserId?: string;
  userId?: string;
}

function isDefaultImportTarget(value: unknown): value is DefaultImportTarget {
  return value === 'personal-library' || value === 'project-workspace';
}

function isImportSourceType(
  value: unknown,
): value is ImportToPersonalLibraryRequestBody['sourceType'] {
  return value === 'doi' || value === 'pmid' || value === 'arxiv';
}

function isNoteVisibility(value: unknown): value is NoteVisibility {
  return value === 'private' || value === 'space_shared';
}

function decodePathSegment(segment: string): string {
  return decodeURIComponent(segment);
}

function parseWorkbenchSettingsUpdate(
  requestBody: unknown,
): WorkbenchSettingsUpdatePayload {
  if (!requestBody || typeof requestBody !== 'object' || Array.isArray(requestBody)) {
    throw new Error('Settings payload must be a JSON object.');
  }

  const { actorUserId, apiKey, defaultImportTarget, userId } = requestBody as Record<
    string,
    unknown
  >;

  if (typeof apiKey !== 'undefined' && typeof apiKey !== 'string') {
    throw new Error('apiKey must be a string when provided.');
  }

  if (typeof actorUserId !== 'undefined' && typeof actorUserId !== 'string') {
    throw new Error('actorUserId must be a string when provided.');
  }

  if (!isDefaultImportTarget(defaultImportTarget)) {
    throw new Error('defaultImportTarget must be provided.');
  }

  if (typeof userId !== 'undefined' && typeof userId !== 'string') {
    throw new Error('userId must be a string when provided.');
  }

  return {
    actorUserId,
    apiKey,
    defaultImportTarget,
    userId,
  };
}

function parseImportToPersonalLibraryRequest(
  requestBody: unknown,
): Required<Pick<ImportToPersonalLibraryRequestBody, 'sourceLocator' | 'sourceType'>> & {
  requestedByUserId?: string;
} {
  if (!requestBody || typeof requestBody !== 'object' || Array.isArray(requestBody)) {
    throw new Error('Import payload must be a JSON object.');
  }

  const { requestedByUserId, sourceLocator, sourceType } = requestBody as Record<
    string,
    unknown
  >;

  if (
    typeof requestedByUserId !== 'undefined' &&
    typeof requestedByUserId !== 'string'
  ) {
    throw new Error('requestedByUserId must be a string when provided.');
  }

  if (typeof sourceLocator !== 'string' || !sourceLocator.trim()) {
    throw new Error('sourceLocator is required.');
  }

  if (!isImportSourceType(sourceType)) {
    throw new Error('sourceType is required.');
  }

  return {
    requestedByUserId,
    sourceLocator: sourceLocator.trim(),
    sourceType: sourceType as 'doi' | 'pmid' | 'arxiv',
  };
}

function parseCreateReadingNoteRequest(
  requestBody: unknown,
): Required<Pick<CreateReadingNoteRequestBody, 'body' | 'visibility'>> & {
  actorSpaceId?: string;
  authorUserId?: string;
} {
  if (!requestBody || typeof requestBody !== 'object' || Array.isArray(requestBody)) {
    throw new Error('Reading note payload must be a JSON object.');
  }

  const { actorSpaceId, authorUserId, body, visibility } = requestBody as Record<
    string,
    unknown
  >;

  if (typeof actorSpaceId !== 'undefined' && typeof actorSpaceId !== 'string') {
    throw new Error('actorSpaceId must be a string when provided.');
  }

  if (typeof authorUserId !== 'undefined' && typeof authorUserId !== 'string') {
    throw new Error('authorUserId must be a string when provided.');
  }

  if (typeof body !== 'string' || !body.trim()) {
    throw new Error('body is required.');
  }

  if (!isNoteVisibility(visibility)) {
    throw new Error('visibility is required.');
  }

  return {
    actorSpaceId,
    authorUserId,
    body: body.trim(),
    visibility,
  };
}

function parseEvidenceSpans(
  evidenceSpans: unknown,
): Array<Omit<EvidenceSpanRecord, 'paperAssetId'>> {
  if (typeof evidenceSpans === 'undefined') {
    return [];
  }

  if (!Array.isArray(evidenceSpans)) {
    throw new Error('evidenceSpans must be an array when provided.');
  }

  return evidenceSpans.map((span, index) => {
    if (!span || typeof span !== 'object' || Array.isArray(span)) {
      throw new Error(`evidenceSpans[${index}] must be an object.`);
    }

    const { endOffset, quote, startOffset } = span as Record<string, unknown>;

    if (typeof quote !== 'string' || !quote.trim()) {
      throw new Error(`evidenceSpans[${index}].quote is required.`);
    }

    if (typeof startOffset !== 'number' || typeof endOffset !== 'number') {
      throw new Error(`evidenceSpans[${index}] offsets must be numbers.`);
    }

    return {
      endOffset,
      quote: quote.trim(),
      startOffset,
    };
  });
}

function parseSaveReadingInsightRequest(
  requestBody: unknown,
): Required<Pick<SaveReadingInsightRequestBody, 'summary' | 'title'>> & {
  actorSpaceId?: string;
  evidenceSpans: Array<Omit<EvidenceSpanRecord, 'paperAssetId'>>;
  startedByUserId?: string;
} {
  if (!requestBody || typeof requestBody !== 'object' || Array.isArray(requestBody)) {
    throw new Error('Reading insight payload must be a JSON object.');
  }

  const { actorSpaceId, evidenceSpans, startedByUserId, summary, title } =
    requestBody as Record<string, unknown>;

  if (typeof actorSpaceId !== 'undefined' && typeof actorSpaceId !== 'string') {
    throw new Error('actorSpaceId must be a string when provided.');
  }

  if (
    typeof startedByUserId !== 'undefined' &&
    typeof startedByUserId !== 'string'
  ) {
    throw new Error('startedByUserId must be a string when provided.');
  }

  if (typeof summary !== 'string' || !summary.trim()) {
    throw new Error('summary is required.');
  }

  if (typeof title !== 'string' || !title.trim()) {
    throw new Error('title is required.');
  }

  return {
    actorSpaceId,
    evidenceSpans: parseEvidenceSpans(evidenceSpans),
    startedByUserId,
    summary: summary.trim(),
    title: title.trim(),
  };
}

function parseSaveWritingDocumentRequest(
  requestBody: unknown,
): Required<Pick<SaveWritingDocumentRequestBody, 'citations' | 'content' | 'title'>> & {
  actorUserId?: string;
} {
  if (!requestBody || typeof requestBody !== 'object' || Array.isArray(requestBody)) {
    throw new Error('Writing payload must be a JSON object.');
  }

  const { actorUserId, citations, content, title } = requestBody as Record<
    string,
    unknown
  >;

  if (typeof actorUserId !== 'undefined' && typeof actorUserId !== 'string') {
    throw new Error('actorUserId must be a string when provided.');
  }

  if (typeof content !== 'string') {
    throw new Error('content is required.');
  }

  if (typeof title !== 'string' || !title.trim()) {
    throw new Error('title is required.');
  }

  if (!Array.isArray(citations)) {
    throw new Error('citations must be an array.');
  }

  return {
    actorUserId,
    citations: citations.map((citation, index) => {
      if (!citation || typeof citation !== 'object' || Array.isArray(citation)) {
        throw new Error(`citations[${index}] must be an object.`);
      }

      const { evidenceSpan, paperAssetId } = citation as Record<string, unknown>;

      if (typeof paperAssetId !== 'string' || !paperAssetId.trim()) {
        throw new Error(`citations[${index}].paperAssetId is required.`);
      }

      if (typeof evidenceSpan !== 'undefined' && typeof evidenceSpan !== 'string') {
        throw new Error(`citations[${index}].evidenceSpan must be a string when provided.`);
      }

      return {
        evidenceSpan,
        paperAssetId: paperAssetId.trim(),
      };
    }),
    content,
    title: title.trim(),
  };
}

function requireActor(actor?: ActorContext): ActorContext {
  if (!actor) {
    throw new Error(
      'Workbench compatibility route requires a server-derived actor session.',
    );
  }

  return actor;
}

function toLibraryListResponse(
  entries: Awaited<ReturnType<JixiaApp['library']['listPersonalEntries']>>,
): LibraryListResponse {
  return {
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
}

async function markImportedDiscoveryItems(
  app: JixiaApp,
  items: TodayRecommendation[],
  actorUserId?: string,
): Promise<TodayRecommendation[]> {
  if (!actorUserId) {
    return items;
  }

  const personalEntries = await app.library.listPersonalEntries(actorUserId);
  const importedCanonicalIds = new Set(
    personalEntries.map(({ asset }) => asset.canonicalId),
  );

  return items.map((item) => ({
    ...item,
    imported: importedCanonicalIds.has(item.canonicalId),
  }));
}

function toReadingNoteResponse(
  note: Awaited<ReturnType<JixiaApp['reading']['createWorkbenchNote']>>,
): ReadingNoteResponse {
  return { note };
}

function toReadingInsightResponse(
  insight: Awaited<ReturnType<JixiaApp['reading']['saveWorkbenchGeneratedInsight']>>,
): ReadingInsightResponse {
  return { insight };
}


export async function resolveHttpApi(
  app: JixiaApp,
  requestUrl: URL,
  method: string,
  requestBody?: unknown,
  actor?: ActorContext,
): Promise<HttpApiResponse | null> {
  const pathname = requestUrl.pathname;
  const queryActorUserId = requestUrl.searchParams.get('actorUserId') ?? undefined;
  const queryUserId = requestUrl.searchParams.get('userId') ?? undefined;

  if ((method === 'GET' || method === 'HEAD') && pathname === '/api/discovery/today') {
    if (actor) {
      assertNoActorImpersonation(actor, queryActorUserId);
    }

    const payload: DiscoveryTodayResponse = {
      items: await markImportedDiscoveryItems(
        app,
        await app.imports.searchDiscovery(TODAY_DISCOVERY_QUERY),
        actor?.userId,
      ),
    };

    return {
      payload,
      statusCode: 200,
    };
  }

  if ((method === 'GET' || method === 'HEAD') && pathname === '/api/discovery/search') {
    if (actor) {
      assertNoActorImpersonation(actor, queryActorUserId);
    }

    const query = requestUrl.searchParams.get('query')?.trim() ?? '';
    const payload: DiscoverySearchResponse = {
      items: query
        ? await markImportedDiscoveryItems(
            app,
            await app.imports.searchDiscovery(query),
            actor?.userId,
          )
        : [],
      query,
    };

    return {
      payload,
      statusCode: 200,
    };
  }

  if ((method === 'GET' || method === 'HEAD') && pathname === '/api/library/personal') {
    const requiredActor = requireActor(actor);
    assertNoActorImpersonation(requiredActor, queryActorUserId);

    return {
      payload: toLibraryListResponse(
        await app.library.listPersonalEntries(requiredActor.userId),
      ),
      statusCode: 200,
    };
  }

  if (method === 'POST' && pathname === '/api/library/personal/import') {
    const requiredActor = requireActor(actor);
    const payload = parseImportToPersonalLibraryRequest(requestBody);
    assertNoActorImpersonation(requiredActor, payload.requestedByUserId);

    return {
      payload: await app.imports.importToPersonalLibrary(
        {
          requestedByUserId: payload.requestedByUserId,
          sourceLocator: payload.sourceLocator,
          sourceType: payload.sourceType,
        },
        requiredActor.userId,
      ),
      statusCode: 201,
    };
  }

  if ((method === 'GET' || method === 'HEAD') && pathname === '/api/settings/me') {
    const requiredActor = requireActor(actor);
    assertNoActorImpersonation(requiredActor, queryActorUserId);
    assertNoActorImpersonation(requiredActor, queryUserId);

    return {
      payload: app.credentials.getWorkbenchSettings(requiredActor.userId),
      statusCode: 200,
    };
  }

  if (method === 'POST' && pathname === '/api/settings/me') {
    const requiredActor = requireActor(actor);
    const payload = parseWorkbenchSettingsUpdate(requestBody);
    assertNoActorImpersonation(requiredActor, payload.actorUserId);
    assertNoActorImpersonation(requiredActor, payload.userId);

    return {
      payload: await app.credentials.saveWorkbenchSettings({
        apiKey: payload.apiKey,
        defaultImportTarget: payload.defaultImportTarget,
        userId: payload.userId,
      }, requiredActor.userId),
      statusCode: 200,
    };
  }

  const readingDetailMatch = pathname.match(/^\/api\/reading\/([^/]+)$/);

  if (
    readingDetailMatch &&
    (method === 'GET' || method === 'HEAD')
  ) {
    const requiredActor = requireActor(actor);
    assertNoActorImpersonation(requiredActor, queryActorUserId);

    const detail = await app.reading.getWorkbenchDetail({
      actorUserId: requiredActor.userId,
      libraryEntryId: decodePathSegment(readingDetailMatch[1]),
    });

    if (!detail) {
      return {
        payload: { message: 'Reading detail not found.' },
        statusCode: 404,
      };
    }

    return {
      payload: detail satisfies ReadingDetailView,
      statusCode: 200,
    };
  }

  const readingNoteMatch = pathname.match(/^\/api\/reading\/([^/]+)\/notes$/);

  if (readingNoteMatch && method === 'POST') {
    const requiredActor = requireActor(actor);
    const payload = parseCreateReadingNoteRequest(requestBody);
    assertNoActorImpersonation(requiredActor, payload.authorUserId);

    return {
      payload: toReadingNoteResponse(
        await app.reading.createNote({
          actorSpaceId: payload.actorSpaceId,
          actorUserId: requiredActor.userId,
          authorUserId: payload.authorUserId,
          body: payload.body,
          libraryEntryId: decodePathSegment(readingNoteMatch[1]),
          visibility: payload.visibility,
        }),
      ),
      statusCode: 201,
    };
  }

  const readingInsightMatch = pathname.match(/^\/api\/reading\/([^/]+)\/insights$/);

  if (readingInsightMatch && method === 'POST') {
    const requiredActor = requireActor(actor);
    const payload = parseSaveReadingInsightRequest(requestBody);
    assertNoActorImpersonation(requiredActor, payload.startedByUserId);

    return {
      payload: toReadingInsightResponse(
        await app.reading.saveGeneratedInsight({
          actorSpaceId: payload.actorSpaceId,
          actorUserId: requiredActor.userId,
          evidenceSpans: payload.evidenceSpans,
          libraryEntryId: decodePathSegment(readingInsightMatch[1]),
          startedByUserId: payload.startedByUserId,
          summary: payload.summary,
          title: payload.title,
        }),
      ),
      statusCode: 201,
    };
  }

  const writingDocumentMatch = pathname.match(
    /^\/api\/writing\/([^/]+)\/projects\/([^/]+)\/document$/,
  );

  if (
    writingDocumentMatch &&
    (method === 'GET' || method === 'HEAD')
  ) {
    const requiredActor = requireActor(actor);
    assertNoActorImpersonation(requiredActor, queryActorUserId);
    const spaceId = decodePathSegment(writingDocumentMatch[1]);
    const projectId = decodePathSegment(writingDocumentMatch[2]);
    const document = await app.projectDocs.getWorkbenchDocument(
      projectId,
      requiredActor.userId,
    );

    if (!document) {
      return {
        payload: { error: `No Writer document exists for project ${projectId}.` },
        statusCode: 404,
      };
    }

    if (document.spaceId !== spaceId) {
      throw new Error(
        `Project ${projectId} belongs to governance space ${document.spaceId}, not ${spaceId}.`,
      );
    }

    return {
      payload: { document } satisfies WritingDocumentResponse,
      statusCode: 200,
    };
  }

  if (writingDocumentMatch && method === 'POST') {
    const requiredActor = requireActor(actor);
    const spaceId = decodePathSegment(writingDocumentMatch[1]);
    const projectId = decodePathSegment(writingDocumentMatch[2]);
    const payload = parseSaveWritingDocumentRequest(requestBody);
    assertNoActorImpersonation(requiredActor, payload.actorUserId);
    const document = await app.projectDocs.saveWorkbenchDocument(
      {
        citations: payload.citations,
        content: payload.content,
        projectId,
        title: payload.title,
      },
      requiredActor.userId,
    );

    if (document.spaceId !== spaceId) {
      throw new Error(
        `Project ${projectId} belongs to governance space ${document.spaceId}, not ${spaceId}.`,
      );
    }

    return {
      payload: { document } satisfies WritingDocumentResponse,
      statusCode: 200,
    };
  }

  return null;
}
