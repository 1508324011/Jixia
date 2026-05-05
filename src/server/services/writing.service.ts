import type {
  PublishState,
  WritingDocRecord,
  WritingDocSnapshot,
} from '@shared/contracts/writing';
import type { SpaceRepository } from '../../db';

import type { StoredDocVersion, VersioningService } from './versioning.service';

export interface CreateDocumentRequest {
  actorSpaceId: string;
  actorUserId: string;
  ownerUserId: string;
  spaceId: string;
  title: string;
}

export interface SaveDocumentRequest {
  actorSpaceId: string;
  actorUserId: string;
  citations: Array<{ evidenceSpan?: string; paperAssetId: string }>;
  content: string;
  docId: string;
}

export interface TransitionPublishStateRequest {
  actorSpaceId: string;
  actorUserId: string;
  docId: string;
  publishState: PublishState;
}

export interface StoredWritingDoc extends WritingDocRecord {
  ownerUserId: string;
}

export interface WritingStore {
  docVersions: StoredDocVersion[];
  nextId(prefix: string): string;
  persist(): void;
  spaceRepository: SpaceRepository;
  versioningService: VersioningService;
  writingDocs: StoredWritingDoc[];
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
): StoredWritingDoc {
  const document = store.writingDocs.find((candidate) => candidate.id === docId);

  if (!document) {
    throw new Error(`Writing document ${docId} does not exist.`);
  }

  return document;
}

async function assertActorMembership(
  store: WritingStore,
  actorUserId: string,
  spaceId: string,
): Promise<void> {
  await store.spaceRepository.denyNonMember(spaceId, actorUserId);
}

async function assertDocumentAccess(
  store: WritingStore,
  actorSpaceId: string,
  actorUserId: string,
  document: StoredWritingDoc,
): Promise<void> {
  if (
    actorSpaceId !== document.spaceId ||
    actorUserId !== document.ownerUserId
  ) {
    throw new Error('Access denied for the requested writing document.');
  }

  await assertActorMembership(store, actorUserId, document.spaceId);
}

export function createWritingService(store: WritingStore): WritingService {
  return {
    async createDocument(
      input: CreateDocumentRequest,
    ): Promise<WritingDocRecord> {
      const spaceExists = await store.spaceRepository.findSpace(input.spaceId);

      if (!spaceExists) {
        throw new Error(`Space ${input.spaceId} does not exist.`);
      }

      if (input.ownerUserId !== input.actorUserId) {
        throw new Error('Writing documents must be created by their owner.');
      }

      if (input.actorSpaceId !== input.spaceId) {
        throw new Error('Access denied for the requested writing document.');
      }

      await assertActorMembership(store, input.actorUserId, input.spaceId);

      const document: StoredWritingDoc = {
        createdAt: new Date().toISOString(),
        id: store.nextId('doc'),
        ownerUserId: input.ownerUserId,
        publishState: 'draft',
        spaceId: input.spaceId,
        title: input.title,
      };

      store.writingDocs.push(document);
      store.persist();

      return document;
    },
    async saveDocument(input: SaveDocumentRequest): Promise<WritingDocSnapshot> {
      const document = findDocument(store, input.docId);
      await assertDocumentAccess(
        store,
        input.actorSpaceId,
        input.actorUserId,
        document,
      );

      return store.versioningService.saveVersion({
        actorSpaceId: input.actorSpaceId,
        actorUserId: input.actorUserId,
        citations: input.citations,
        content: input.content,
        writingDoc: document,
      });
    },
    async transitionPublishState(
      input: TransitionPublishStateRequest,
    ): Promise<WritingDocRecord> {
      const document = findDocument(store, input.docId);
      await assertDocumentAccess(
        store,
        input.actorSpaceId,
        input.actorUserId,
        document,
      );
      document.publishState = input.publishState;
      store.persist();

      return document;
    },
  };
}
