import type {
  DocumentCitationRecordBase,
  DocumentSnapshot,
} from './document-snapshot';
import type { PublishState } from './writing';

export interface CreateProjectDocRequest {
  projectId: string;
  publishState?: PublishState;
  title: string;
}

export interface ProjectDocLookup {
  documentId: string;
}

export interface ProjectDocCitationRecord extends DocumentCitationRecordBase {
  projectDocVersionId: string;
}

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

export const projectDocsContract = 'jixia-project-docs-contract';
