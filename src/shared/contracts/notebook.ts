import type {
  DocumentCitationRecordBase,
  DocumentSnapshot,
} from './document-snapshot';

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
