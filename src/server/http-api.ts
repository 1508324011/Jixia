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
import type { ProjectListItem } from '@shared/contracts/projects';

import {
  assertNoClientActorContextField,
  assertNoClientActorIdentityField,
  type ActorContext,
} from './auth/actor';
import type { JixiaApp } from './app';

export interface HttpApiResponse {
  payload: unknown;
  statusCode: number;
}

async function getAuthorizedProjectForWorkbenchWrite(
  app: JixiaApp,
  projectId: string,
  actorUserId: string,
): Promise<ProjectListItem> {
  return app.projects.getProject({ projectId }, actorUserId);
}

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

type WorkbenchSettingsUpdatePayload = Omit<
  UpdateWorkbenchSettingsRequest,
  'actorUserId' | 'userId'
>;

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

  const { apiKey, defaultImportTarget } = requestBody as Record<
    string,
    unknown
  >;

  if (typeof apiKey !== 'undefined' && typeof apiKey !== 'string') {
    throw new Error('apiKey must be a string when provided.');
  }

  if (!isDefaultImportTarget(defaultImportTarget)) {
    throw new Error('defaultImportTarget must be provided.');
  }

  return {
    apiKey,
    defaultImportTarget,
  };
}

function parseImportToPersonalLibraryRequest(
  requestBody: unknown,
): Required<Pick<ImportToPersonalLibraryRequestBody, 'sourceLocator' | 'sourceType'>> {
  if (!requestBody || typeof requestBody !== 'object' || Array.isArray(requestBody)) {
    throw new Error('Import payload must be a JSON object.');
  }

  const { sourceLocator, sourceType } = requestBody as Record<
    string,
    unknown
  >;

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
): Required<Pick<CreateReadingNoteRequestBody, 'body' | 'visibility'>> {
  if (!requestBody || typeof requestBody !== 'object' || Array.isArray(requestBody)) {
    throw new Error('Reading note payload must be a JSON object.');
  }

  const { body, visibility } = requestBody as Record<
    string,
    unknown
  >;

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
): Required<Pick<SaveReadingInsightRequestBody, 'summary' | 'title'>> & {
  evidenceSpans: Array<Omit<EvidenceSpanRecord, 'paperAssetId'>>;
} {
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
): Required<Pick<SaveWritingDocumentRequestBody, 'citations' | 'content' | 'title'>> {
  if (!requestBody || typeof requestBody !== 'object' || Array.isArray(requestBody)) {
    throw new Error('Writing payload must be a JSON object.');
  }

  const { citations, content, title } = requestBody as Record<
    string,
    unknown
  >;

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

function rejectLegacyIdentityQueryFields(
  actor: ActorContext,
  requestUrl: URL,
): void {
  assertNoClientActorIdentityField(
    actor,
    requestUrl.searchParams.get('actorUserId') ?? undefined,
    'actorUserId',
  );
  assertNoClientActorIdentityField(
    actor,
    requestUrl.searchParams.get('requestedByUserId') ?? undefined,
    'requestedByUserId',
  );
  assertNoClientActorIdentityField(
    actor,
    requestUrl.searchParams.get('userId') ?? undefined,
    'userId',
  );
  assertNoClientActorIdentityField(
    actor,
    requestUrl.searchParams.get('authorUserId') ?? undefined,
    'authorUserId',
  );
  assertNoClientActorIdentityField(
    actor,
    requestUrl.searchParams.get('startedByUserId') ?? undefined,
    'startedByUserId',
  );
  assertNoClientActorContextField(
    requestUrl.searchParams.get('actorSpaceId') ?? undefined,
    'actorSpaceId',
  );
}

function rejectLegacyIdentityQueryFieldPresence(requestUrl: URL): void {
  assertNoClientActorContextField(
    requestUrl.searchParams.get('actorUserId') ?? undefined,
    'actorUserId',
  );
  assertNoClientActorContextField(
    requestUrl.searchParams.get('requestedByUserId') ?? undefined,
    'requestedByUserId',
  );
  assertNoClientActorContextField(
    requestUrl.searchParams.get('userId') ?? undefined,
    'userId',
  );
  assertNoClientActorContextField(
    requestUrl.searchParams.get('authorUserId') ?? undefined,
    'authorUserId',
  );
  assertNoClientActorContextField(
    requestUrl.searchParams.get('startedByUserId') ?? undefined,
    'startedByUserId',
  );
  assertNoClientActorContextField(
    requestUrl.searchParams.get('actorSpaceId') ?? undefined,
    'actorSpaceId',
  );
}

function rejectLegacyIdentityBodyFields(
  actor: ActorContext,
  requestBody: unknown,
): void {
  if (!requestBody || typeof requestBody !== 'object' || Array.isArray(requestBody)) {
    return;
  }

  const body = requestBody as Record<string, unknown>;

  assertNoClientActorIdentityField(actor, body.actorUserId, 'actorUserId');
  assertNoClientActorIdentityField(actor, body.requestedByUserId, 'requestedByUserId');
  assertNoClientActorIdentityField(actor, body.userId, 'userId');
  assertNoClientActorIdentityField(actor, body.authorUserId, 'authorUserId');
  assertNoClientActorIdentityField(actor, body.startedByUserId, 'startedByUserId');
  assertNoClientActorContextField(body.actorSpaceId, 'actorSpaceId');
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

  if ((method === 'GET' || method === 'HEAD') && pathname === '/api/discovery/today') {
    if (actor) {
      rejectLegacyIdentityQueryFields(actor, requestUrl);
    } else {
      rejectLegacyIdentityQueryFieldPresence(requestUrl);
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
      rejectLegacyIdentityQueryFields(actor, requestUrl);
    } else {
      rejectLegacyIdentityQueryFieldPresence(requestUrl);
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
    rejectLegacyIdentityQueryFields(requiredActor, requestUrl);

    return {
      payload: toLibraryListResponse(
        await app.library.listPersonalEntries(requiredActor.userId),
      ),
      statusCode: 200,
    };
  }

  if (method === 'POST' && pathname === '/api/library/personal/import') {
    const requiredActor = requireActor(actor);
    rejectLegacyIdentityQueryFields(requiredActor, requestUrl);
    rejectLegacyIdentityBodyFields(requiredActor, requestBody);
    const payload = parseImportToPersonalLibraryRequest(requestBody);

    return {
      payload: await app.imports.importToPersonalLibrary(
        {
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
    rejectLegacyIdentityQueryFields(requiredActor, requestUrl);

    return {
      payload: await app.credentials.getWorkbenchSettings(requiredActor.userId),
      statusCode: 200,
    };
  }

  if (method === 'POST' && pathname === '/api/settings/me') {
    const requiredActor = requireActor(actor);
    rejectLegacyIdentityQueryFields(requiredActor, requestUrl);
    rejectLegacyIdentityBodyFields(requiredActor, requestBody);
    const payload = parseWorkbenchSettingsUpdate(requestBody);

    return {
      payload: await app.credentials.saveWorkbenchSettings({
        apiKey: payload.apiKey,
        defaultImportTarget: payload.defaultImportTarget,
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
    rejectLegacyIdentityQueryFields(requiredActor, requestUrl);

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
    rejectLegacyIdentityQueryFields(requiredActor, requestUrl);
    rejectLegacyIdentityBodyFields(requiredActor, requestBody);
    const payload = parseCreateReadingNoteRequest(requestBody);

    return {
      payload: toReadingNoteResponse(
        await app.reading.createNote({
          actorUserId: requiredActor.userId,
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
    rejectLegacyIdentityQueryFields(requiredActor, requestUrl);
    rejectLegacyIdentityBodyFields(requiredActor, requestBody);
    const payload = parseSaveReadingInsightRequest(requestBody);

    return {
      payload: toReadingInsightResponse(
        await app.reading.saveGeneratedInsight({
          actorUserId: requiredActor.userId,
          evidenceSpans: payload.evidenceSpans,
          libraryEntryId: decodePathSegment(readingInsightMatch[1]),
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
    rejectLegacyIdentityQueryFields(requiredActor, requestUrl);
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
    rejectLegacyIdentityQueryFields(requiredActor, requestUrl);
    rejectLegacyIdentityBodyFields(requiredActor, requestBody);
    const spaceId = decodePathSegment(writingDocumentMatch[1]);
    const projectId = decodePathSegment(writingDocumentMatch[2]);
    const project = await getAuthorizedProjectForWorkbenchWrite(
      app,
      projectId,
      requiredActor.userId,
    );

    if (project.project.spaceId !== spaceId) {
      throw new Error(
        `Project ${projectId} belongs to governance space ${project.project.spaceId}, not ${spaceId}.`,
      );
    }

    const payload = parseSaveWritingDocumentRequest(requestBody);
    const document = await app.projectDocs.saveWorkbenchDocument(
      {
        citations: payload.citations,
        content: payload.content,
        projectId,
        title: payload.title,
      },
      requiredActor.userId,
    );

    return {
      payload: { document } satisfies WritingDocumentResponse,
      statusCode: 200,
    };
  }

  return null;
}
