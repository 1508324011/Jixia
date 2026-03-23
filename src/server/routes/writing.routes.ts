import type {
  WritingDocRecord,
  WritingDocSnapshot,
} from '@shared/contracts/writing';

import type {
  CreateDocumentRequest,
  SaveDocumentRequest,
  TransitionPublishStateRequest,
  WritingService,
} from '../services/writing.service';

export interface WritingRoutes {
  createDocument(input: CreateDocumentRequest): Promise<WritingDocRecord>;
  saveDocument(input: SaveDocumentRequest): Promise<WritingDocSnapshot>;
  transitionPublishState(
    input: TransitionPublishStateRequest,
  ): Promise<WritingDocRecord>;
}

export function createWritingRoutes(service: WritingService): WritingRoutes {
  return {
    createDocument(input: CreateDocumentRequest): Promise<WritingDocRecord> {
      return service.createDocument(input);
    },
    saveDocument(input: SaveDocumentRequest): Promise<WritingDocSnapshot> {
      return service.saveDocument(input);
    },
    transitionPublishState(
      input: TransitionPublishStateRequest,
    ): Promise<WritingDocRecord> {
      return service.transitionPublishState(input);
    },
  };
}
