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
