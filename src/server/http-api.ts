import type {
  DiscoveryBoard,
  DiscoverySearchResponse,
  DiscoveryTodayResponse,
  TodayRecommendation,
} from '@shared/contracts/discovery';
import type { EvidenceSpanRecord } from '@shared/contracts/evidence';
import type { GovernedJobResponse } from '@shared/contracts/jobs';
import type {
  LibraryEntryVisibility,
  LibraryListResponse,
} from '@shared/contracts/library';
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
import type {
  CreateSpaceRequest,
  DemoSpaceListResponse,
  DemoSpaceRecord,
  DemoSpaceResponse,
} from '@shared/contracts/spaces';
import type {
  WritingDocumentResponse,
  WritingDocumentView,
} from '@shared/contracts/writing';

import type { JixiaApp } from './app';
import { nativeDemoFixture } from './demo/demo-fixture';

export interface HttpApiResponse {
  payload: unknown;
  statusCode: number;
}

const DEFAULT_WORKBENCH_USER_ID = 'user-alice';

interface ImportRequestBody {
  sourceLocator?: string;
  sourceType?: 'arxiv' | 'doi' | 'pmid';
  visibility?: LibraryEntryVisibility;
}

interface PublishDocumentRequestBody {
  publishState?: 'draft' | 'published' | 'review';
}

interface ImportToPersonalLibraryRequestBody {
  sourceLocator?: string;
  sourceType?: 'doi' | 'pmid' | 'arxiv';
}

interface ImportDiscoveryCandidateRequestBody {
  candidateId?: string;
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
): UpdateWorkbenchSettingsRequest {
  if (!requestBody || typeof requestBody !== 'object' || Array.isArray(requestBody)) {
    throw new Error('Settings payload must be a JSON object.');
  }

  const { apiKey, defaultImportTarget } = requestBody as Record<string, unknown>;

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

function parseImportDiscoveryCandidateRequest(
  requestBody: unknown,
): Required<ImportDiscoveryCandidateRequestBody> {
  if (!requestBody || typeof requestBody !== 'object' || Array.isArray(requestBody)) {
    throw new Error('Discovery import payload must be a JSON object.');
  }

  const { candidateId } = requestBody as Record<string, unknown>;

  if (typeof candidateId !== 'string' || !candidateId.trim()) {
    throw new Error('candidateId is required.');
  }

  return {
    candidateId: candidateId.trim(),
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

function parseCreateProjectReferenceRequest(
  requestBody: unknown,
): 
  | {
      noteId: string;
      notebookId: string;
      paperAssetId: string;
      spaceId?: string;
      selectedText: string;
      sourceType: 'notebook-note';
      userId?: string;
    }
  | {
      evidenceCardId: string;
      paperAssetId: string;
      spaceId?: string;
      selectedText: string;
      sourceType: 'evidence-card';
      userId?: string;
    } {
  if (!requestBody || typeof requestBody !== 'object' || Array.isArray(requestBody)) {
    throw new Error('Project reference payload must be a JSON object.');
  }

  const {
    evidenceCardId,
    noteId,
    notebookId,
    paperAssetId,
    selectedText,
    spaceId,
    sourceType,
    userId,
  } = requestBody as Record<string, unknown>;

  if (typeof paperAssetId !== 'string' || !paperAssetId.trim()) {
    throw new Error('paperAssetId is required.');
  }

  if (typeof selectedText !== 'string' || !selectedText.trim()) {
    throw new Error('selectedText is required.');
  }

  if (typeof spaceId !== 'undefined' && (typeof spaceId !== 'string' || !spaceId.trim())) {
    throw new Error('spaceId must be a non-empty string when provided.');
  }

   if (typeof userId !== 'undefined' && (typeof userId !== 'string' || !userId.trim())) {
    throw new Error('userId must be a non-empty string when provided.');
  }

  const normalizedSpaceId = typeof spaceId === 'string' ? spaceId.trim() : undefined;
  const normalizedUserId = typeof userId === 'string' ? userId.trim() : undefined;

  if (sourceType === 'notebook-note') {
    if (typeof noteId !== 'string' || !noteId.trim()) {
      throw new Error('noteId is required for notebook-note projection.');
    }

    if (typeof notebookId !== 'string' || !notebookId.trim()) {
      throw new Error('notebookId is required for notebook-note projection.');
    }

    return {
      noteId: noteId.trim(),
      notebookId: notebookId.trim(),
      paperAssetId: paperAssetId.trim(),
      spaceId: normalizedSpaceId,
      selectedText: selectedText.trim(),
      sourceType,
      userId: normalizedUserId,
    };
  }

  if (sourceType === 'evidence-card') {
    if (typeof evidenceCardId !== 'string' || !evidenceCardId.trim()) {
      throw new Error('evidenceCardId is required for evidence-card projection.');
    }

    return {
      evidenceCardId: evidenceCardId.trim(),
      paperAssetId: paperAssetId.trim(),
      spaceId: normalizedSpaceId,
      selectedText: selectedText.trim(),
      sourceType,
      userId: normalizedUserId,
    };
  }

  throw new Error('sourceType is required.');
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

  if (typeof citations !== 'undefined' && !Array.isArray(citations)) {
    throw new Error('citations must be an array.');
  }

  return {
    citations: (citations ?? []).map((citation, index) => {
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

function createJsonResponse(statusCode: number, payload: unknown): HttpApiResponse {
  return { payload, statusCode };
}

function matchPath(pathname: string, pattern: RegExp): string[] | null {
  const match = pathname.match(pattern);

  return match ? match.slice(1).map((value) => decodeURIComponent(value)) : null;
}

function toErrorResponse(error: unknown): HttpApiResponse {
  if (error instanceof Error) {
    if (/access denied/i.test(error.message)) {
      return createJsonResponse(403, { error: error.message });
    }

    if (/does not exist|not found/i.test(error.message)) {
      return createJsonResponse(404, { error: error.message });
    }

    if (/required|payload|json|provided/i.test(error.message)) {
      return createJsonResponse(400, { error: error.message });
    }
  }

  return createJsonResponse(500, { error: 'Unexpected API failure.' });
}

function mapWritingDocument(document: WritingDocumentView): WritingDocumentResponse {
  return { document };
}

function getActorSpaceId(requestUrl: URL): string {
  return requestUrl.searchParams.get('spaceId') ?? nativeDemoFixture.sharedSpaceId;
}

function resolveRouteActorUserId(spaceId: string, explicitUserId?: string | null): string {
  if (typeof explicitUserId === 'string' && explicitUserId.trim()) {
    return explicitUserId.trim();
  }

  if (spaceId === 'personal-space-user-alice' || spaceId.startsWith('personal-space-user-alice')) {
    return DEFAULT_WORKBENCH_USER_ID;
  }

  return nativeDemoFixture.actorUserId;
}

function mapDemoSpaceRecord(space: {
  id: string;
  kind: 'personal' | 'shared';
  name: string;
}): DemoSpaceRecord {
  return {
    importLocator: nativeDemoFixture.importLocator,
    kind: space.kind,
    name: space.name,
    projectId: nativeDemoFixture.projectId,
    spaceId: space.id,
    visibility: nativeDemoFixture.visibility,
  };
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
  const importedCanonicalIds = new Set(personalEntries.map(({ asset }) => asset.canonicalId));

  return items.map((item) => ({
    ...item,
    imported: importedCanonicalIds.has(item.canonicalId),
    objectType: 'external-candidate',
    state: importedCanonicalIds.has(item.canonicalId) ? 'imported' : 'new',
  }));
}

function toDiscoveryBoards(items: TodayRecommendation[]): DiscoveryBoard[] {
  const groupedItems = new Map<string, TodayRecommendation[]>();

  for (const item of items) {
    const boardItems = groupedItems.get(item.sourceLabel) ?? [];
    boardItems.push(item);
    groupedItems.set(item.sourceLabel, boardItems);
  }

  return Array.from(groupedItems.entries()).map(([title, boardItems], index) => ({
    id: `board-${index + 1}`,
    items: boardItems,
    title,
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

function toWritingDocumentResponse(
  document: NonNullable<Awaited<ReturnType<JixiaApp['writing']['getDocument']>>>,
): WritingDocumentResponse {
  return { document };
}

export async function resolveHttpApi(
  app: JixiaApp,
  requestUrl: URL,
  method: string,
  requestBody?: unknown,
): Promise<HttpApiResponse | null> {
  const pathname = requestUrl.pathname;

  try {
    if ((method === 'GET' || method === 'HEAD') && pathname === '/api/discovery/today') {
      const items = await markImportedDiscoveryItems(app, await app.imports.listTodayDiscovery());

      return createJsonResponse(200, {
        boards: toDiscoveryBoards(items),
        items,
      } satisfies DiscoveryTodayResponse);
    }

    if ((method === 'GET' || method === 'HEAD') && pathname === '/api/discovery/search') {
      const query =
        requestUrl.searchParams.get('query')?.trim() ||
        requestUrl.searchParams.get('q')?.trim() ||
        '';
      const items = query
        ? await markImportedDiscoveryItems(app, await app.imports.searchDiscovery(query))
        : [];

      return createJsonResponse(200, {
        boards: toDiscoveryBoards(items),
        items,
        query,
      } satisfies DiscoverySearchResponse);
    }

    if (method === 'POST' && pathname === '/api/discovery/import') {
      const payload = parseImportDiscoveryCandidateRequest(requestBody);

      return createJsonResponse(
        201,
        await app.imports.importDiscoveryCandidate({
          candidateId: payload.candidateId,
          requestedByUserId: DEFAULT_WORKBENCH_USER_ID,
        }),
      );
    }

    if ((method === 'GET' || method === 'HEAD') && pathname === '/api/library/personal') {
      return createJsonResponse(
        200,
        toLibraryListResponse(await app.library.listPersonalEntries(DEFAULT_WORKBENCH_USER_ID)),
      );
    }

    if (method === 'POST' && pathname === '/api/library/personal/import') {
      const payload = parseImportToPersonalLibraryRequest(requestBody);

      return createJsonResponse(
        201,
        await app.imports.importToPersonalLibrary({
          requestedByUserId: DEFAULT_WORKBENCH_USER_ID,
          sourceLocator: payload.sourceLocator,
          sourceType: payload.sourceType,
        }),
      );
    }

    if ((method === 'GET' || method === 'HEAD') && pathname === '/api/settings/me') {
      return createJsonResponse(
        200,
        app.credentials.getWorkbenchSettings(DEFAULT_WORKBENCH_USER_ID),
      );
    }

    if (method === 'POST' && pathname === '/api/settings/me') {
      const payload = parseWorkbenchSettingsUpdate(requestBody);

      return createJsonResponse(
        200,
        await app.credentials.saveWorkbenchSettings({
          apiKey: payload.apiKey,
          defaultImportTarget: payload.defaultImportTarget,
          userId: DEFAULT_WORKBENCH_USER_ID,
        }),
      );
    }

    const readingDetailMatch = pathname.match(/^\/api\/reading\/([^/]+)$/);

    if (readingDetailMatch && (method === 'GET' || method === 'HEAD')) {
      const libraryEntryId = decodePathSegment(readingDetailMatch[1]);
      const actorSpaceId = requestUrl.searchParams.get('spaceId');

      if (actorSpaceId) {
        const detail = await app.reading.getDetail({
          actorSpaceId,
          actorUserId: nativeDemoFixture.actorUserId,
          libraryEntryId,
        });

        if (!detail) {
          return createJsonResponse(404, { error: 'Reading detail not found.' });
        }

        return createJsonResponse(200, detail satisfies ReadingDetailView);
      }

      let detail: ReadingDetailView | null = null;

      try {
        detail = await app.reading.getWorkbenchDetail({
          actorUserId: DEFAULT_WORKBENCH_USER_ID,
          libraryEntryId,
        });
      } catch {
        detail = await app.reading.getDetail({
          actorSpaceId: nativeDemoFixture.sharedSpaceId,
          actorUserId: nativeDemoFixture.actorUserId,
          libraryEntryId,
        });
      }

      if (!detail) {
        return createJsonResponse(404, { message: 'Reading detail not found.' });
      }

      return createJsonResponse(200, detail satisfies ReadingDetailView);
    }

    const readingNoteMatch = pathname.match(/^\/api\/reading\/([^/]+)\/notes$/);

    if (readingNoteMatch && method === 'POST') {
      const libraryEntryId = decodePathSegment(readingNoteMatch[1]);
      const actorSpaceId = requestUrl.searchParams.get('spaceId');

      if (actorSpaceId) {
        const payload = parseCreateReadingNoteRequest(requestBody);
        const note =
          payload.visibility === 'private'
            ? await app.reading.createWorkbenchNote({
                authorUserId: nativeDemoFixture.actorUserId,
                body: payload.body,
                libraryEntryId,
                visibility: payload.visibility,
              })
            : await app.reading.createNote({
                actorSpaceId,
                authorUserId: nativeDemoFixture.actorUserId,
                body: payload.body,
                libraryEntryId,
                visibility: payload.visibility,
              });

        return createJsonResponse(201, { note } satisfies ReadingNoteResponse);
      }

      const payload = parseCreateReadingNoteRequest(requestBody);

      try {
        return createJsonResponse(
          201,
          toReadingNoteResponse(
            await app.reading.createWorkbenchNote({
              authorUserId: DEFAULT_WORKBENCH_USER_ID,
              body: payload.body,
              libraryEntryId,
              visibility: payload.visibility,
            }),
          ),
        );
      } catch {
        const note = await app.reading.createNote({
          actorSpaceId: nativeDemoFixture.sharedSpaceId,
          authorUserId: nativeDemoFixture.actorUserId,
          body: payload.body,
          libraryEntryId,
          visibility: payload.visibility,
        });

        return createJsonResponse(201, { note } satisfies ReadingNoteResponse);
      }
    }

    const readingInsightMatch = pathname.match(/^\/api\/reading\/([^/]+)\/insights$/);

    if (readingInsightMatch && method === 'POST') {
      const libraryEntryId = decodePathSegment(readingInsightMatch[1]);
      const actorSpaceId = requestUrl.searchParams.get('spaceId');

      if (actorSpaceId) {
        const payload = requestBody as SaveReadingInsightRequestBody | undefined;

        if (typeof payload?.summary !== 'string' || !payload.summary.trim()) {
          throw new Error('summary is required.');
        }

        const insight = await app.reading.saveGeneratedInsight({
          actorSpaceId,
          evidenceSpans: parseEvidenceSpans(payload.evidenceSpans).length
            ? parseEvidenceSpans(payload.evidenceSpans)
            : [
                {
                  endOffset: 24,
                  quote: 'Key mutation evidence',
                  startOffset: 0,
                },
              ],
          libraryEntryId,
          startedByUserId: nativeDemoFixture.actorUserId,
          summary: payload.summary.trim(),
          title: payload.title?.trim() || 'Tumor board summary',
        });

        return createJsonResponse(201, { insight } satisfies ReadingInsightResponse);
      }

      const payload = parseSaveReadingInsightRequest(requestBody);

      try {
        return createJsonResponse(
          201,
          toReadingInsightResponse(
            await app.reading.saveWorkbenchGeneratedInsight({
              evidenceSpans: payload.evidenceSpans,
              libraryEntryId,
              startedByUserId: DEFAULT_WORKBENCH_USER_ID,
              summary: payload.summary,
              title: payload.title,
            }),
          ),
        );
      } catch {
        const insight = await app.reading.saveGeneratedInsight({
          actorSpaceId: nativeDemoFixture.sharedSpaceId,
          evidenceSpans: payload.evidenceSpans.length
            ? payload.evidenceSpans
            : [
                {
                  endOffset: 24,
                  quote: 'Key mutation evidence',
                  startOffset: 0,
                },
              ],
          libraryEntryId,
          startedByUserId: nativeDemoFixture.actorUserId,
          summary: payload.summary,
          title: payload.title,
        });

        return createJsonResponse(201, { insight } satisfies ReadingInsightResponse);
      }
    }

    const projectDocumentReferenceMatch = pathname.match(
      /^\/api\/projects\/([^/]+)\/docs\/([^/]+)\/references$/,
    );

    if (projectDocumentReferenceMatch && method === 'POST') {
      const projectId = decodePathSegment(projectDocumentReferenceMatch[1]);
      const docId = decodePathSegment(projectDocumentReferenceMatch[2]);
      const payload = parseCreateProjectReferenceRequest(requestBody);
      const actorSpaceId =
        payload.spaceId ?? requestUrl.searchParams.get('spaceId') ?? nativeDemoFixture.sharedSpaceId;
      const actorUserId = resolveRouteActorUserId(
        actorSpaceId,
        payload.userId ?? requestUrl.searchParams.get('userId'),
      );
      const reference = await app.projectProjection.createReference({
        actorSpaceId,
        actorUserId,
        ...payload,
        docId,
        projectId,
      });

      return createJsonResponse(201, { reference });
    }

    const writingDocumentMatch = pathname.match(/^\/api\/writing\/([^/]+)\/projects\/([^/]+)\/document$/);

    if (writingDocumentMatch && (method === 'GET' || method === 'HEAD')) {
      const spaceId = decodePathSegment(writingDocumentMatch[1]);
      const projectId = decodePathSegment(writingDocumentMatch[2]);
      const actorUserId = resolveRouteActorUserId(spaceId, requestUrl.searchParams.get('userId'));
      const document = await app.writing.getDocument({
        actorSpaceId: spaceId,
        actorUserId,
        projectId,
        spaceId,
      });

      if (!document) {
        return createJsonResponse(404, { error: 'Writing document not found.' });
      }

      return createJsonResponse(200, toWritingDocumentResponse(document));
    }

    if (writingDocumentMatch && method === 'POST') {
      const spaceId = decodePathSegment(writingDocumentMatch[1]);
      const projectId = decodePathSegment(writingDocumentMatch[2]);
      const actorUserId = resolveRouteActorUserId(spaceId, requestUrl.searchParams.get('userId'));
      const payload = parseSaveWritingDocumentRequest(requestBody);

      return createJsonResponse(
        200,
        mapWritingDocument(
          await app.writing.saveProjectDocument({
            actorSpaceId: spaceId,
            actorUserId,
            citations: payload.citations,
            content: payload.content,
            projectId,
            spaceId,
            title: payload.title,
          }),
        ),
      );
    }

    if (pathname === '/api/spaces' && method === 'GET') {
      const spaces = await app.spaces.listSpaces(nativeDemoFixture.actorUserId);
      return createJsonResponse(200, {
        spaces: spaces.map(mapDemoSpaceRecord),
      } satisfies DemoSpaceListResponse);
    }

    if (pathname === '/api/spaces' && method === 'POST') {
      const body = requestBody as CreateSpaceRequest | undefined;

      if (!body?.name?.trim() || !body.kind) {
        throw new Error('name and kind are required.');
      }

      const createdSpace = await app.spaces.createSpace(
        {
          description: body.description,
          kind: body.kind,
          name: body.name.trim(),
        },
        nativeDemoFixture.actorUserId,
      );

      return createJsonResponse(201, {
        space: mapDemoSpaceRecord(createdSpace),
      } satisfies DemoSpaceResponse);
    }

    const governedSummaryMatch = matchPath(pathname, /^\/api\/spaces\/([^/]+)\/governed-summary$/);

    if (governedSummaryMatch && method === 'GET') {
      const [spaceId] = governedSummaryMatch;
      return createJsonResponse(
        200,
        await mapGovernedJobResponse(app, nativeDemoFixture.actorUserId, spaceId),
      );
    }

    if (governedSummaryMatch && method === 'POST') {
      const [spaceId] = governedSummaryMatch;
      const credential = await app.credentials.createCredential({
        provider: nativeDemoFixture.credentialProvider,
        rawSecret: 'demo-governed-summary-secret',
        userId: nativeDemoFixture.actorUserId,
      });
      const job = await app.jobs.createJob({
        credentialRef: credential.credentialRef,
        kind: nativeDemoFixture.jobKind,
        payload: {
          prompt: 'Summarize the shared tumor-board evidence trail.',
        },
        requestedByUserId: nativeDemoFixture.actorUserId,
        spaceId,
      });

      await app.jobs.runJob({
        actorSpaceId: spaceId,
        actorUserId: nativeDemoFixture.actorUserId,
        jobId: job.id,
      });

      return createJsonResponse(
        200,
        await mapGovernedJobResponse(app, nativeDemoFixture.actorUserId, spaceId),
      );
    }

    const importMatch = matchPath(pathname, /^\/api\/spaces\/([^/]+)\/import$/);

    if (importMatch && method === 'POST') {
      const [spaceId] = importMatch;
      const body = requestBody as ImportRequestBody | undefined;

      if (!body?.sourceLocator || !body.sourceType) {
        throw new Error('sourceLocator and sourceType are required.');
      }

      return createJsonResponse(
        201,
        await app.imports.importPaper({
          requestedByUserId: nativeDemoFixture.actorUserId,
          sourceLocator: body.sourceLocator,
          sourceType: body.sourceType,
          spaceId,
          visibility: body.visibility ?? nativeDemoFixture.visibility,
        }),
      );
    }

    const libraryListMatch = matchPath(pathname, /^\/api\/spaces\/([^/]+)\/projects\/([^/]+)\/library$/);

    if (libraryListMatch && method === 'GET') {
      const [spaceId] = libraryListMatch;
      const entries = await app.library.listEntries({
        actorSpaceId: spaceId,
        actorUserId: nativeDemoFixture.actorUserId,
        spaceId,
      });

      return createJsonResponse(200, {
        entries: entries.map(({ asset, entry }) => ({
          addedAt: entry.addedAt,
          canonicalId: asset.canonicalId,
          entryId: entry.id,
          paperAssetId: entry.paperAssetId,
          spaceId: entry.spaceId,
          title: asset.title,
          visibility: entry.visibility,
        })),
      } satisfies LibraryListResponse);
    }

    const libraryEntryMatch = matchPath(pathname, /^\/api\/library\/([^/]+)$/);

    if (libraryEntryMatch && method === 'GET') {
      const [entryId] = libraryEntryMatch;
      const actorSpaceId = getActorSpaceId(requestUrl);
      const entry = await app.library.getEntry({
        actorSpaceId,
        actorUserId: nativeDemoFixture.actorUserId,
        entryId,
      });

      if (!entry) {
        return createJsonResponse(404, { error: 'Library entry not found.' });
      }

      return createJsonResponse(200, entry);
    }

    const publishMatch = matchPath(pathname, /^\/api\/writing\/([^/]+)\/publish$/);

    if (publishMatch && method === 'POST') {
      const [documentId] = publishMatch;
      const body = requestBody as PublishDocumentRequestBody | undefined;
      const actorSpaceId = getActorSpaceId(requestUrl);
      const actorUserId = resolveRouteActorUserId(
        actorSpaceId,
        requestUrl.searchParams.get('userId'),
      );

      await app.writing.transitionPublishState({
        actorSpaceId,
        actorUserId,
        docId: documentId,
        publishState: body?.publishState ?? 'published',
      });

      const document = await app.writing.getDocument({
        actorSpaceId,
        actorUserId,
        projectId: nativeDemoFixture.projectId,
        spaceId: actorSpaceId,
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
