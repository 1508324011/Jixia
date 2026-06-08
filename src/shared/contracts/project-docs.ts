import type { DocumentAiSuggestionBlock } from './document-content';
import type {
  DocumentCitationRecordBase,
  DocumentSnapshot,
} from './document-snapshot';
import type { JobRecord } from './jobs';
import type { ReferenceLifecycleStatus } from './reader-annotations';
import type { SourceTextRangeLocator } from './source-text';
import type { PublishState } from './writing';

export interface CreateProjectDocRequest {
  projectId: string;
  publishState?: PublishState;
  title: string;
}

export interface ProjectDocLookup {
  documentId: string;
}

/**
 * @deprecated Legacy/internal compatibility only. Foreground product flows must
 * use selected Reader evidence, project-visible citations/references, and
 * explicit Project Library source adoption instead of whole private Notebook
 * ingestion into Project Docs.
 */
export interface AdoptNotebookIntoProjectDocRequest {
  notebookDocumentId: string;
}

export interface ProjectDocCitationRecord extends DocumentCitationRecordBase {
  lifecycleStatus?: ReferenceLifecycleStatus;
  locator?: SourceTextRangeLocator;
  locatorSource?: ProjectDocCitationLocatorSource;
  occurrence?: ProjectDocCitationOccurrence;
  projectDocVersionId: string;
  readerAnnotationId?: string;
  sourceTextArtifactId?: string;
  target?: ProjectDocCitationTarget;
  targetLibraryEntryId?: string;
}

export interface ProjectDocCitationTarget {
  libraryEntryId: string;
  paperAssetId: string;
  projectId: string;
}

export interface CreateProjectDocCitationTargetInput {
  libraryEntryId: string;
  paperAssetId: string;
}

export interface ProjectDocCitationOccurrence {
  key: string;
  label?: string;
}

export type ProjectDocCitationLocatorSourceType =
  | 'project_doc_occurrence'
  | 'project_visible_reader_annotation'
  | 'source_text_artifact_range';

export interface ProjectDocCitationLocatorSource {
  id?: string;
  type: ProjectDocCitationLocatorSourceType;
}

export interface CreateProjectDocCitationInput {
  evidenceSpan?: string;
  locator?: SourceTextRangeLocator;
  locatorSource?: ProjectDocCitationLocatorSource;
  occurrence: ProjectDocCitationOccurrence;
  readerAnnotationId?: string;
  sourceTextArtifactId?: string;
  target: CreateProjectDocCitationTargetInput;
}

export interface ProjectSourceArchiveBlockedDetails {
  activeCitationIds: string[];
  projectId: string;
  targetLibraryEntryId: string;
}

export const PROJECT_SOURCE_ARCHIVE_BLOCKED =
  'PROJECT_SOURCE_ARCHIVE_BLOCKED';

export interface ProjectDocRecord {
  createdAt: string;
  createdByUserId: string;
  id: string;
  projectId: string;
  publishState: PublishState;
  title: string;
  updatedAt: string;
}

export type ProjectDocSnapshot = DocumentSnapshot<
  ProjectDocRecord,
  ProjectDocCitationRecord
>;

export const PROJECT_DOC_CITATION_SOURCE_UNAVAILABLE =
  'PROJECT_DOC_CITATION_SOURCE_UNAVAILABLE';

export interface ProjectDocCitationSourceUnavailableDetails {
  evidenceSpan?: string;
  libraryEntryId?: string;
  paperAssetId: string;
  projectId: string;
  readerExcerptId?: string;
  sourceLibraryEntryId?: string;
}

export type ProjectDocCitationTraceSourceState =
  | 'available'
  | 'adoption_needed';

export type ProjectDocCitationTraceReaderExcerptSource =
  | 'project_library_asset'
  | 'reader_source'
  | 'project_doc_snapshot';

export interface ProjectDocCitationTracePaperAsset {
  abstractText?: string;
  canonicalId: string;
  createdAt: string;
  hasFile?: boolean;
  id: string;
  title: string;
}

export interface ProjectDocCitationTraceProjectLibraryEntry {
  libraryEntryId: string;
  projectId: string;
}

export interface ProjectDocCitationTraceAvailableSource {
  state: 'available';
}

export interface ProjectDocCitationTraceAdoptionNeededSource {
  code: typeof PROJECT_DOC_CITATION_SOURCE_UNAVAILABLE;
  details: ProjectDocCitationSourceUnavailableDetails;
  message: string;
  state: 'adoption_needed';
}

export type ProjectDocCitationTraceSource =
  | ProjectDocCitationTraceAdoptionNeededSource
  | ProjectDocCitationTraceAvailableSource;

export interface ProjectDocCitationTraceReaderExcerpt {
  endOffset?: number;
  evidenceSpan?: string;
  id: string;
  locator?: string;
  quote?: string;
  source: ProjectDocCitationTraceReaderExcerptSource;
  sourceLibraryEntryId?: string;
  startOffset?: number;
}

export interface ProjectDocCitationTraceRow {
  citationId: string;
  createdAt: string;
  evidenceSpan?: string;
  paper?: ProjectDocCitationTracePaperAsset;
  paperAssetId: string;
  projectDocVersionId: string;
  projectLibraryEntry?: ProjectDocCitationTraceProjectLibraryEntry;
  readerExcerpt?: ProjectDocCitationTraceReaderExcerpt;
  readerExcerptId?: string;
  source: ProjectDocCitationTraceSource;
}

export interface ProjectDocCitationTraceResponse {
  capturedAt: string;
  citations: ProjectDocCitationTraceRow[];
  document: ProjectDocRecord;
  generatedAt: string;
  versionId: string;
  versionNumber: number;
}

export interface ProjectDocNotebookAdoptionProvenance {
  paperAssetIds: string[];
  projectDocId: string;
  projectDocVersionId: string;
  projectDocVersionNumber: number;
  projectId: string;
  projectLibraryEntryIds: string[];
  readerExcerptIds: string[];
  sourceNotebookCapturedAt: string;
  sourceNotebookDocumentId: string;
  sourceNotebookVersionId: string;
  sourceNotebookVersionNumber: number;
}

/**
 * @deprecated Legacy/internal compatibility only. Do not expose this response as
 * a foreground Project Docs bridge for private Notebook drafts.
 */
export interface AdoptNotebookIntoProjectDocResponse {
  citationTrace: ProjectDocCitationTraceResponse;
  provenance: ProjectDocNotebookAdoptionProvenance;
  snapshot: ProjectDocSnapshot;
}

export const PROJECT_DOC_AI_SUGGESTION_JOB_KIND =
  'project-doc.evidence-suggestion';

export interface CreateProjectDocAiSuggestionRequest {
  citationIds?: string[];
  credentialRef: string;
  instruction: string;
  selectedBlockId?: string;
  selectedText?: string;
}

export interface ProjectDocAiSuggestionCitation {
  citationId?: string;
  evidenceSpan?: string;
  libraryEntryId?: string;
  locator?: string;
  paperAssetId: string;
  readerExcerptId?: string;
  sourceState?: ProjectDocCitationTraceSourceState;
  title?: string;
}

export interface ProjectDocAiSuggestion {
  block?: DocumentAiSuggestionBlock;
  citations?: ProjectDocAiSuggestionCitation[];
  rationale?: string;
  text: string;
}

export interface CreateProjectDocAiSuggestionResponse {
  documentId: string;
  job: JobRecord;
  projectId: string;
  suggestion?: ProjectDocAiSuggestion;
}

export const projectDocsContract = 'jixia-project-docs-contract';
