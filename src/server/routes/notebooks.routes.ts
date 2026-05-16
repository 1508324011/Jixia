import type {
  CaptureNotebookEvidenceRequest,
  CaptureNotebookEvidenceResponse,
  CreateNotebookDocumentRequest,
  ListNotebookDocumentsResponse,
  NotebookDocumentLookup,
  NotebookDocumentRecord,
  NotebookDocumentSnapshot,
} from '@shared/contracts/notebook';

import type {
  NotebookService,
  SaveNotebookDocumentRequest,
} from '../services/notebooks.service';

export interface NotebooksRoutes {
  captureEvidence(
    input: CaptureNotebookEvidenceRequest,
    actorUserId: string,
  ): Promise<CaptureNotebookEvidenceResponse>;
  createDocument(
    input: CreateNotebookDocumentRequest,
    actorUserId: string,
  ): Promise<NotebookDocumentRecord>;
  getDocument(
    query: NotebookDocumentLookup,
    actorUserId: string,
  ): Promise<NotebookDocumentRecord>;
  getLatestSnapshot(
    query: NotebookDocumentLookup,
    actorUserId: string,
  ): Promise<NotebookDocumentSnapshot>;
  listDocuments(actorUserId: string): Promise<ListNotebookDocumentsResponse>;
  saveDocument(
    input: SaveNotebookDocumentRequest,
    actorUserId: string,
  ): Promise<NotebookDocumentSnapshot>;
}

export function createNotebooksRoutes(service: NotebookService): NotebooksRoutes {
  return {
    captureEvidence(input, actorUserId) {
      return service.captureEvidence(input, actorUserId);
    },
    createDocument(input, actorUserId) {
      return service.createDocument(input, actorUserId);
    },
    getDocument(query, actorUserId) {
      return service.getDocument(query, actorUserId);
    },
    getLatestSnapshot(query, actorUserId) {
      return service.getLatestSnapshot(query, actorUserId);
    },
    listDocuments(actorUserId) {
      return service.listDocuments(actorUserId);
    },
    saveDocument(input, actorUserId) {
      return service.saveDocument(input, actorUserId);
    },
  };
}
