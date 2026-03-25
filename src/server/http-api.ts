import {
  type AiWorkspaceAttachmentView,
  type AiWorkspaceResponse,
} from '@shared/contracts/ai-workspace';
import {
  DEFAULT_DISCOVERY_PAGE,
  DEFAULT_DISCOVERY_PAGE_SIZE,
  MAX_DISCOVERY_PAGE_SIZE,
} from '@shared/contracts/discovery';
import type {
  DiscoveryBoard,
  DiscoverySearchRequest,
  DiscoverySearchResponse,
  DiscoveryTodayResponse,
  TodayRecommendation,
} from '@shared/contracts/discovery';
import type { EvidenceSpanRecord } from '@shared/contracts/evidence';
import type { GovernedJobResponse } from '@shared/contracts/jobs';
import type {
  ImportSourceType,
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
  WorkbenchProjectSummary,
  WorkbenchRecentImport,
  WorkbenchResumeTarget,
  WorkbenchSummaryResponse,
} from '@shared/contracts/workbench';
import type {
  NotebookDetailResponse,
  NotebookDocumentResponse,
  NotebookListResponse,
  NotebookSummaryView as NotebookRouteView,
} from '@shared/contracts/notebook';
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

interface SaveNotebookDocumentRequestBody {
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

function parseSaveNotebookDocumentRequest(
  requestBody: unknown,
): Required<SaveNotebookDocumentRequestBody> {
  if (!requestBody || typeof requestBody !== 'object' || Array.isArray(requestBody)) {
    throw new Error('Notebook document payload must be a JSON object.');
  }

  const { content, title } = requestBody as Record<string, unknown>;

  if (typeof content !== 'string') {
    throw new Error('content is required.');
  }

  if (typeof title !== 'string' || !title.trim()) {
    throw new Error('title is required.');
  }

  return {
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
  function deriveLibrarySource(canonicalId: string): {
    sourceLabel: string;
    sourceType: ImportSourceType;
  } {
    const [rawPrefix] = canonicalId.split(':');

    switch (rawPrefix) {
      case 'pmid':
        return { sourceLabel: 'PubMed', sourceType: 'pmid' };
      case 'doi':
        return { sourceLabel: 'DOI', sourceType: 'doi' };
      case 'arxiv':
        return { sourceLabel: 'arXiv', sourceType: 'arxiv' };
      default:
        return { sourceLabel: 'Uploaded file', sourceType: 'upload' };
    }
  }

  return {
    entries: entries.map(({ asset, entry }) => ({
      abstractText: asset.abstractText,
      addedAt: entry.addedAt,
      canonicalId: asset.canonicalId,
      createdAt: asset.createdAt,
      entryId: entry.id,
      paperAssetId: entry.paperAssetId,
      ...deriveLibrarySource(asset.canonicalId),
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

function parsePositiveIntegerParam(
  value: string | null,
  fallback: number,
  options?: { max?: number },
): number {
  const parsed = Number.parseInt(value ?? '', 10);

  if (!Number.isFinite(parsed) || parsed < 1) {
    return fallback;
  }

  if (typeof options?.max === 'number') {
    return Math.min(options.max, parsed);
  }

  return parsed;
}

function resolveDiscoverySearchRequest(requestUrl: URL): DiscoverySearchRequest {
  return {
    page: parsePositiveIntegerParam(
      requestUrl.searchParams.get('page'),
      DEFAULT_DISCOVERY_PAGE,
    ),
    pageSize: parsePositiveIntegerParam(
      requestUrl.searchParams.get('pageSize'),
      DEFAULT_DISCOVERY_PAGE_SIZE,
      { max: MAX_DISCOVERY_PAGE_SIZE },
    ),
    query:
      requestUrl.searchParams.get('query')?.trim() ||
      requestUrl.searchParams.get('q')?.trim() ||
      '',
  };
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

function buildDemoAiAttachment(entryId: string): AiWorkspaceAttachmentView {
  switch (entryId) {
    case 'entry-1':
      return {
        canonicalId: 'pmid:654321',
        entryId,
        paperAssetId: 'asset-1',
        title: 'Tumor board biomarkers for rapid review',
      };
    case 'entry-2':
      return {
        canonicalId: 'pmid:222222',
        entryId,
        paperAssetId: 'asset-2',
        title: 'Signal pathway evidence for review escalation',
      };
    default:
      return {
        canonicalId: `demo:${entryId}`,
        entryId,
        paperAssetId: `asset-${entryId}`,
        title: `Imported paper context for ${entryId}`,
      };
  }
}

function buildDemoAiWorkspaceResponse(requestUrl: URL): AiWorkspaceResponse {
  const entryId = requestUrl.searchParams.get('entryId')?.trim();

  if (entryId) {
    return {
      workspace: {
        activeSessionId: 'session-reader-dock',
        sessions: [
          {
            attachedEntries: [buildDemoAiAttachment(entryId)],
            createdAt: '2026-03-25T09:00:00.000Z',
            id: 'session-reader-dock',
            summary: 'Dock the active AI conversation beside Reader without making Reader own it.',
            title: 'Reader docking session',
            updatedAt: '2026-03-25T09:10:00.000Z',
          },
        ],
      },
    } satisfies AiWorkspaceResponse;
  }

  return {
    workspace: {
      activeSessionId: 'session-1',
      sessions: [
        {
          attachedEntries: [buildDemoAiAttachment('entry-1'), buildDemoAiAttachment('entry-2')],
          createdAt: '2026-03-25T09:00:00.000Z',
          id: 'session-1',
          summary: 'Hold one governed conversation across multiple imported papers.',
          title: 'Cross-paper biomarker synthesis',
          updatedAt: '2026-03-25T09:20:00.000Z',
        },
        {
          attachedEntries: [],
          createdAt: '2026-03-25T08:00:00.000Z',
          id: 'session-2',
          summary: 'Keep a separate drafting conversation outside the reader route.',
          title: 'Draft introduction notes',
          updatedAt: '2026-03-25T08:40:00.000Z',
        },
      ],
    },
  } satisfies AiWorkspaceResponse;
}

function toWritingDocumentResponse(
  document: NonNullable<Awaited<ReturnType<JixiaApp['writing']['getDocument']>>>,
): WritingDocumentResponse {
  return { document };
}

function toNotebookDocumentResponse(
  document: Awaited<ReturnType<JixiaApp['notebook']['getDocument']>>,
): NotebookDocumentResponse {
  return { document };
}

function humanizeProjectId(projectId: string): string {
  const label = projectId.replace(/-/g, ' ');

  return label.charAt(0).toUpperCase() + label.slice(1);
}

function buildProjectWorkbenchPath(projectId: string, spaceId: string, suffix = ''): string {
  const basePath = suffix ? `/projects/${projectId}/${suffix}` : `/projects/${projectId}`;

  if (spaceId === nativeDemoFixture.sharedSpaceId) {
    return basePath;
  }

  return `${basePath}?spaceId=${encodeURIComponent(spaceId)}`;
}

function buildNotebookReaderPath(
  entryId: string,
  spaceId: string,
  projectId?: string,
): string {
  if (!projectId) {
    return `/library/${entryId}/reader`;
  }

  return buildProjectWorkbenchPath(projectId, spaceId, `library/${entryId}/reader`);
}

function buildNotebookWorkspacePath(spaceId: string, projectId?: string): string {
  if (!projectId) {
    return '/library';
  }

  return buildProjectWorkbenchPath(projectId, spaceId);
}

function derivePersonalNotebookTitle(paperTitle: string): string {
  const words = paperTitle.trim().split(/\s+/).filter(Boolean);

  if (words.length === 0) {
    return 'Personal notebook';
  }

  return `${words.slice(0, 2).join(' ')} notebook`;
}

function latestNotebookActivityTimestamp(
  entryAddedAt: string,
  notes: Awaited<ReturnType<JixiaApp['notebook']['listNotes']>>,
): string {
  return notes.reduce(
    (latestTimestamp, note) =>
      note.createdAt.localeCompare(latestTimestamp) > 0 ? note.createdAt : latestTimestamp,
    entryAddedAt,
  );
}

function upsertNotebookSummary(
  summaries: Map<string, NotebookRouteView>,
  summary: NotebookRouteView,
): void {
  const existing = summaries.get(summary.notebookId);

  if (!existing) {
    summaries.set(summary.notebookId, summary);
    return;
  }

  if (!existing.projectId && summary.projectId) {
    summaries.set(summary.notebookId, summary);
    return;
  }

  if (summary.updatedAt.localeCompare(existing.updatedAt) > 0) {
    summaries.set(summary.notebookId, summary);
  }
}

async function buildNotebookSummaryForEntry(
  app: JixiaApp,
  actorUserId: string,
  item: Awaited<ReturnType<JixiaApp['library']['listPersonalEntries']>>[number],
  options?: {
    projectDocsPath?: string;
    projectId?: string;
    title?: string;
    workspaceLabel?: string;
  },
): Promise<NotebookRouteView> {
  const notebook =
    app.notebook.getNotebookByPaperAsset({
      ownerUserId: actorUserId,
      paperAssetId: item.asset.id,
    }) ??
    (await app.notebook.getNotebookForLibraryEntry({
      libraryEntryId: item.entry.id,
      ownerUserId: actorUserId,
    }));
  const notes = await app.notebook.listNotes({
    libraryEntryId: item.entry.id,
    ownerUserId: actorUserId,
  });
  const existingDocument = app.notebook.findDocument({
    actorUserId,
    notebookId: notebook.id,
  });

  return {
    entryId: item.entry.id,
    noteCount: notes.length,
    notebookId: notebook.id,
    notesPath: `/notebooks/${notebook.id}`,
    paperAssetId: item.asset.id,
    paperTitle: item.asset.title,
    projectDocsPath: options?.projectDocsPath,
    projectId: options?.projectId,
    readerPath: buildNotebookReaderPath(item.entry.id, item.entry.spaceId, options?.projectId),
    spaceId: item.entry.spaceId,
    title: existingDocument?.title ?? options?.title ?? derivePersonalNotebookTitle(item.asset.title),
    updatedAt:
      existingDocument?.latestSnapshot?.capturedAt ??
      latestNotebookActivityTimestamp(item.entry.addedAt, notes),
    workspaceLabel: options?.workspaceLabel ?? 'Personal library',
    workspacePath: buildNotebookWorkspacePath(item.entry.spaceId, options?.projectId),
  };
}

async function buildNotebookInventory(
  app: JixiaApp,
  actorUserId: string,
): Promise<NotebookRouteView[]> {
  const summaries = new Map<string, NotebookRouteView>();
  const personalEntries = await app.library.listPersonalEntries(actorUserId);

  for (const item of personalEntries) {
    upsertNotebookSummary(summaries, await buildNotebookSummaryForEntry(app, actorUserId, item));
  }

  const spaces = await app.spaces.listSpaces(actorUserId);

  for (const space of spaces.filter((candidate) => candidate.kind === 'shared')) {
    const projectId = nativeDemoFixture.projectId;
    const projectDocument = await app.writing.getDocument({
      actorSpaceId: space.id,
      actorUserId,
      projectId,
      spaceId: space.id,
    });
    const entries = await app.library.listEntries({
      actorSpaceId: space.id,
      actorUserId,
      spaceId: space.id,
    });

    for (const item of entries) {
      upsertNotebookSummary(
        summaries,
        await buildNotebookSummaryForEntry(app, actorUserId, item, {
          projectDocsPath: projectDocument
            ? buildProjectWorkbenchPath(projectId, space.id, `writing/${projectDocument.documentId}`)
            : undefined,
          projectId,
          title: `${humanizeProjectId(projectId)} synthesis notebook`,
          workspaceLabel: `${humanizeProjectId(projectId)} workspace`,
        }),
      );
    }
  }

  return Array.from(summaries.values()).sort((left, right) =>
    right.updatedAt.localeCompare(left.updatedAt) || left.title.localeCompare(right.title),
  );
}

async function buildNotebookDetail(
  app: JixiaApp,
  actorUserId: string,
  notebookId: string,
): Promise<NotebookRouteView | null> {
  const notebooks = await buildNotebookInventory(app, actorUserId);

  return notebooks.find((candidate) => candidate.notebookId === notebookId) ?? null;
}

async function buildWorkbenchSummary(app: JixiaApp): Promise<WorkbenchSummaryResponse> {
  const spaces = await app.spaces.listSpaces(nativeDemoFixture.actorUserId);
  const sharedSpaces = spaces.filter((space) => space.kind === 'shared');
  const recentProjects: WorkbenchProjectSummary[] = [];
  const recentImports: WorkbenchRecentImport[] = [];
  const resumeTargets: WorkbenchResumeTarget[] = [];

  for (const space of sharedSpaces) {
    const entries = await app.library.listEntries({
      actorSpaceId: space.id,
      actorUserId: nativeDemoFixture.actorUserId,
      spaceId: space.id,
    });
    const sortedEntries = [...entries].sort((left, right) =>
      right.entry.addedAt.localeCompare(left.entry.addedAt),
    );
    const latestEntry = sortedEntries[0] ?? null;
    const projectDocument = await app.writing.getDocument({
      actorSpaceId: space.id,
      actorUserId: nativeDemoFixture.actorUserId,
      projectId: nativeDemoFixture.projectId,
      spaceId: space.id,
    });

    recentProjects.push({
      activeNotebookCount: sortedEntries.length,
      documentId: projectDocument?.documentId,
      entryCount: sortedEntries.length,
      projectId: nativeDemoFixture.projectId,
      recentActivity: latestEntry
        ? `Recent activity · Imported ${latestEntry.asset.title}`
        : 'Recent activity · Shared project workspace is ready for new evidence.',
      spaceId: space.id,
      title: `${humanizeProjectId(nativeDemoFixture.projectId)} workspace`,
    });

    for (const { asset, entry } of sortedEntries) {
      recentImports.push({
        addedAt: entry.addedAt,
        canonicalId: asset.canonicalId,
        entryId: entry.id,
        projectId: nativeDemoFixture.projectId,
        spaceId: space.id,
        title: asset.title,
        to: buildProjectWorkbenchPath(nativeDemoFixture.projectId, space.id, 'library'),
      });
    }

    if (latestEntry) {
      resumeTargets.push({
        description:
          'Reopen the private notebook document linked to the active tumor board paper.',
        kind: 'notebook',
        title: 'Resume notebook',
        to: buildProjectWorkbenchPath(
          nativeDemoFixture.projectId,
          space.id,
          `library/${latestEntry.entry.id}/notes`,
        ),
      });
    }

    if (projectDocument) {
      resumeTargets.push({
        description: 'Reopen the shared draft where notebook evidence is projected into project writing.',
        kind: 'project-doc',
        title: 'Open project docs',
        to: buildProjectWorkbenchPath(
          nativeDemoFixture.projectId,
          space.id,
          `writing/${projectDocument.documentId}`,
        ),
      });
    }
  }

  recentProjects.sort((left, right) => right.spaceId.localeCompare(left.spaceId));
  recentImports.sort((left, right) => right.addedAt.localeCompare(left.addedAt));

  return {
    recentImports,
    recentProjects,
    resumeTargets,
  };
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
      const searchRequest = resolveDiscoverySearchRequest(requestUrl);
      const searchResult = searchRequest.query
        ? await app.imports.searchDiscoveryPage(searchRequest)
        : {
            hasNextPage: false,
            items: [],
            page: searchRequest.page ?? DEFAULT_DISCOVERY_PAGE,
            pageSize: searchRequest.pageSize ?? DEFAULT_DISCOVERY_PAGE_SIZE,
            query: searchRequest.query,
            total: 0,
          };
      const items = await markImportedDiscoveryItems(app, searchResult.items);

      return createJsonResponse(200, {
        boards: toDiscoveryBoards(items),
        hasNextPage: searchResult.hasNextPage,
        items,
        page: searchResult.page,
        pageSize: searchResult.pageSize,
        query: searchResult.query,
        total: searchResult.total,
      } satisfies DiscoverySearchResponse);
    }

    if ((method === 'GET' || method === 'HEAD') && pathname === '/api/workbench/summary') {
      return createJsonResponse(200, await buildWorkbenchSummary(app));
    }

    if ((method === 'GET' || method === 'HEAD') && pathname === '/api/ai/workspace') {
      return createJsonResponse(200, buildDemoAiWorkspaceResponse(requestUrl));
    }

    if ((method === 'GET' || method === 'HEAD') && pathname === '/api/notebooks') {
      const actorUserId = requestUrl.searchParams.get('userId')?.trim() || DEFAULT_WORKBENCH_USER_ID;

      return createJsonResponse(200, {
        notebooks: await buildNotebookInventory(app, actorUserId),
      } satisfies NotebookListResponse);
    }

    const notebookDetailMatch = pathname.match(/^\/api\/notebooks\/([^/]+)$/);
    const notebookDocumentMatch = pathname.match(/^\/api\/notebooks\/([^/]+)\/document$/);

    if (notebookDocumentMatch && (method === 'GET' || method === 'HEAD')) {
      const actorUserId = requestUrl.searchParams.get('userId')?.trim() || DEFAULT_WORKBENCH_USER_ID;
      const notebookId = decodePathSegment(notebookDocumentMatch[1]);
      const document = await app.notebook.getDocument({
        actorUserId,
        notebookId,
      });

      return createJsonResponse(200, toNotebookDocumentResponse(document));
    }

    if (notebookDocumentMatch && method === 'POST') {
      const actorUserId = requestUrl.searchParams.get('userId')?.trim() || DEFAULT_WORKBENCH_USER_ID;
      const notebookId = decodePathSegment(notebookDocumentMatch[1]);
      const payload = parseSaveNotebookDocumentRequest(requestBody);

      return createJsonResponse(
        200,
        toNotebookDocumentResponse(
          await app.notebook.saveDocument({
            actorUserId,
            content: payload.content,
            notebookId,
            title: payload.title,
          }),
        ),
      );
    }

    if (notebookDetailMatch && (method === 'GET' || method === 'HEAD')) {
      const actorUserId = requestUrl.searchParams.get('userId')?.trim() || DEFAULT_WORKBENCH_USER_ID;
      const notebookId = decodePathSegment(notebookDetailMatch[1]);
      const notebook = await buildNotebookDetail(app, actorUserId, notebookId);

      if (!notebook) {
        return createJsonResponse(404, { error: 'Notebook not found.' });
      }

      return createJsonResponse(200, { notebook } satisfies NotebookDetailResponse);
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
          actorUserId: DEFAULT_WORKBENCH_USER_ID,
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
      const explicitUserId = payload.userId ?? requestUrl.searchParams.get('userId');
      const actorUserId =
        payload.sourceType === 'notebook-note' &&
        actorSpaceId === nativeDemoFixture.sharedSpaceId &&
        typeof explicitUserId !== 'string'
          ? DEFAULT_WORKBENCH_USER_ID
          : resolveRouteActorUserId(actorSpaceId, explicitUserId);
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

      return createJsonResponse(200, toLibraryListResponse(entries));
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
