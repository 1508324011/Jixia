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

import type { JixiaApp } from './app';

export interface HttpApiResponse {
  payload: unknown;
  statusCode: number;
}

export interface HttpApiActorContext {
  userId: string;
}

// Compatibility actor used only for non-credential demo/discovery workbench routes.
// Credential and settings ownership must come from the server-derived actor.
const DEFAULT_WORKBENCH_USER_ID = 'user-alice';
const TODAY_DISCOVERY_QUERY = 'tumor board biomarkers';

interface ImportToPersonalLibraryRequestBody {
  sourceLocator?: string;
  sourceType?: 'doi' | 'pmid' | 'arxiv';
}

interface CreateReadingNoteRequestBody {
  body?: string;
  visibility?: NoteVisibility;
}

interface SaveReadingInsightRequestBody {
  evidenceSpans?: Array<Omit<EvidenceSpanRecord, 'paperAssetId'>>;
  summary?: string;
  title?: string;
}

interface SaveWritingDocumentRequestBody {
  citations?: Array<{ evidenceSpan?: string; paperAssetId: string }>;
  content?: string;
  title?: string;
}

interface ParsedWorkbenchSettingsUpdate extends UpdateWorkbenchSettingsRequest {
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
): ParsedWorkbenchSettingsUpdate {
  if (!requestBody || typeof requestBody !== 'object' || Array.isArray(requestBody)) {
    throw new Error('Settings payload must be a JSON object.');
  }

  const { actorUserId, apiKey, defaultImportTarget, userId } = requestBody as Record<string, unknown>;

  if (typeof apiKey !== 'undefined' && typeof apiKey !== 'string') {
    throw new Error('apiKey must be a string when provided.');
  }

  if (typeof actorUserId !== 'undefined' && typeof actorUserId !== 'string') {
    throw new Error('actorUserId must be a string when provided.');
  }

  if (typeof userId !== 'undefined' && typeof userId !== 'string') {
    throw new Error('userId must be a string when provided.');
  }

  if (!isDefaultImportTarget(defaultImportTarget)) {
    throw new Error('defaultImportTarget must be provided.');
  }

  return {
    actorUserId,
    apiKey,
    defaultImportTarget,
    userId,
  };
}

function assertNoActorMismatch(
  actor: HttpApiActorContext,
  claimedUserId: string | null | undefined,
): void {
  if (claimedUserId && claimedUserId !== actor.userId) {
    throw new Error('Request body actor does not match the server-derived actor.');
  }
}

function assertNoSettingsQueryActorMismatch(
  actor: HttpApiActorContext,
  requestUrl: URL,
): void {
  assertNoActorMismatch(actor, requestUrl.searchParams.get('actorUserId'));
  assertNoActorMismatch(actor, requestUrl.searchParams.get('userId'));
}

function parseImportToPersonalLibraryRequest(
  requestBody: unknown,
): Required<ImportToPersonalLibraryRequestBody> {
  if (!requestBody || typeof requestBody !== 'object' || Array.isArray(requestBody)) {
    throw new Error('Import payload must be a JSON object.');
  }

  const { sourceLocator, sourceType } = requestBody as Record<string, unknown>;

  if (typeof sourceLocator !== 'string' || !sourceLocator.trim()) {
    throw new Error('sourceLocator is required.');
  }

  if (!isImportSourceType(sourceType)) {
    throw new Error('sourceType is required.');
  }

  return {
    sourceLocator: sourceLocator.trim(),
    sourceType: sourceType as 'doi' | 'pmid' | 'arxiv',
  };
}

function parseCreateReadingNoteRequest(
  requestBody: unknown,
): Required<CreateReadingNoteRequestBody> {
  if (!requestBody || typeof requestBody !== 'object' || Array.isArray(requestBody)) {
    throw new Error('Reading note payload must be a JSON object.');
  }

  const { body, visibility } = requestBody as Record<string, unknown>;

  if (typeof body !== 'string' || !body.trim()) {
    throw new Error('body is required.');
  }

  if (!isNoteVisibility(visibility)) {
    throw new Error('visibility is required.');
  }

  return {
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
): Required<SaveReadingInsightRequestBody> {
  if (!requestBody || typeof requestBody !== 'object' || Array.isArray(requestBody)) {
    throw new Error('Reading insight payload must be a JSON object.');
  }

  const { evidenceSpans, summary, title } = requestBody as Record<string, unknown>;

  if (typeof summary !== 'string' || !summary.trim()) {
    throw new Error('summary is required.');
  }

  if (typeof title !== 'string' || !title.trim()) {
    throw new Error('title is required.');
  }

  return {
    evidenceSpans: parseEvidenceSpans(evidenceSpans),
    summary: summary.trim(),
    title: title.trim(),
  };
}

function parseSaveWritingDocumentRequest(
  requestBody: unknown,
): Required<SaveWritingDocumentRequestBody> {
  if (!requestBody || typeof requestBody !== 'object' || Array.isArray(requestBody)) {
    throw new Error('Writing payload must be a JSON object.');
  }

  const { citations, content, title } = requestBody as Record<string, unknown>;

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
): Promise<TodayRecommendation[]> {
  const personalEntries = await app.library.listPersonalEntries(DEFAULT_WORKBENCH_USER_ID);
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

function createUnavailableWritingDocumentResponse(
  spaceId: string,
  projectId: string,
): WritingDocumentResponse {
  return {
    document: {
      documentId: `project-doc:${projectId}`,
      latestSnapshot: null,
      projectId,
      publishState: "draft",
      spaceId,
      title: "Project writer document",
    },
  };
}


export async function resolveHttpApi(
  app: JixiaApp,
  requestUrl: URL,
  method: string,
  requestBody?: unknown,
  actor?: HttpApiActorContext,
): Promise<HttpApiResponse | null> {
  const pathname = requestUrl.pathname;

  if ((method === 'GET' || method === 'HEAD') && pathname === '/api/discovery/today') {
    const payload: DiscoveryTodayResponse = {
      items: await markImportedDiscoveryItems(
        app,
        await app.imports.searchDiscovery(TODAY_DISCOVERY_QUERY),
      ),
    };

    return {
      payload,
      statusCode: 200,
    };
  }

  if ((method === 'GET' || method === 'HEAD') && pathname === '/api/discovery/search') {
    const query = requestUrl.searchParams.get('query')?.trim() ?? '';
    const payload: DiscoverySearchResponse = {
      items: query
        ? await markImportedDiscoveryItems(app, await app.imports.searchDiscovery(query))
        : [],
      query,
    };

    return {
      payload,
      statusCode: 200,
    };
  }

  if ((method === 'GET' || method === 'HEAD') && pathname === '/api/library/personal') {
    const actorUserId = actor?.userId ?? DEFAULT_WORKBENCH_USER_ID;

    return {
      payload: toLibraryListResponse(
        await app.library.listPersonalEntries(actorUserId),
      ),
      statusCode: 200,
    };
  }

  if (method === 'POST' && pathname === '/api/library/personal/import') {
    const payload = parseImportToPersonalLibraryRequest(requestBody);
    const actorUserId = actor?.userId ?? DEFAULT_WORKBENCH_USER_ID;

    return {
      payload: await app.imports.importToPersonalLibrary({
        requestedByUserId: actorUserId,
        sourceLocator: payload.sourceLocator,
        sourceType: payload.sourceType,
      }),
      statusCode: 201,
    };
  }

  if ((method === 'GET' || method === 'HEAD') && pathname === '/api/settings/me') {
    if (!actor) {
      throw new Error(
        'Project API requires a server-derived actor session. Send x-jixia-actor for the lab-hosted MVP.',
      );
    }

    assertNoSettingsQueryActorMismatch(actor, requestUrl);

    return {
      payload: app.credentials.getWorkbenchSettings(actor.userId),
      statusCode: 200,
    };
  }

  if (method === 'POST' && pathname === '/api/settings/me') {
    if (!actor) {
      throw new Error(
        'Project API requires a server-derived actor session. Send x-jixia-actor for the lab-hosted MVP.',
      );
    }

    assertNoSettingsQueryActorMismatch(actor, requestUrl);

    const payload = parseWorkbenchSettingsUpdate(requestBody);
    assertNoActorMismatch(actor, payload.actorUserId);
    assertNoActorMismatch(actor, payload.userId);

    return {
      payload: await app.credentials.saveWorkbenchSettings({
        apiKey: payload.apiKey,
        defaultImportTarget: payload.defaultImportTarget,
        userId: payload.userId,
      }, actor.userId),
      statusCode: 200,
    };
  }

  const readingDetailMatch = pathname.match(/^\/api\/reading\/([^/]+)$/);

  if (
    readingDetailMatch &&
    (method === 'GET' || method === 'HEAD')
  ) {
    const actorUserId = actor?.userId ?? DEFAULT_WORKBENCH_USER_ID;
    const detail = await app.reading.getWorkbenchDetail({
      actorUserId,
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
    const payload = parseCreateReadingNoteRequest(requestBody);
    const actorUserId = actor?.userId ?? DEFAULT_WORKBENCH_USER_ID;

    return {
      payload: toReadingNoteResponse(
        await app.reading.createWorkbenchNote({
          authorUserId: actorUserId,
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
    const payload = parseSaveReadingInsightRequest(requestBody);
    const actorUserId = actor?.userId ?? DEFAULT_WORKBENCH_USER_ID;

    return {
      payload: toReadingInsightResponse(
        await app.reading.saveWorkbenchGeneratedInsight({
          evidenceSpans: payload.evidenceSpans,
          libraryEntryId: decodePathSegment(readingInsightMatch[1]),
          startedByUserId: actorUserId,
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
    const spaceId = decodePathSegment(writingDocumentMatch[1]);
    const projectId = decodePathSegment(writingDocumentMatch[2]);

    return {
      payload: createUnavailableWritingDocumentResponse(spaceId, projectId),
      statusCode: 200,
    };
  }

  if (writingDocumentMatch && method === 'POST') {
    const spaceId = decodePathSegment(writingDocumentMatch[1]);
    const projectId = decodePathSegment(writingDocumentMatch[2]);
    const payload = parseSaveWritingDocumentRequest(requestBody);
    const capturedAt = new Date().toISOString();
    const response = createUnavailableWritingDocumentResponse(spaceId, projectId);

    response.document.title = payload.title;
    response.document.latestSnapshot = {
      capturedAt,
      citations: payload.citations.map((citation, index) => ({
        evidenceSpan: citation.evidenceSpan,
        id: `writer-citation-${index + 1}`,
        docVersionId: `project-doc:${projectId}:version`,
        paperAssetId: citation.paperAssetId,
      })),
      content: payload.content,
      doc: {
        createdAt: capturedAt,
        id: response.document.documentId,
        projectId,
        publishState: "draft",
        spaceId,
        title: payload.title,
        updatedAt: capturedAt,
      },
      docVersionId: `project-doc:${projectId}:version`,
      versionNumber: 1,
    };

    return {
      payload: response,
      statusCode: 200,
    };
  }

  return null;
}
