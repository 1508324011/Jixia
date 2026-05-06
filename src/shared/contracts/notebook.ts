export interface CreateNotebookDocumentRequest {
  ownerId?: string;
  title: string;
}

export interface NotebookDocumentLookup {
  documentId: string;
}

export interface NotebookCitationRecord {
  createdAt: string;
  evidenceSpan?: string;
  id: string;
  notebookDocumentVersionId: string;
  paperAssetId: string;
}

export interface NotebookDocumentRecord {
  createdAt: string;
  id: string;
  ownerId: string;
  title: string;
  updatedAt: string;
}

export interface NotebookDocumentSnapshot {
  capturedAt: string;
  citations: NotebookCitationRecord[];
  content: string;
  document: NotebookDocumentRecord;
  versionId: string;
  versionNumber: number;
}

export const notebookContract = 'jixia-notebook-contract';
