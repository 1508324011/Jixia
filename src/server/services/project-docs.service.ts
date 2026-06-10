import type {
  DocumentBlock,
  DocumentBlockDocument,
  DocumentBlockReference,
} from '@shared/contracts/document-content';
import {
  createEmptyDocumentBlockDocument,
  documentBlockDocumentToLegacyText,
  extractDocumentBlockReferences,
  legacyTextToDocumentBlockDocument,
  normalizeDocumentBlockDocument,
  normalizePersistedDocumentSnapshot,
  serializeDocumentBlockSnapshotPayload,
} from '@shared/contracts/document-content';
import type {
  AdoptNotebookIntoProjectDocRequest,
  AdoptNotebookIntoProjectDocResponse,
  CreateProjectDocAiSuggestionRequest,
  CreateProjectDocAiSuggestionResponse,
  CreateProjectDocRequest,
  ProjectDocCitationLocatorSource,
  ProjectDocCitationOccurrence,
  ProjectDocNotebookAdoptionProvenance,
  ProjectDocAiSuggestion,
  ProjectDocAiSuggestionCitation,
  ProjectDocCitationTraceResponse,
  ProjectDocCitationTraceRow,
  ProjectDocCitationSourceUnavailableDetails,
  ProjectDocCitationRecord,
  ProjectDocLookup,
  ProjectDocRecord,
  ProjectDocSnapshot,
} from '@shared/contracts/project-docs';
import type { ReferenceLifecycleStatus } from '@shared/contracts/reader-annotations';
import type { SourceTextRangeLocator } from '@shared/contracts/source-text';
import {
  PROJECT_DOC_AI_SUGGESTION_JOB_KIND,
  PROJECT_DOC_CITATION_SOURCE_UNAVAILABLE,
} from '@shared/contracts/project-docs';
import type { CreateJobRequest, JobRecord } from '@shared/contracts/jobs';
import type { WritingDocumentView, WritingDocSnapshot } from '@shared/contracts/writing';

import type {
  LibraryRepository,
  NotebookRepository,
  ProjectDocRepository,
  ProjectRepository,
  ReadingRepository,
} from '../../db';

import type { LibraryService } from './library.service';
import type { ReadingService } from './reading.service';

export interface SaveProjectDocRequest {
  citations: ProjectDocCitationInput[];
  content?: string;
  documentId: string;
  documentContent?: DocumentBlockDocument;
}

export interface TransitionProjectDocPublishStateRequest {
  documentId: string;
  publishState: ProjectDocRecord['publishState'];
}

export interface ProjectDocsService {
  createDocument(
    input: CreateProjectDocRequest,
    actorUserId: string,
  ): Promise<ProjectDocRecord>;
  /**
   * @deprecated Legacy/internal compatibility ingestion only. Product UI must
   * use selected Reader evidence plus project-visible citations/references.
   */
  adoptNotebook(
    input: ProjectDocLookup & AdoptNotebookIntoProjectDocRequest,
    actorUserId: string,
  ): Promise<AdoptNotebookIntoProjectDocResponse>;
  createAiSuggestion(
    input: ProjectDocLookup & CreateProjectDocAiSuggestionRequest,
    actorUserId: string,
  ): Promise<CreateProjectDocAiSuggestionResponse>;
  findLatestProjectDocument(
    projectId: string,
    actorUserId: string,
  ): Promise<ProjectDocRecord | null>;
  getDocument(
    query: ProjectDocLookup,
    actorUserId: string,
  ): Promise<ProjectDocSnapshot>;
  getCitationTrace(
    query: ProjectDocLookup,
    actorUserId: string,
  ): Promise<ProjectDocCitationTraceResponse>;
  saveDocument(
    input: SaveProjectDocRequest,
    actorUserId: string,
  ): Promise<ProjectDocSnapshot>;
  getWorkbenchDocument(
    projectId: string,
    actorUserId: string,
  ): Promise<WritingDocumentView | null>;
  saveWorkbenchDocument(
    input: {
      citations: ProjectDocCitationInput[];
      content?: string;
      documentContent?: DocumentBlockDocument;
      projectId: string;
      title: string;
    },
    actorUserId: string,
  ): Promise<WritingDocumentView>;
  transitionPublishState(
    input: TransitionProjectDocPublishStateRequest,
    actorUserId: string,
  ): Promise<ProjectDocRecord>;
}

export interface ProjectDocsStore {
  jobs: ProjectDocSuggestionJobCreator;
  libraryRepository: LibraryRepository;
  libraryService: LibraryService;
  notebookRepository: NotebookRepository;
  projectDocRepository: ProjectDocRepository;
  projectRepository: ProjectRepository;
  readingRepository: Pick<ReadingRepository, 'getReaderExcerpt'>;
  readingService: Pick<ReadingService, 'getReaderExcerptSource'>;
}

export interface ProjectDocSuggestionJobCreator {
  createJob(input: CreateJobRequest, actorUserId: string): Promise<JobRecord>;
}

export interface ProjectDocCitationInput {
  evidenceSpan?: string;
  libraryEntryId?: string;
  lifecycleStatus?: ReferenceLifecycleStatus;
  locator?: SourceTextRangeLocator;
  locatorSource?: ProjectDocCitationLocatorSource;
  occurrence?: ProjectDocCitationOccurrence;
  paperAssetId: string;
  readerAnnotationId?: string;
  readerExcerptId?: string;
  sourceTextArtifactId?: string;
  target?: {
    libraryEntryId: string;
    paperAssetId: string;
  };
}

export class ProjectDocCitationSourceUnavailableError extends Error {
  readonly code = PROJECT_DOC_CITATION_SOURCE_UNAVAILABLE;
  readonly details: ProjectDocCitationSourceUnavailableDetails;

  constructor(details: ProjectDocCitationSourceUnavailableDetails) {
    super(
      `Paper asset ${details.paperAssetId} is not available in project ${details.projectId}.`,
    );
    this.name = 'ProjectDocCitationSourceUnavailableError';
    this.details = details;
  }
}

function mapCitation(citation: {
  createdAt: string;
  evidenceSpan?: string;
  id: string;
  lifecycleStatus?: ReferenceLifecycleStatus;
  locator?: SourceTextRangeLocator;
  locatorSource?: ProjectDocCitationLocatorSource;
  occurrence?: ProjectDocCitationOccurrence;
  paperAssetId: string;
  projectDocVersionId: string;
  readerAnnotationId?: string;
  readerExcerptId?: string;
  sourceTextArtifactId?: string;
  target?: ProjectDocCitationRecord['target'];
  targetLibraryEntryId?: string;
}): ProjectDocCitationRecord {
  return {
    createdAt: citation.createdAt,
    evidenceSpan: citation.evidenceSpan,
    id: citation.id,
    lifecycleStatus: citation.lifecycleStatus,
    locator: citation.locator,
    locatorSource: citation.locatorSource,
    occurrence: citation.occurrence,
    paperAssetId: citation.paperAssetId,
    projectDocVersionId: citation.projectDocVersionId,
    readerAnnotationId: citation.readerAnnotationId,
    readerExcerptId: citation.readerExcerptId,
    sourceTextArtifactId: citation.sourceTextArtifactId,
    target: citation.target,
    targetLibraryEntryId: citation.targetLibraryEntryId,
  };
}

function mapDocument(document: {
  createdAt: string;
  createdByUserId: string;
  id: string;
  projectId: string;
  publishState: ProjectDocRecord['publishState'];
  title: string;
  updatedAt: string;
}): ProjectDocRecord {
  return {
    createdAt: document.createdAt,
    createdByUserId: document.createdByUserId,
    id: document.id,
    projectId: document.projectId,
    publishState: document.publishState,
    title: document.title,
    updatedAt: document.updatedAt,
  };
}

function mapSnapshot(snapshot: {
    capturedAt: string;
    citations: Array<{
      createdAt: string;
      evidenceSpan?: string;
      id: string;
      lifecycleStatus?: ReferenceLifecycleStatus;
      locator?: SourceTextRangeLocator;
      locatorSource?: ProjectDocCitationLocatorSource;
      occurrence?: ProjectDocCitationOccurrence;
      paperAssetId: string;
      projectDocVersionId: string;
      readerAnnotationId?: string;
      readerExcerptId?: string;
      sourceTextArtifactId?: string;
      target?: ProjectDocCitationRecord['target'];
      targetLibraryEntryId?: string;
    }>;
  content: string;
  document: {
    createdAt: string;
    createdByUserId: string;
    id: string;
    projectId: string;
    publishState: ProjectDocRecord['publishState'];
    title: string;
    updatedAt: string;
  };
  versionId: string;
  versionNumber: number;
}): ProjectDocSnapshot {
  const documentContent = normalizePersistedDocumentSnapshot(snapshot.content);

  return {
    capturedAt: snapshot.capturedAt,
    citations: snapshot.citations.map(mapCitation),
    content: documentBlockDocumentToLegacyText(documentContent),
    document: mapDocument(snapshot.document),
    documentContent,
    versionId: snapshot.versionId,
    versionNumber: snapshot.versionNumber,
  };
}

function mapNotebookSnapshot(snapshot: {
  capturedAt: string;
  citations: Array<{
    createdAt: string;
    evidenceSpan?: string;
    id: string;
    notebookDocumentVersionId: string;
    paperAssetId: string;
    readerExcerptId?: string;
  }>;
  content: string;
  document: {
    createdAt: string;
    id: string;
    ownerId: string;
    title: string;
    updatedAt: string;
  };
  versionId: string;
  versionNumber: number;
}): {
  capturedAt: string;
  citations: Array<{
    evidenceSpan?: string;
    paperAssetId: string;
    readerExcerptId?: string;
  }>;
  content: string;
  documentContent: DocumentBlockDocument;
  documentId: string;
  title: string;
  versionId: string;
  versionNumber: number;
} {
  const documentContent = normalizePersistedDocumentSnapshot(snapshot.content);

  return {
    capturedAt: snapshot.capturedAt,
    citations: snapshot.citations.map((citation) => ({
      evidenceSpan: citation.evidenceSpan,
      paperAssetId: citation.paperAssetId,
      readerExcerptId: citation.readerExcerptId,
    })),
    content: documentBlockDocumentToLegacyText(documentContent),
    documentContent,
    documentId: snapshot.document.id,
    title: snapshot.document.title,
    versionId: snapshot.versionId,
    versionNumber: snapshot.versionNumber,
  };
}

function mapWritingSnapshot(
  snapshot: ProjectDocSnapshot,
  projectId: string,
  spaceId: string,
): WritingDocSnapshot {
  return {
    capturedAt: snapshot.capturedAt,
    citations: snapshot.citations.map((citation) => ({
      docVersionId: citation.projectDocVersionId,
      evidenceSpan: citation.evidenceSpan,
      id: citation.id,
      paperAssetId: citation.paperAssetId,
      readerExcerptId: citation.readerExcerptId,
    })),
    content: snapshot.content,
    documentContent: snapshot.documentContent,
    doc: {
      createdAt: snapshot.document.createdAt,
      id: snapshot.document.id,
      projectId,
      publishState: snapshot.document.publishState,
      spaceId,
      title: snapshot.document.title,
      updatedAt: snapshot.document.updatedAt,
    },
    docVersionId: snapshot.versionId,
    versionNumber: snapshot.versionNumber,
  };
}

function createEmptySnapshot(document: ProjectDocRecord): ProjectDocSnapshot {
  return {
    capturedAt: document.updatedAt,
    citations: [],
    content: '',
    document,
    documentContent: createEmptyDocumentBlockDocument(),
    versionId: `project-doc:${document.id}:version-0`,
    versionNumber: 0,
  };
}

function normalizeSaveDocumentContent(input: {
  content?: string;
  documentContent?: DocumentBlockDocument;
}): DocumentBlockDocument {
  if (typeof input.documentContent !== 'undefined') {
    return normalizeDocumentBlockDocument(input.documentContent);
  }

  if (typeof input.content !== 'string') {
    throw new Error('content is required when documentContent is not provided.');
  }

  return legacyTextToDocumentBlockDocument(input.content);
}

function referenceToCitationInput(
  reference: DocumentBlockReference,
): ProjectDocCitationInput {
  return {
    evidenceSpan: reference.evidenceSpan,
    libraryEntryId: reference.libraryEntryId,
    paperAssetId: reference.paperAssetId,
    readerExcerptId: reference.readerExcerptId,
  };
}

function mergeCitationInputs(
  explicitCitations: ProjectDocCitationInput[],
  documentContent: DocumentBlockDocument,
): ProjectDocCitationInput[] {
  return [
    ...explicitCitations,
    ...extractDocumentBlockReferences(documentContent).map(referenceToCitationInput),
  ];
}

function dedupeNormalizedCitations(
  citations: NormalizedProjectDocReference[],
): NormalizedProjectDocReference[] {
  const byKey = new Map<string, NormalizedProjectDocReference & { evidenceSpans: string[] }>();

  for (const citation of citations) {
    const key = citation.occurrence?.key
      ? `occurrence:${citation.occurrence.key}`
      : citation.readerExcerptId
      ? `excerpt:${citation.readerExcerptId}`
      : `asset:${citation.paperAssetId}`;
    const record = byKey.get(key) ?? {
      evidenceSpans: [],
      paperAssetId: citation.paperAssetId,
      readerExcerptId: citation.readerExcerptId,
    };
    const evidenceSpan = citation.evidenceSpan?.trim();

    if (evidenceSpan && !record.evidenceSpans.includes(evidenceSpan)) {
      record.evidenceSpans.push(evidenceSpan);
    }

    byKey.set(key, {
      ...record,
      lifecycleStatus: record.lifecycleStatus ?? citation.lifecycleStatus,
      locator: record.locator ?? citation.locator,
      locatorSource: record.locatorSource ?? citation.locatorSource,
      occurrence: record.occurrence ?? citation.occurrence,
      readerAnnotationId: record.readerAnnotationId ?? citation.readerAnnotationId,
      sourceTextArtifactId: record.sourceTextArtifactId ?? citation.sourceTextArtifactId,
      target: record.target ?? citation.target,
      targetLibraryEntryId: record.targetLibraryEntryId ?? citation.targetLibraryEntryId,
    });
  }

  return [...byKey.values()].map(({ evidenceSpans, ...record }) => ({
    ...record,
    evidenceSpan: evidenceSpans.length
      ? evidenceSpans.join('\n\n')
      : undefined,
  }));
}

function mapWritingDocument(
  document: ProjectDocRecord,
  spaceId: string,
  latestSnapshot: ProjectDocSnapshot | null,
): WritingDocumentView {
  return {
    documentId: document.id,
    latestSnapshot: latestSnapshot
      ? mapWritingSnapshot(latestSnapshot, document.projectId, spaceId)
      : null,
    projectId: document.projectId,
    publishState: document.publishState,
    spaceId,
    title: document.title,
  };
}

function mapBrowserSafePaperAsset(
  asset: Awaited<ReturnType<LibraryRepository['findPaperAsset']>>,
): ProjectDocCitationTraceRow['paper'] {
  if (!asset) {
    return undefined;
  }

  return {
    abstractText: asset.abstractText,
    canonicalId: asset.canonicalId,
    createdAt: asset.createdAt,
    hasFile: Boolean(asset.storageKey),
    id: asset.id,
    title: asset.title,
  };
}

function boundedText(value: string | undefined, maxLength: number): string | undefined {
  const normalized = value?.replace(/\s+/g, ' ').trim();

  if (!normalized) {
    return undefined;
  }

  return normalized.length > maxLength
    ? `${normalized.slice(0, maxLength - 1)}…`
    : normalized;
}

function summarizeDocumentForAiContext(snapshot: ProjectDocSnapshot): string {
  const projection = boundedText(snapshot.content, 4000);

  if (projection) {
    return projection;
  }

  const documentContent = snapshot.documentContent ?? createEmptyDocumentBlockDocument();

  return documentContent.blocks
    .map((block) => {
      switch (block.type) {
        case 'heading':
        case 'paragraph':
        case 'quote':
        case 'todo':
          return block.text;
        case 'citation':
          return [block.label, block.evidenceSpan].filter(Boolean).join(' — ');
        case 'sourceExcerpt':
          return block.quote;
        case 'paperReference':
          return block.title ?? block.paperAssetId;
        case 'aiSuggestion':
          return block.text;
      }
    })
    .map((text) => boundedText(text, 500))
    .filter((text): text is string => Boolean(text))
    .join('\n\n')
    .slice(0, 4000);
}

function collectSuggestionCitationRows(
  trace: ProjectDocCitationTraceResponse,
  citationIds: string[] | undefined,
): ProjectDocCitationTraceRow[] {
  const requestedIds = new Set(
    citationIds
      ?.map((id) => id.trim())
      .filter((id) => id.length > 0),
  );

  if (requestedIds.size === 0) {
    return trace.citations;
  }

  return trace.citations.filter((row) => requestedIds.has(row.citationId));
}

function mapTraceRowToSuggestionCitation(
  row: ProjectDocCitationTraceRow,
): ProjectDocAiSuggestionCitation {
  return {
    citationId: row.citationId,
    evidenceSpan: row.readerExcerpt?.evidenceSpan ?? row.readerExcerpt?.quote ?? row.evidenceSpan,
    libraryEntryId: row.projectLibraryEntry?.libraryEntryId,
    locator: row.readerExcerpt?.locator,
    paperAssetId: row.paperAssetId,
    readerExcerptId: row.readerExcerptId,
    sourceState: row.source.state,
    title: row.paper?.title,
  };
}

function createSuggestionText(input: {
  documentSummary: string;
  instruction: string;
  selectedText?: string;
  citations: ProjectDocAiSuggestionCitation[];
}): string {
  const evidenceSnippets = input.citations
    .map((citation) => citation.evidenceSpan ?? citation.title)
    .filter((text): text is string => Boolean(text?.trim()))
    .slice(0, 3)
    .map((text) => boundedText(text, 220))
    .filter((text): text is string => Boolean(text));
  const basis = boundedText(input.selectedText, 600) ??
    boundedText(input.documentSummary, 600) ??
    'the latest saved Project Doc snapshot';
  const evidenceLine = evidenceSnippets.length
    ? ` Evidence considered: ${evidenceSnippets.join(' | ')}`
    : '';

  return `Evidence Copilot suggestion for: ${input.instruction.trim()}\n\n${basis}${evidenceLine}`;
}

function createProjectDocAiSuggestion(
  input: CreateProjectDocAiSuggestionRequest & {
    citations: ProjectDocAiSuggestionCitation[];
    documentSummary: string;
  },
): ProjectDocAiSuggestion {
  const primaryCitation = input.citations[0];
  const text = createSuggestionText({
    citations: input.citations,
    documentSummary: input.documentSummary,
    instruction: input.instruction,
    selectedText: input.selectedText,
  });
  const rationale = input.citations.length > 0
    ? 'Drafted from the latest saved Project Doc snapshot and server-authorized citation trace rows only.'
    : 'Drafted from the latest saved Project Doc snapshot only; no saved Project Doc citations were available for this request.';

  return {
    block: {
      evidenceSpan: primaryCitation?.evidenceSpan,
      libraryEntryId: primaryCitation?.libraryEntryId,
      locator: primaryCitation?.locator,
      paperAssetId: primaryCitation?.paperAssetId,
      rationale,
      readerExcerptId: primaryCitation?.readerExcerptId,
      status: 'proposed',
      targetBlockId: input.selectedBlockId,
      text,
      type: 'aiSuggestion',
    },
    citations: input.citations,
    rationale,
    text,
  };
}

function createProjectDocAiSuggestionPayload(input: {
  citationRows: ProjectDocCitationTraceRow[];
  document: ProjectDocRecord;
  documentSummary: string;
  instruction: string;
  selectedBlockId?: string;
  selectedText?: string;
  snapshot: ProjectDocSnapshot;
  suggestion: ProjectDocAiSuggestion;
}): Record<string, unknown> {
  return {
    citationIds: input.citationRows.map((row) => row.citationId),
    context: {
      citationTrace: input.citationRows.map((row) => ({
        citationId: row.citationId,
        evidenceSpan: boundedText(
          row.readerExcerpt?.evidenceSpan ?? row.readerExcerpt?.quote ?? row.evidenceSpan,
          1000,
        ),
        paperAssetId: row.paperAssetId,
        readerExcerpt: row.readerExcerpt
          ? {
              endOffset: row.readerExcerpt.endOffset,
              locator: row.readerExcerpt.locator,
              quote: boundedText(row.readerExcerpt.quote, 1000),
              source: row.readerExcerpt.source,
              sourceLibraryEntryId: row.readerExcerpt.sourceLibraryEntryId,
              startOffset: row.readerExcerpt.startOffset,
            }
          : undefined,
        source: row.source,
      })),
      document: {
        id: input.document.id,
        publishState: input.document.publishState,
        title: input.document.title,
      },
      latestSnapshot: {
        capturedAt: input.snapshot.capturedAt,
        content: input.documentSummary,
        versionId: input.snapshot.versionId,
        versionNumber: input.snapshot.versionNumber,
      },
      selectedBlockId: input.selectedBlockId,
      selectedText: boundedText(input.selectedText, 1000),
    },
    instruction: input.instruction.trim(),
    result: input.suggestion,
  };
}

async function resolveProjectScopedCitationTraceSource(
  store: ProjectDocsStore,
  input: {
    actorSpaceId: string;
    actorUserId: string;
    citation: ProjectDocCitationRecord;
    projectId: string;
  },
): Promise<Pick<ProjectDocCitationTraceRow, 'paper' | 'projectLibraryEntry' | 'source'>> {
  const projectScopedView = (
    await store.libraryRepository.listLibraryEntriesForAsset(input.citation.paperAssetId)
  ).find(
    (view) =>
      view.entry.scope.type === 'project' &&
      view.entry.scope.id === input.projectId,
  );

  if (!projectScopedView) {
    const existingAsset = await store.libraryRepository.findPaperAsset(
      input.citation.paperAssetId,
    );

    return {
      paper: undefined,
      projectLibraryEntry: undefined,
      source: {
        code: PROJECT_DOC_CITATION_SOURCE_UNAVAILABLE,
        details: {
          evidenceSpan: input.citation.evidenceSpan,
          paperAssetId: input.citation.paperAssetId,
          projectId: input.projectId,
          readerExcerptId: input.citation.readerExcerptId,
        },
        message: existingAsset
          ? `Paper asset ${input.citation.paperAssetId} is not available in project ${input.projectId}.`
          : `Paper asset ${input.citation.paperAssetId} does not exist.`,
        state: 'adoption_needed',
      },
    };
  }

  const authorizedView = await store.libraryService.assertCanAccessEntry(
    projectScopedView.entry.id,
    input.actorUserId,
    input.actorSpaceId,
  );

  if (
    authorizedView.entry.id !== projectScopedView.entry.id ||
    authorizedView.entry.scope.type !== 'project' ||
    authorizedView.entry.scope.id !== input.projectId ||
    authorizedView.asset.id !== input.citation.paperAssetId
  ) {
    return {
      paper: undefined,
      projectLibraryEntry: undefined,
      source: {
        code: PROJECT_DOC_CITATION_SOURCE_UNAVAILABLE,
        details: {
          evidenceSpan: input.citation.evidenceSpan,
          libraryEntryId: projectScopedView.entry.id,
          paperAssetId: input.citation.paperAssetId,
          projectId: input.projectId,
          readerExcerptId: input.citation.readerExcerptId,
        },
        message: `Paper asset ${input.citation.paperAssetId} is not available in project ${input.projectId}.`,
        state: 'adoption_needed',
      },
    };
  }

  return {
    paper: mapBrowserSafePaperAsset(authorizedView.asset),
    projectLibraryEntry: {
      libraryEntryId: authorizedView.entry.id,
      projectId: input.projectId,
    },
    source: { state: 'available' },
  };
}

async function resolveProjectDocCitationReaderExcerptTrace(
  store: ProjectDocsStore,
  input: {
    actorSpaceId: string;
    actorUserId: string;
    citation: ProjectDocCitationRecord;
  },
): Promise<ProjectDocCitationTraceRow['readerExcerpt']> {
  if (!input.citation.readerExcerptId) {
    return createProjectDocSnapshotEvidenceTrace(input.citation, 'project_library_asset');
  }

  function createProjectDocSnapshotEvidenceTrace(
    citation: ProjectDocCitationRecord,
    source: 'project_doc_snapshot' | 'project_library_asset',
  ): ProjectDocCitationTraceRow['readerExcerpt'] {
    if (!citation.evidenceSpan) {
      return undefined;
    }

    return {
      evidenceSpan: citation.evidenceSpan,
      id: source === 'project_library_asset'
        ? `project-doc-citation:${citation.id}:evidence-span`
        : citation.readerExcerptId ?? `project-doc-citation:${citation.id}:evidence-span`,
      quote: citation.evidenceSpan,
      source,
    };
  }

  try {
    const { excerpt, sourceEntry } = await store.readingService.getReaderExcerptSource({
      actorSpaceId: input.actorSpaceId,
      actorUserId: input.actorUserId,
      readerExcerptId: input.citation.readerExcerptId,
    });

    if (excerpt.paperAssetId !== input.citation.paperAssetId) {
      return createProjectDocSnapshotEvidenceTrace(
        input.citation,
        'project_doc_snapshot',
      );
    }

    return {
      endOffset: excerpt.endOffset,
      evidenceSpan: input.citation.evidenceSpan ?? excerpt.quote,
      id: excerpt.id,
      locator: excerpt.locator,
      quote: excerpt.quote,
      source: 'reader_source',
      sourceLibraryEntryId: sourceEntry.entry.scope.type === 'project'
        ? sourceEntry.entry.id
        : undefined,
      startOffset: excerpt.startOffset,
    };
  } catch (error) {
    if (!isAccessRestrictionError(error)) {
      throw error;
    }

    return createProjectDocSnapshotEvidenceTrace(
      input.citation,
      'project_doc_snapshot',
    );
  }
}

async function createProjectDocCitationTraceResponse(
  store: ProjectDocsStore,
  input: {
    actorSpaceId: string;
    actorUserId: string;
    snapshot: ProjectDocSnapshot;
  },
): Promise<ProjectDocCitationTraceResponse> {
  const citations: ProjectDocCitationTraceRow[] = [];

  for (const citation of input.snapshot.citations) {
    const [source, readerExcerpt] = await Promise.all([
      resolveProjectScopedCitationTraceSource(store, {
        actorSpaceId: input.actorSpaceId,
        actorUserId: input.actorUserId,
        citation,
        projectId: input.snapshot.document.projectId,
      }),
      resolveProjectDocCitationReaderExcerptTrace(store, {
        actorSpaceId: input.actorSpaceId,
        actorUserId: input.actorUserId,
        citation,
      }),
    ]);

    citations.push({
      citationId: citation.id,
      createdAt: citation.createdAt,
      evidenceSpan: citation.evidenceSpan,
      paper: source.paper,
      paperAssetId: citation.paperAssetId,
      projectDocVersionId: citation.projectDocVersionId,
      projectLibraryEntry: source.projectLibraryEntry,
      readerExcerpt,
      readerExcerptId: citation.readerExcerptId,
      source: source.source,
    });
  }

  return {
    capturedAt: input.snapshot.capturedAt,
    citations,
    document: input.snapshot.document,
    generatedAt: new Date().toISOString(),
    versionId: input.snapshot.versionId,
    versionNumber: input.snapshot.versionNumber,
  };
}

async function getAuthorizedProject(
  store: ProjectDocsStore,
  projectId: string,
  actorUserId: string,
): Promise<{
  membership: Awaited<ReturnType<ProjectRepository['getProjectMember']>>;
  project: NonNullable<Awaited<ReturnType<ProjectRepository['findProject']>>>;
}> {
  const membership = await store.projectRepository.getProjectMember(projectId, actorUserId);

  if (!membership) {
    throw new Error('Access denied for the requested project document.');
  }

  const project = await store.projectRepository.findProject(projectId);

  if (!project) {
    throw new Error(`Project ${projectId} does not exist.`);
  }

  return {
    membership,
    project,
  };
}

async function getAuthorizedProjectDoc(
  store: ProjectDocsStore,
  documentId: string,
  actorUserId: string,
): Promise<{
  canWrite: boolean;
  document: ProjectDocRecord;
  projectSpaceId: string;
}> {
  const document = await store.projectDocRepository.findDocument(documentId);

  if (!document) {
    throw new Error(`Project document ${documentId} does not exist.`);
  }

  const membership = await store.projectRepository.getProjectMember(
    document.projectId,
    actorUserId,
  );

  if (!membership) {
    throw new Error('Access denied for the requested project document.');
  }

  const project = await store.projectRepository.findProject(document.projectId);

  if (!project) {
    throw new Error(`Project ${document.projectId} does not exist.`);
  }

  return {
    canWrite: membership.role === 'owner' || membership.role === 'editor',
    document: mapDocument(document),
    projectSpaceId: project.spaceId,
  };
}

async function assertProjectWriteAccess(
  store: ProjectDocsStore,
  documentId: string,
  actorUserId: string,
): Promise<{
  document: ProjectDocRecord;
  projectSpaceId: string;
}> {
  const authorized = await getAuthorizedProjectDoc(store, documentId, actorUserId);

  if (!authorized.canWrite) {
    throw new Error('Access denied for the requested project document mutation.');
  }

  return {
    document: authorized.document,
    projectSpaceId: authorized.projectSpaceId,
  };
}

async function assertPaperAssetAvailableInProject(
  store: ProjectDocsStore,
  input: {
    actorSpaceId: string;
    actorUserId: string;
    evidenceSpan?: string;
    libraryEntryId?: string;
    paperAssetId: string;
    projectId: string;
    readerExcerptId?: string;
    sourceLibraryEntryId?: string;
  },
): Promise<string> {
  const authorizedView = await resolveAuthorizedProjectScopedEntryForAsset(store, input);

  return authorizedView.asset.id;
}

async function resolveAuthorizedProjectScopedEntryForAsset(
  store: ProjectDocsStore,
  input: {
    actorSpaceId: string;
    actorUserId: string;
    evidenceSpan?: string;
    libraryEntryId?: string;
    paperAssetId: string;
    projectId: string;
    readerExcerptId?: string;
    sourceLibraryEntryId?: string;
  },
): Promise<Awaited<ReturnType<LibraryService['assertCanAccessEntry']>>> {
  const projectScopedView = (
    await store.libraryRepository.listLibraryEntriesForAsset(input.paperAssetId)
  ).find(
    (view) =>
      view.entry.scope.type === 'project' &&
      view.entry.scope.id === input.projectId,
  );

  if (!projectScopedView) {
    const existingAsset = await store.libraryRepository.findPaperAsset(
      input.paperAssetId,
    );

    if (!existingAsset) {
      throw new Error(`Paper asset ${input.paperAssetId} does not exist.`);
    }

    throw new ProjectDocCitationSourceUnavailableError({
      evidenceSpan: input.evidenceSpan,
      libraryEntryId: input.libraryEntryId,
      paperAssetId: input.paperAssetId,
      projectId: input.projectId,
      readerExcerptId: input.readerExcerptId,
      sourceLibraryEntryId: input.sourceLibraryEntryId ?? input.libraryEntryId,
    });
  }

  const authorizedView = await store.libraryService.assertCanAccessEntry(
    projectScopedView.entry.id,
    input.actorUserId,
    input.actorSpaceId,
  );

  if (
    authorizedView.entry.id !== projectScopedView.entry.id ||
    authorizedView.entry.scope.type !== 'project' ||
    authorizedView.entry.scope.id !== input.projectId
  ) {
    throw new ProjectDocCitationSourceUnavailableError({
      evidenceSpan: input.evidenceSpan,
      libraryEntryId: input.libraryEntryId,
      paperAssetId: input.paperAssetId,
      projectId: input.projectId,
      readerExcerptId: input.readerExcerptId,
      sourceLibraryEntryId: input.sourceLibraryEntryId ?? input.libraryEntryId,
    });
  }

  return authorizedView;
}

interface NormalizedProjectDocReference {
  evidenceSpan?: string;
  libraryEntryId?: string;
  lifecycleStatus?: ReferenceLifecycleStatus;
  locator?: SourceTextRangeLocator;
  locatorSource?: ProjectDocCitationLocatorSource;
  occurrence?: ProjectDocCitationOccurrence;
  paperAssetId: string;
  readerAnnotationId?: string;
  readerExcerptId?: string;
  sourceTextArtifactId?: string;
  target?: ProjectDocCitationRecord['target'];
  targetLibraryEntryId?: string;
}

function assertCitationLocatorConsistency(citation: ProjectDocCitationInput): void {
  if (
    citation.sourceTextArtifactId &&
    citation.locator?.sourceTextArtifactId &&
    citation.sourceTextArtifactId !== citation.locator.sourceTextArtifactId
  ) {
    throw new Error('Project Doc citation source text artifact does not match its locator.');
  }
}

function createNormalizedCitationMetadata(
  citation: ProjectDocCitationInput,
  input: {
    paperAssetId: string;
    projectId: string;
    targetLibraryEntryId?: string;
  },
): Omit<NormalizedProjectDocReference, 'evidenceSpan' | 'libraryEntryId' | 'paperAssetId' | 'readerExcerptId'> {
  const sourceTextArtifactId = citation.sourceTextArtifactId ??
    citation.locator?.sourceTextArtifactId;

  return {
    lifecycleStatus: citation.lifecycleStatus,
    locator: citation.locator,
    locatorSource: citation.locatorSource,
    occurrence: citation.occurrence,
    readerAnnotationId: citation.readerAnnotationId,
    sourceTextArtifactId,
    target: input.targetLibraryEntryId
      ? {
          libraryEntryId: input.targetLibraryEntryId,
          paperAssetId: input.paperAssetId,
          projectId: input.projectId,
        }
      : undefined,
    targetLibraryEntryId: input.targetLibraryEntryId,
  };
}

async function assertExplicitProjectDocCitationTarget(
  store: ProjectDocsStore,
  input: {
    actorSpaceId: string;
    actorUserId: string;
    citation: ProjectDocCitationInput;
    projectId: string;
  },
): Promise<string | undefined> {
  const target = input.citation.target;

  if (!target) {
    return undefined;
  }

  if (target.paperAssetId !== input.citation.paperAssetId) {
    throw new Error('Project Doc citation target paper asset does not match the citation.');
  }

  const targetEntry = await store.libraryRepository.getLibraryEntry(target.libraryEntryId);

  if (!targetEntry) {
    throw new Error(`Library entry ${target.libraryEntryId} does not exist.`);
  }

  if (targetEntry.asset.id !== target.paperAssetId) {
    throw new Error(
      `Project Doc citation target ${target.libraryEntryId} does not match paper asset ${target.paperAssetId}.`,
    );
  }

  if (
    targetEntry.entry.scope.type !== 'project' ||
    targetEntry.entry.scope.id !== input.projectId
  ) {
    throw new Error('Project Doc citations require a target project LibraryEntry.');
  }

  await store.libraryService.assertCanAccessEntry(
    target.libraryEntryId,
    input.actorUserId,
    input.actorSpaceId,
  );

  return target.libraryEntryId;
}

interface NotebookAdoptionReference {
  evidenceSpan?: string;
  libraryEntryId?: string;
  paperAssetId: string;
  readerExcerptId?: string;
}

function isAccessRestrictionError(error: unknown): boolean {
  return (
    error instanceof Error &&
    (/access denied/i.test(error.message) || /space context/i.test(error.message))
  );
}

function snapshotContainsPreservedReference(
  snapshot: ProjectDocSnapshot | null,
  input: {
    libraryEntryId?: string;
    paperAssetId: string;
    readerExcerptId?: string;
  },
): boolean {
  if (!snapshot) {
    return false;
  }

  if (
    input.readerExcerptId &&
    snapshot.citations.some(
      (citation) =>
        citation.paperAssetId === input.paperAssetId &&
        citation.readerExcerptId === input.readerExcerptId,
    )
  ) {
    return true;
  }

  return extractDocumentBlockReferences(
    snapshot.documentContent ?? createEmptyDocumentBlockDocument(),
  ).some(
    (reference) =>
      reference.paperAssetId === input.paperAssetId &&
      (!input.readerExcerptId || reference.readerExcerptId === input.readerExcerptId) &&
      (!input.libraryEntryId || reference.libraryEntryId === input.libraryEntryId),
  );
}

async function normalizeReferenceForProject(
  store: ProjectDocsStore,
  citation: ProjectDocCitationInput,
  actorUserId: string,
  projectId: string,
  actorSpaceId: string,
  currentSnapshot: ProjectDocSnapshot | null,
): Promise<NormalizedProjectDocReference> {
  assertCitationLocatorConsistency(citation);

  const explicitTargetLibraryEntryId = await assertExplicitProjectDocCitationTarget(
    store,
    {
      actorSpaceId,
      actorUserId,
      citation,
      projectId,
    },
  );

  if (citation.readerExcerptId) {
    const excerpt = await store.readingRepository.getReaderExcerpt(
      citation.readerExcerptId,
    );

    if (!excerpt) {
      throw new Error(`Reader excerpt ${citation.readerExcerptId} does not exist.`);
    }

    if (citation.paperAssetId !== excerpt.paperAssetId) {
      throw new Error(
        `Document reference ${citation.paperAssetId} does not match reader excerpt ${citation.readerExcerptId}.`,
      );
    }

    const citationLibraryEntry = citation.libraryEntryId
      ? await store.libraryRepository.getLibraryEntry(citation.libraryEntryId)
      : null;

    if (citation.libraryEntryId && !citationLibraryEntry) {
      throw new Error(`Library entry ${citation.libraryEntryId} does not exist.`);
    }

    if (
      citationLibraryEntry &&
      citationLibraryEntry.asset.id !== excerpt.paperAssetId
    ) {
      throw new Error(
        `Document reference ${citation.readerExcerptId} does not match library entry ${citation.libraryEntryId}.`,
      );
    }

    if (
      citation.libraryEntryId &&
      citation.libraryEntryId !== excerpt.libraryEntryId &&
      !(
        citationLibraryEntry?.entry.scope.type === 'project' &&
        citationLibraryEntry.entry.scope.id === projectId
      )
    ) {
      throw new Error(
        `Document reference ${citation.readerExcerptId} must use its Reader source entry or the target project library entry.`,
      );
    }

    const sourceEntry = await store.libraryRepository.getLibraryEntry(
      excerpt.libraryEntryId,
    );

    if (!sourceEntry || sourceEntry.asset.id !== excerpt.paperAssetId) {
      throw new Error(
        `Reader excerpt ${citation.readerExcerptId} does not match its source library entry.`,
      );
    }

    if (
      sourceEntry.entry.scope.type === 'project' &&
      sourceEntry.entry.scope.id === projectId
    ) {
      const targetLibraryEntryId = explicitTargetLibraryEntryId ??
        (citation.libraryEntryId === sourceEntry.entry.id ? sourceEntry.entry.id : undefined);

      return {
        evidenceSpan: citation.evidenceSpan ?? excerpt.quote,
        libraryEntryId: citation.libraryEntryId,
        ...createNormalizedCitationMetadata(citation, {
          paperAssetId: excerpt.paperAssetId,
          projectId,
          targetLibraryEntryId,
        }),
        paperAssetId: excerpt.paperAssetId,
        readerExcerptId: excerpt.id,
      };
    }

    await resolveAuthorizedProjectScopedEntryForAsset(store, {
      actorSpaceId,
      actorUserId,
      evidenceSpan: citation.evidenceSpan ?? excerpt.quote,
      libraryEntryId: sourceEntry.entry.id,
      paperAssetId: excerpt.paperAssetId,
      projectId,
      readerExcerptId: excerpt.id,
      sourceLibraryEntryId: excerpt.libraryEntryId,
    });

    try {
      await store.readingService.getReaderExcerptSource({
        actorSpaceId,
        actorUserId,
        readerExcerptId: citation.readerExcerptId,
      });
    } catch (error) {
      if (!isAccessRestrictionError(error)) {
        throw error;
      }

      if (
        !snapshotContainsPreservedReference(currentSnapshot, {
          paperAssetId: excerpt.paperAssetId,
          readerExcerptId: excerpt.id,
        })
      ) {
        throw error;
      }
    }

    return {
      evidenceSpan: citation.evidenceSpan ?? excerpt.quote,
      libraryEntryId: citation.libraryEntryId,
      ...createNormalizedCitationMetadata(citation, {
        paperAssetId: excerpt.paperAssetId,
        projectId,
        targetLibraryEntryId: explicitTargetLibraryEntryId,
      }),
      paperAssetId: excerpt.paperAssetId,
      readerExcerptId: excerpt.id,
    };
  }

  if (citation.libraryEntryId) {
    const sourceEntry = await store.libraryRepository.getLibraryEntry(
      citation.libraryEntryId,
    );

    if (!sourceEntry) {
      throw new Error(`Library entry ${citation.libraryEntryId} does not exist.`);
    }

    if (sourceEntry.asset.id !== citation.paperAssetId) {
      throw new Error(
        `Document reference ${citation.paperAssetId} does not match library entry ${citation.libraryEntryId}.`,
      );
    }

    if (
      sourceEntry.entry.scope.type === 'project' &&
      sourceEntry.entry.scope.id === projectId
    ) {
      await store.libraryService.assertCanAccessEntry(
        citation.libraryEntryId,
        actorUserId,
        actorSpaceId,
      );

      return {
        evidenceSpan: citation.evidenceSpan,
        libraryEntryId: citation.libraryEntryId,
        ...createNormalizedCitationMetadata(citation, {
          paperAssetId: sourceEntry.asset.id,
          projectId,
          targetLibraryEntryId: explicitTargetLibraryEntryId ?? citation.libraryEntryId,
        }),
        paperAssetId: sourceEntry.asset.id,
      };
    }

    await resolveAuthorizedProjectScopedEntryForAsset(store, {
      actorSpaceId,
      actorUserId,
      evidenceSpan: citation.evidenceSpan,
      libraryEntryId: citation.libraryEntryId,
      paperAssetId: sourceEntry.asset.id,
      projectId,
      readerExcerptId: citation.readerExcerptId,
      sourceLibraryEntryId: citation.libraryEntryId,
    });

    try {
      await store.libraryService.assertCanAccessEntry(
        citation.libraryEntryId,
        actorUserId,
        actorSpaceId,
      );
    } catch (error) {
      if (!isAccessRestrictionError(error)) {
        throw error;
      }

      if (
        !snapshotContainsPreservedReference(currentSnapshot, {
          libraryEntryId: citation.libraryEntryId,
          paperAssetId: sourceEntry.asset.id,
        })
      ) {
        throw error;
      }
    }

    return {
      evidenceSpan: citation.evidenceSpan,
      libraryEntryId: citation.libraryEntryId,
      ...createNormalizedCitationMetadata(citation, {
        paperAssetId: sourceEntry.asset.id,
        projectId,
        targetLibraryEntryId: explicitTargetLibraryEntryId,
      }),
      paperAssetId: sourceEntry.asset.id,
    };
  }

  const directEntry = await store.libraryRepository.getLibraryEntry(
    citation.paperAssetId,
  );

  if (directEntry) {
    const authorizedView = await store.libraryService.assertCanAccessEntry(
      citation.paperAssetId,
      actorUserId,
      actorSpaceId,
    );

    if (
      authorizedView.entry.scope.type !== 'project' ||
      authorizedView.entry.scope.id !== projectId
    ) {
      const paperAssetId = await assertPaperAssetAvailableInProject(store, {
        actorSpaceId,
        actorUserId,
        evidenceSpan: citation.evidenceSpan,
        libraryEntryId: authorizedView.entry.id,
        paperAssetId: authorizedView.asset.id,
        projectId,
        readerExcerptId: citation.readerExcerptId,
        sourceLibraryEntryId: authorizedView.entry.id,
      });

      return {
        evidenceSpan: citation.evidenceSpan,
        ...createNormalizedCitationMetadata(citation, {
          paperAssetId,
          projectId,
          targetLibraryEntryId: explicitTargetLibraryEntryId,
        }),
        paperAssetId,
      };
    }

    return {
      evidenceSpan: citation.evidenceSpan,
      ...createNormalizedCitationMetadata(citation, {
        paperAssetId: authorizedView.asset.id,
        projectId,
        targetLibraryEntryId: explicitTargetLibraryEntryId ?? authorizedView.entry.id,
      }),
      paperAssetId: authorizedView.asset.id,
    };
  }

  const paperAssetId = await assertPaperAssetAvailableInProject(store, {
    actorSpaceId,
    actorUserId,
    evidenceSpan: citation.evidenceSpan,
    paperAssetId: citation.paperAssetId,
    projectId,
    readerExcerptId: citation.readerExcerptId,
  });

  return {
    evidenceSpan: citation.evidenceSpan,
    ...createNormalizedCitationMetadata(citation, {
      paperAssetId,
      projectId,
      targetLibraryEntryId: explicitTargetLibraryEntryId,
    }),
    paperAssetId,
  };
}

async function normalizeAuthorizedCitations(
  store: ProjectDocsStore,
  citations: ProjectDocCitationInput[],
  actorUserId: string,
  projectId: string,
  actorSpaceId: string,
  currentSnapshot: ProjectDocSnapshot | null,
): Promise<NormalizedProjectDocReference[]> {
  const normalizedCitations: NormalizedProjectDocReference[] = [];

  for (const citation of citations) {
    const normalized = await normalizeReferenceForProject(
      store,
      citation,
      actorUserId,
      projectId,
      actorSpaceId,
      currentSnapshot,
    );

    normalizedCitations.push(normalized);
  }

  return dedupeNormalizedCitations(normalizedCitations);
}

function mergeNotebookAdoptionReference(
  references: Map<string, NotebookAdoptionReference>,
  reference: NotebookAdoptionReference,
): void {
  const key = reference.readerExcerptId
    ? `excerpt:${reference.readerExcerptId}`
    : `asset:${reference.paperAssetId}`;
  const existing = references.get(key);

  if (!existing) {
    references.set(key, { ...reference });
    return;
  }

  references.set(key, {
    evidenceSpan: existing.evidenceSpan ?? reference.evidenceSpan,
    libraryEntryId: existing.libraryEntryId ?? reference.libraryEntryId,
    paperAssetId: existing.paperAssetId,
    readerExcerptId: existing.readerExcerptId ?? reference.readerExcerptId,
  });
}

function collectNotebookAdoptionReferences(input: {
  citations: Array<{
    evidenceSpan?: string;
    paperAssetId: string;
    readerExcerptId?: string;
  }>;
  documentContent: DocumentBlockDocument;
}): NotebookAdoptionReference[] {
  const references = new Map<string, NotebookAdoptionReference>();

  for (const citation of input.citations) {
    mergeNotebookAdoptionReference(references, citation);
  }

  for (const reference of extractDocumentBlockReferences(input.documentContent)) {
    mergeNotebookAdoptionReference(references, {
      evidenceSpan: reference.evidenceSpan,
      libraryEntryId: reference.libraryEntryId,
      paperAssetId: reference.paperAssetId,
      readerExcerptId: reference.readerExcerptId,
    });
  }

  return [...references.values()];
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

async function resolveSourceLibraryEntryIdForNotebookReference(
  store: ProjectDocsStore,
  reference: NotebookAdoptionReference,
  actorUserId: string,
): Promise<string> {
  if (reference.libraryEntryId) {
    const sourceEntry = await store.libraryRepository.getLibraryEntry(
      reference.libraryEntryId,
    );

    if (!sourceEntry) {
      throw new Error(`Library entry ${reference.libraryEntryId} does not exist.`);
    }

    if (sourceEntry.asset.id !== reference.paperAssetId) {
      throw new Error(
        `Notebook reference ${reference.paperAssetId} does not match library entry ${reference.libraryEntryId}.`,
      );
    }

    await store.libraryService.assertCanAccessEntry(
      reference.libraryEntryId,
      actorUserId,
    );

    return reference.libraryEntryId;
  }

  if (reference.readerExcerptId) {
    const excerpt = await store.readingRepository.getReaderExcerpt(
      reference.readerExcerptId,
    );

    if (!excerpt) {
      throw new Error(`Reader excerpt ${reference.readerExcerptId} does not exist.`);
    }

    if (excerpt.paperAssetId !== reference.paperAssetId) {
      throw new Error(
        `Notebook reference ${reference.paperAssetId} does not match reader excerpt ${reference.readerExcerptId}.`,
      );
    }

    await store.libraryService.assertCanAccessEntry(
      excerpt.libraryEntryId,
      actorUserId,
    );

    return excerpt.libraryEntryId;
  }

  const accessibleSource = await store.libraryService.assertCanAccessPaperAsset(
    reference.paperAssetId,
    actorUserId,
  );

  return accessibleSource.entry.id;
}

async function ensureProjectLibraryEntryForNotebookReference(
  store: ProjectDocsStore,
  input: {
    actorUserId: string;
    projectId: string;
    projectSpaceId: string;
    reference: NotebookAdoptionReference;
  },
): Promise<string> {
  const existingProjectView = (
    await store.libraryRepository.listLibraryEntriesForAsset(
      input.reference.paperAssetId,
    )
  ).find(
    (view) =>
      view.entry.scope.type === 'project' &&
      view.entry.scope.id === input.projectId,
  );

  if (existingProjectView) {
    const authorizedView = await store.libraryService.assertCanAccessEntry(
      existingProjectView.entry.id,
      input.actorUserId,
      input.projectSpaceId,
    );

    if (authorizedView.asset.id !== input.reference.paperAssetId) {
      throw new Error(
        `Project library entry ${existingProjectView.entry.id} does not match notebook reference ${input.reference.paperAssetId}.`,
      );
    }

    return authorizedView.entry.id;
  }

  const sourceLibraryEntryId = await resolveSourceLibraryEntryIdForNotebookReference(
    store,
    input.reference,
    input.actorUserId,
  );
  const adoption = await store.libraryService.adoptProjectLibraryEntry({
    actorUserId: input.actorUserId,
    projectId: input.projectId,
    sourceLibraryEntryId,
  });

  if (adoption.entry.asset.id !== input.reference.paperAssetId) {
    throw new Error(
      `Project library adoption ${adoption.entry.entry.id} does not match notebook reference ${input.reference.paperAssetId}.`,
    );
  }

  return adoption.entry.entry.id;
}

async function ensureProjectLibraryEntriesForNotebookReferences(
  store: ProjectDocsStore,
  input: {
    actorUserId: string;
    projectId: string;
    projectSpaceId: string;
    references: NotebookAdoptionReference[];
  },
): Promise<Map<string, string>> {
  const projectLibraryEntryIdsByAsset = new Map<string, string>();

  for (const reference of input.references) {
    if (projectLibraryEntryIdsByAsset.has(reference.paperAssetId)) {
      continue;
    }

    projectLibraryEntryIdsByAsset.set(
      reference.paperAssetId,
      await ensureProjectLibraryEntryForNotebookReference(store, {
        actorUserId: input.actorUserId,
        projectId: input.projectId,
        projectSpaceId: input.projectSpaceId,
        reference,
      }),
    );
  }

  return projectLibraryEntryIdsByAsset;
}

function rewriteNotebookBlockForProjectLibrary(
  block: DocumentBlock,
  projectLibraryEntryIdsByAsset: Map<string, string>,
  projectLibraryEntryIdsBySourceLibraryEntry: Map<string, string>,
): DocumentBlock {
  switch (block.type) {
    case 'aiSuggestion':
      return block.paperAssetId
        ? {
            ...block,
            libraryEntryId: block.readerExcerptId
              ? projectLibraryEntryIdsByAsset.get(block.paperAssetId)
              : projectLibraryEntryIdsByAsset.get(block.paperAssetId) ??
                block.libraryEntryId,
          }
        : block;
    case 'citation':
      return {
        ...block,
        libraryEntryId: block.readerExcerptId
          ? projectLibraryEntryIdsByAsset.get(block.paperAssetId)
          : projectLibraryEntryIdsByAsset.get(block.paperAssetId) ??
            block.libraryEntryId,
      };
    case 'paperReference':
      return {
        ...block,
        libraryEntryId: projectLibraryEntryIdsByAsset.get(block.paperAssetId) ??
          block.libraryEntryId,
      };
    case 'quote':
      return block.paperAssetId
        ? {
            ...block,
            libraryEntryId: block.readerExcerptId
              ? projectLibraryEntryIdsByAsset.get(block.paperAssetId)
              : projectLibraryEntryIdsByAsset.get(block.paperAssetId) ??
                block.libraryEntryId,
          }
        : block;
    case 'sourceExcerpt':
      return {
        ...block,
        libraryEntryId: block.readerExcerptId
          ? projectLibraryEntryIdsByAsset.get(block.paperAssetId)
          : projectLibraryEntryIdsByAsset.get(block.paperAssetId) ??
            block.libraryEntryId,
        note: undefined,
      };
    case 'paragraph':
      return {
        ...block,
        text: rewriteNotebookAdoptionParagraphMetadata(
          block.text,
          projectLibraryEntryIdsBySourceLibraryEntry,
        ),
      };
    case 'heading':
    case 'todo':
      return block;
  }
}

function createProjectLibraryEntryIdsBySourceLibraryEntry(
  references: NotebookAdoptionReference[],
  projectLibraryEntryIdsByAsset: Map<string, string>,
): Map<string, string> {
  const projectLibraryEntryIdsBySourceLibraryEntry = new Map<string, string>();

  for (const reference of references) {
    if (!reference.libraryEntryId) {
      continue;
    }

    const projectLibraryEntryId = projectLibraryEntryIdsByAsset.get(
      reference.paperAssetId,
    );

    if (projectLibraryEntryId) {
      projectLibraryEntryIdsBySourceLibraryEntry.set(
        reference.libraryEntryId,
        projectLibraryEntryId,
      );
    }
  }

  return projectLibraryEntryIdsBySourceLibraryEntry;
}

function rewriteNotebookAdoptionParagraphMetadata(
  text: string,
  projectLibraryEntryIdsBySourceLibraryEntry: Map<string, string>,
): string {
  let rewrittenText = text;

  for (const [sourceLibraryEntryId, projectLibraryEntryId] of projectLibraryEntryIdsBySourceLibraryEntry) {
    rewrittenText = rewrittenText.replace(
      new RegExp(
        `(^|\\n)Library entry: ${escapeRegExp(sourceLibraryEntryId)}(?=\\n|$)`,
        'g',
      ),
      (_match, linePrefix: string) =>
        `${linePrefix}Project library entry: ${projectLibraryEntryId}`,
    );
  }

  return rewrittenText;
}

function createNotebookAdoptionDocumentContent(input: {
  adoptedAt: string;
  currentDocumentContent: DocumentBlockDocument;
  notebook: {
    capturedAt: string;
    documentContent: DocumentBlockDocument;
    documentId: string;
    title: string;
    versionId: string;
    versionNumber: number;
  };
  projectLibraryEntryIdsByAsset: Map<string, string>;
  references: NotebookAdoptionReference[];
}): DocumentBlockDocument {
  const projectLibraryEntryIdsBySourceLibraryEntry =
    createProjectLibraryEntryIdsBySourceLibraryEntry(
      input.references,
      input.projectLibraryEntryIdsByAsset,
    );
  const adoptedBlocks = input.notebook.documentContent.blocks.map((block) =>
    rewriteNotebookBlockForProjectLibrary(
      block,
      input.projectLibraryEntryIdsByAsset,
      projectLibraryEntryIdsBySourceLibraryEntry,
    )
  );

  return normalizeDocumentBlockDocument({
    blocks: [
      ...input.currentDocumentContent.blocks,
      {
        level: 2,
        text: `Adopted notebook: ${input.notebook.title}`,
        type: 'heading',
      },
      {
        text: [
          `Adopted at: ${input.adoptedAt}`,
          `Source Notebook: ${input.notebook.documentId}`,
          `Source Notebook version: ${input.notebook.versionNumber}`,
          `Source Notebook version id: ${input.notebook.versionId}`,
          `Source Notebook captured at: ${input.notebook.capturedAt}`,
          ...uniqueStrings([...input.projectLibraryEntryIdsByAsset.values()])
            .map((projectLibraryEntryId) =>
              `Project library entry: ${projectLibraryEntryId}`
            ),
        ].join('\n'),
        type: 'paragraph',
      },
      ...adoptedBlocks,
    ],
    schemaVersion: 1,
  });
}

function createNotebookAdoptionCitationInputs(
  references: NotebookAdoptionReference[],
  projectLibraryEntryIdsByAsset: Map<string, string>,
): ProjectDocCitationInput[] {
  return references.map((reference) => ({
    evidenceSpan: reference.evidenceSpan,
    libraryEntryId: projectLibraryEntryIdsByAsset.get(reference.paperAssetId),
    paperAssetId: reference.paperAssetId,
    readerExcerptId: reference.readerExcerptId,
  }));
}

function uniqueStrings(values: Array<string | undefined>): string[] {
  return [...new Set(values.filter((value): value is string => Boolean(value)))];
}

function createNotebookAdoptionProvenance(input: {
  projectDocId: string;
  projectDocVersionId: string;
  projectDocVersionNumber: number;
  projectId: string;
  projectLibraryEntryIdsByAsset: Map<string, string>;
  references: NotebookAdoptionReference[];
  sourceNotebookCapturedAt: string;
  sourceNotebookDocumentId: string;
  sourceNotebookVersionId: string;
  sourceNotebookVersionNumber: number;
}): ProjectDocNotebookAdoptionProvenance {
  return {
    paperAssetIds: uniqueStrings(
      input.references.map((reference) => reference.paperAssetId),
    ),
    projectDocId: input.projectDocId,
    projectDocVersionId: input.projectDocVersionId,
    projectDocVersionNumber: input.projectDocVersionNumber,
    projectId: input.projectId,
    projectLibraryEntryIds: uniqueStrings([
      ...input.projectLibraryEntryIdsByAsset.values(),
    ]),
    readerExcerptIds: uniqueStrings(
      input.references.map((reference) => reference.readerExcerptId),
    ),
    sourceNotebookCapturedAt: input.sourceNotebookCapturedAt,
    sourceNotebookDocumentId: input.sourceNotebookDocumentId,
    sourceNotebookVersionId: input.sourceNotebookVersionId,
    sourceNotebookVersionNumber: input.sourceNotebookVersionNumber,
  };
}

async function getOwnedNotebookSnapshotForAdoption(
  store: ProjectDocsStore,
  notebookDocumentId: string,
  actorUserId: string,
): Promise<ReturnType<typeof mapNotebookSnapshot>> {
  const normalizedNotebookDocumentId = notebookDocumentId.trim();

  if (!normalizedNotebookDocumentId) {
    throw new Error('notebookDocumentId is required.');
  }

  const notebookDocument = await store.notebookRepository.getDocumentForOwner(
    normalizedNotebookDocumentId,
    actorUserId,
  );

  if (!notebookDocument) {
    const existingNotebookDocument = await store.notebookRepository.findDocument(
      normalizedNotebookDocumentId,
    );

    if (!existingNotebookDocument) {
      throw new Error(`Notebook document ${normalizedNotebookDocumentId} does not exist.`);
    }

    throw new Error('Access denied for the requested notebook document.');
  }

  const notebookSnapshot = await store.notebookRepository.getLatestSnapshot(
    normalizedNotebookDocumentId,
  );

  if (!notebookSnapshot) {
    throw new Error(
      `Notebook document ${normalizedNotebookDocumentId} has no saved version to adopt.`,
    );
  }

  return mapNotebookSnapshot(notebookSnapshot);
}

export function createProjectDocsService(
  store: ProjectDocsStore,
): ProjectDocsService {
  return {
    async createDocument(
      input: CreateProjectDocRequest,
      actorUserId: string,
    ): Promise<ProjectDocRecord> {
      const membership = await store.projectRepository.getProjectMember(
        input.projectId,
        actorUserId,
      );

      if (!membership) {
        throw new Error('Access denied for the requested project document.');
      }

      if (membership.role === 'viewer') {
        throw new Error('Access denied for the requested project document mutation.');
      }

      return mapDocument(
        await store.projectDocRepository.createDocument({
          createdByUserId: actorUserId,
          projectId: input.projectId,
          publishState: input.publishState,
          title: input.title,
        }),
      );
    },
    /**
     * @deprecated Legacy/internal compatibility ingestion only. Foreground UI
     * must not call this whole private Notebook-to-Project Docs bridge.
     */
    async adoptNotebook(
      input: ProjectDocLookup & AdoptNotebookIntoProjectDocRequest,
      actorUserId: string,
    ): Promise<AdoptNotebookIntoProjectDocResponse> {
      const { document, projectSpaceId } = await assertProjectWriteAccess(
        store,
        input.documentId,
        actorUserId,
      );
      const notebookSnapshot = await getOwnedNotebookSnapshotForAdoption(
        store,
        input.notebookDocumentId,
        actorUserId,
      );
      const references = collectNotebookAdoptionReferences({
        citations: notebookSnapshot.citations,
        documentContent: notebookSnapshot.documentContent,
      });
      const projectLibraryEntryIdsByAsset = await ensureProjectLibraryEntriesForNotebookReferences(
        store,
        {
          actorUserId,
          projectId: document.projectId,
          projectSpaceId,
          references,
        },
      );
      const currentSnapshotRecord = await store.projectDocRepository.getLatestSnapshot(
        input.documentId,
      );
      const currentSnapshot = currentSnapshotRecord
        ? mapSnapshot(currentSnapshotRecord)
        : null;
      const adoptedAt = new Date().toISOString();
      const documentContent = createNotebookAdoptionDocumentContent({
        adoptedAt,
        currentDocumentContent: currentSnapshot?.documentContent ??
          createEmptyDocumentBlockDocument(),
        notebook: notebookSnapshot,
        projectLibraryEntryIdsByAsset,
        references,
      });
      const citations = await normalizeAuthorizedCitations(
        store,
        mergeCitationInputs(
          createNotebookAdoptionCitationInputs(
            references,
            projectLibraryEntryIdsByAsset,
          ),
          documentContent,
        ),
        actorUserId,
        document.projectId,
        projectSpaceId,
        currentSnapshot,
      );
      const snapshot = mapSnapshot(
        await store.projectDocRepository.saveVersion({
          citations,
          content: serializeDocumentBlockSnapshotPayload(documentContent),
          documentId: input.documentId,
        }),
      );
      const citationTrace = await createProjectDocCitationTraceResponse(store, {
        actorSpaceId: projectSpaceId,
        actorUserId,
        snapshot,
      });

      return {
        citationTrace,
        provenance: createNotebookAdoptionProvenance({
          projectDocId: snapshot.document.id,
          projectDocVersionId: snapshot.versionId,
          projectDocVersionNumber: snapshot.versionNumber,
          projectId: snapshot.document.projectId,
          projectLibraryEntryIdsByAsset,
          references,
          sourceNotebookCapturedAt: notebookSnapshot.capturedAt,
          sourceNotebookDocumentId: notebookSnapshot.documentId,
          sourceNotebookVersionId: notebookSnapshot.versionId,
          sourceNotebookVersionNumber: notebookSnapshot.versionNumber,
        }),
        snapshot,
      };
    },
    async createAiSuggestion(
      input: ProjectDocLookup & CreateProjectDocAiSuggestionRequest,
      actorUserId: string,
    ): Promise<CreateProjectDocAiSuggestionResponse> {
      const { document, projectSpaceId } = await assertProjectWriteAccess(
        store,
        input.documentId,
        actorUserId,
      );
      const snapshotRecord = await store.projectDocRepository.getLatestSnapshot(
        input.documentId,
      );
      const snapshot = snapshotRecord
        ? mapSnapshot(snapshotRecord)
        : createEmptySnapshot(document);
      const trace = await createProjectDocCitationTraceResponse(store, {
        actorSpaceId: projectSpaceId,
        actorUserId,
        snapshot,
      });
      const citationRows = collectSuggestionCitationRows(trace, input.citationIds);
      const citations = citationRows.map(mapTraceRowToSuggestionCitation);
      const documentSummary = summarizeDocumentForAiContext(snapshot);
      const suggestion = createProjectDocAiSuggestion({
        citationIds: input.citationIds,
        citations,
        credentialRef: input.credentialRef,
        documentSummary,
        instruction: input.instruction,
        selectedBlockId: input.selectedBlockId,
        selectedText: input.selectedText,
      });
      const job = await store.jobs.createJob(
        {
          credentialRef: input.credentialRef,
          kind: PROJECT_DOC_AI_SUGGESTION_JOB_KIND,
          payload: createProjectDocAiSuggestionPayload({
            citationRows,
            document,
            documentSummary,
            instruction: input.instruction,
            selectedBlockId: input.selectedBlockId,
            selectedText: input.selectedText,
            snapshot,
            suggestion,
          }),
          scope: {
            id: document.projectId,
            type: 'project',
          },
          spaceId: projectSpaceId,
        },
        actorUserId,
      );

      return {
        documentId: document.id,
        job,
        projectId: document.projectId,
        suggestion,
      };
    },
    async findLatestProjectDocument(
      projectId: string,
      actorUserId: string,
    ): Promise<ProjectDocRecord | null> {
      const membership = await store.projectRepository.getProjectMember(
        projectId,
        actorUserId,
      );

      if (!membership) {
        throw new Error('Access denied for the requested project document.');
      }

      const document = await store.projectDocRepository.findLatestDocumentForProject(projectId);

      return document ? mapDocument(document) : null;
    },
    async getDocument(
      query: ProjectDocLookup,
      actorUserId: string,
    ): Promise<ProjectDocSnapshot> {
      const authorized = await getAuthorizedProjectDoc(
        store,
        query.documentId,
        actorUserId,
      );

      const snapshot = await store.projectDocRepository.getLatestSnapshot(
        query.documentId,
      );

      if (!snapshot) {
        return createEmptySnapshot(authorized.document);
      }

      return mapSnapshot(snapshot);
    },
    async getCitationTrace(
      query: ProjectDocLookup,
      actorUserId: string,
    ): Promise<ProjectDocCitationTraceResponse> {
      const authorized = await getAuthorizedProjectDoc(
        store,
        query.documentId,
        actorUserId,
      );
      const snapshot = await store.projectDocRepository.getLatestSnapshot(
        query.documentId,
      );
      const mappedSnapshot = snapshot
        ? mapSnapshot(snapshot)
        : createEmptySnapshot(authorized.document);

      return createProjectDocCitationTraceResponse(store, {
        actorSpaceId: authorized.projectSpaceId,
        actorUserId,
        snapshot: mappedSnapshot,
      });
    },
    async saveDocument(
      input: SaveProjectDocRequest,
      actorUserId: string,
    ): Promise<ProjectDocSnapshot> {
      const { document, projectSpaceId } = await assertProjectWriteAccess(
        store,
        input.documentId,
        actorUserId,
      );
      const documentContent = normalizeSaveDocumentContent(input);
      const currentSnapshot = await store.projectDocRepository.getLatestSnapshot(
        input.documentId,
      );
      const citations = await normalizeAuthorizedCitations(
        store,
        mergeCitationInputs(input.citations, documentContent),
        actorUserId,
        document.projectId,
        projectSpaceId,
        currentSnapshot ? mapSnapshot(currentSnapshot) : null,
      );

      return mapSnapshot(
        await store.projectDocRepository.saveVersion({
          citations,
          content: serializeDocumentBlockSnapshotPayload(documentContent),
          documentId: input.documentId,
        }),
      );
    },
    async getWorkbenchDocument(
      projectId: string,
      actorUserId: string,
    ): Promise<WritingDocumentView | null> {
      const { project } = await getAuthorizedProject(store, projectId, actorUserId);
      const document = await store.projectDocRepository.findLatestDocumentForProject(projectId);

      if (!document) {
        return null;
      }

      const latestSnapshot = await store.projectDocRepository.getLatestSnapshot(document.id);

      return mapWritingDocument(
        mapDocument(document),
        project.spaceId,
        latestSnapshot ? mapSnapshot(latestSnapshot) : null,
      );
    },
    async saveWorkbenchDocument(
      input: {
        citations: ProjectDocCitationInput[];
        content?: string;
        documentContent?: DocumentBlockDocument;
        projectId: string;
        title: string;
      },
      actorUserId: string,
    ): Promise<WritingDocumentView> {
      const { membership, project } = await getAuthorizedProject(
        store,
        input.projectId,
        actorUserId,
      );

      if (membership?.role === 'viewer') {
        throw new Error('Access denied for the requested project document mutation.');
      }

      let document = await store.projectDocRepository.findLatestDocumentForProject(input.projectId);

      if (!document) {
        document = await store.projectDocRepository.createDocument({
          createdByUserId: actorUserId,
          projectId: input.projectId,
          title: input.title,
        });
      }

      const snapshot = await this.saveDocument(
        {
          citations: input.citations,
          content: input.content,
          documentContent: input.documentContent,
          documentId: document.id,
        },
        actorUserId,
      );

      return mapWritingDocument(snapshot.document, project.spaceId, snapshot);
    },
    async transitionPublishState(
      input: TransitionProjectDocPublishStateRequest,
      actorUserId: string,
    ): Promise<ProjectDocRecord> {
      await assertProjectWriteAccess(store, input.documentId, actorUserId);

      return mapDocument(
        await store.projectDocRepository.updatePublishState(
          input.documentId,
          input.publishState,
        ),
      );
    },
  };
}
