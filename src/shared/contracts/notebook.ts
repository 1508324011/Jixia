import type {
  DocumentCitationRecordBase,
  DocumentSnapshot,
} from './document-snapshot';
import type { SourceContextRef } from './reader-annotations';
import type { SourceTextRangeLocator } from './source-text';

export interface CreateNotebookDocumentRequest {
  ownerId?: string;
  title: string;
}

export interface NotebookDocumentLookup {
  documentId: string;
}

export interface ListNotebookDocumentsResponse {
  documents: NotebookDocumentRecord[];
}

export interface NotebookGeneratedInsightCaptureSource {
  generatedInsightId: string;
  libraryEntryId: string;
  note?: string;
  type: 'generatedInsight';
}

export interface NotebookReaderExcerptCaptureSource {
  libraryEntryId?: string;
  note?: string;
  readerExcerptId: string;
  type: 'readerExcerpt';
}

export type NotebookEvidenceCaptureSource =
  | NotebookGeneratedInsightCaptureSource
  | NotebookReaderExcerptCaptureSource;

export interface CaptureNotebookEvidenceRequest {
  notebookDocumentId?: string;
  notebookTitle?: string;
  source: NotebookEvidenceCaptureSource;
}

export interface NotebookSourceExcerptBlock {
  capturedAt: string;
  evidenceSpan?: string;
  libraryEntryId?: string;
  locator?: string;
  note?: string;
  paperAssetId: string;
  quote: string;
  readerExcerptId?: string;
  title?: string;
  type: 'sourceExcerpt';
}

export interface ReaderNotebookBindingRecord {
  createdAt: string;
  notebookDocumentId: string;
  sourceContext: SourceContextRef;
  updatedAt: string;
}

export interface GetReaderDefaultNotebookRequest {
  sourceContext: SourceContextRef;
}

export interface ReaderDefaultNotebookResponse {
  binding: ReaderNotebookBindingRecord;
  document: NotebookDocumentRecord;
}

export type NotebookSourceLinkSourceType =
  | 'generatedInsight'
  | 'projectDocCitation'
  | 'readerAnnotation'
  | 'readerExcerpt'
  | 'sourceTextArtifactRange';

export interface NotebookSourceLinkRecord {
  createdAt: string;
  evidenceSpan?: string;
  id: string;
  locator?: SourceTextRangeLocator;
  notebookDocumentVersionId: string;
  paperAssetId?: string;
  readerAnnotationId?: string;
  sourceId: string;
  sourceLibraryEntryId?: string;
  sourceTextArtifactId?: string;
  sourceType: NotebookSourceLinkSourceType;
  sourceVersionId?: string;
}

export interface NotebookDocumentSnapshotWithSourceLinks
  extends NotebookDocumentSnapshot {
  sourceLinks: NotebookSourceLinkRecord[];
}

export interface CaptureNotebookEvidenceResponse {
  document: NotebookDocumentRecord;
  snapshot: NotebookDocumentSnapshot;
}

export interface NotebookCitationRecord extends DocumentCitationRecordBase {
  notebookDocumentVersionId: string;
}

export interface NotebookDocumentRecord {
  createdAt: string;
  id: string;
  ownerId: string;
  title: string;
  updatedAt: string;
}

export type NotebookDocumentSnapshot = DocumentSnapshot<
  NotebookDocumentRecord,
  NotebookCitationRecord
>;

export const notebookContract = 'jixia-notebook-contract';
