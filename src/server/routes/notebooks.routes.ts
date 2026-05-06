import type {
  CreateNotebookDocumentRequest,
  NotebookDocumentLookup,
  NotebookDocumentRecord,
  NotebookDocumentSnapshot,
} from '@shared/contracts/notebook';

import type {
  NotebookService,
  SaveNotebookDocumentRequest,
} from '../services/notebooks.service';

export interface NotebooksRoutes {
  createDocument(
    input: CreateNotebookDocumentRequest,
    actorUserId: string,
  ): Promise<NotebookDocumentRecord>;
  getDocument(
    query: NotebookDocumentLookup,
    actorUserId: string,
  ): Promise<NotebookDocumentRecord>;
  saveDocument(
    input: SaveNotebookDocumentRequest,
    actorUserId: string,
  ): Promise<NotebookDocumentSnapshot>;
}

export function createNotebooksRoutes(service: NotebookService): NotebooksRoutes {
  return {
    createDocument(input, actorUserId) {
      return service.createDocument(input, actorUserId);
    },
    getDocument(query, actorUserId) {
      return service.getDocument(query, actorUserId);
    },
    saveDocument(input, actorUserId) {
      return service.saveDocument(input, actorUserId);
    },
  };
}
