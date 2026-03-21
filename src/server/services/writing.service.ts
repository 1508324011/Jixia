import type {
  PublishState,
  WritingDocRecord,
  WritingDocSnapshot,
} from '@shared/contracts/writing';

import type { StoredSpace } from './spaces.service';
import type { StoredDocVersion, VersioningService } from './versioning.service';

export interface CreateDocumentRequest {
  ownerUserId: string;
  spaceId: string;
  title: string;
}

export interface SaveDocumentRequest {
  citations: Array<{ evidenceSpan?: string; paperAssetId: string }>;
  content: string;
  docId: string;
}

export interface TransitionPublishStateRequest {
  docId: string;
  publishState: PublishState;
}

export interface WritingStore {
  docVersions: StoredDocVersion[];
  nextId(prefix: string): string;
  spaces: StoredSpace[];
  versioningService: VersioningService;
  writingDocs: WritingDocRecord[];
}

export interface WritingService {
  createDocument(input: CreateDocumentRequest): Promise<WritingDocRecord>;
  saveDocument(input: SaveDocumentRequest): Promise<WritingDocSnapshot>;
  transitionPublishState(
    input: TransitionPublishStateRequest,
  ): Promise<WritingDocRecord>;
}

function findDocument(
  store: WritingStore,
  docId: string,
): WritingDocRecord {
  const document = store.writingDocs.find((candidate) => candidate.id === docId);

  if (!document) {
    throw new Error(`Writing document ${docId} does not exist.`);
  }

  return document;
}

export function createWritingService(store: WritingStore): WritingService {
  return {
    async createDocument(
      input: CreateDocumentRequest,
    ): Promise<WritingDocRecord> {
      const spaceExists = store.spaces.some(
        (space) => space.id === input.spaceId,
      );

      if (!spaceExists) {
        throw new Error(`Space ${input.spaceId} does not exist.`);
      }

      const document: WritingDocRecord = {
        createdAt: new Date().toISOString(),
        id: store.nextId('doc'),
        publishState: 'draft',
        spaceId: input.spaceId,
        title: input.title,
      };

      store.writingDocs.push(document);

      return document;
    },
    async saveDocument(input: SaveDocumentRequest): Promise<WritingDocSnapshot> {
      const document = findDocument(store, input.docId);

      return store.versioningService.saveVersion({
        citations: input.citations,
        content: input.content,
        writingDoc: document,
      });
    },
    async transitionPublishState(
      input: TransitionPublishStateRequest,
    ): Promise<WritingDocRecord> {
      const document = findDocument(store, input.docId);
      document.publishState = input.publishState;

      return document;
    },
  };
}
