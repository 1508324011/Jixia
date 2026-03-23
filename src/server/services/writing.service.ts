import type {
  CitationLinkRecord,
  PublishState,
  WritingDocumentView,
  WritingDocRecord,
  WritingDocSnapshot,
} from '@shared/contracts/writing';
import type { SpaceMembership } from '@shared/contracts/spaces';

import type { StoredPaperAsset } from './import.service';
import type { StoredSpace } from './spaces.service';
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

export interface GetDocumentRequest {
  actorSpaceId: string;
  actorUserId: string;
  projectId: string;
  spaceId: string;
}

export interface SaveProjectDocumentRequest {
  actorSpaceId: string;
  actorUserId: string;
  citations: Array<{ evidenceSpan?: string; paperAssetId: string }>;
  content: string;
  projectId: string;
  spaceId: string;
  title: string;
}

export interface StoredWritingDoc extends WritingDocRecord {
  ownerUserId: string;
}

export interface WritingStore {
  citationLinks: CitationLinkRecord[];
  docVersions: StoredDocVersion[];
  memberships: SpaceMembership[];
  nextId(prefix: string): string;
  paperAssets: StoredPaperAsset[];
  persist(): void;
  spaces: StoredSpace[];
  versioningService: VersioningService;
  writingDocs: StoredWritingDoc[];
}

export interface WritingService {
  createDocument(input: CreateDocumentRequest): Promise<WritingDocRecord>;
  getDocument(input: GetDocumentRequest): Promise<WritingDocumentView | null>;
  saveDocument(input: SaveDocumentRequest): Promise<WritingDocSnapshot>;
  saveProjectDocument(input: SaveProjectDocumentRequest): Promise<WritingDocumentView>;
  transitionPublishState(
    input: TransitionPublishStateRequest,
  ): Promise<WritingDocRecord>;
}

function buildLatestSnapshot(
  store: WritingStore,
  document: StoredWritingDoc,
): WritingDocSnapshot | null {
  const latestVersion = store.docVersions
    .filter((version) => version.writingDocId === document.id)
    .sort((left, right) => left.versionNumber - right.versionNumber)
    .at(-1);

  if (!latestVersion) {
    return null;
  }

  return {
    capturedAt: latestVersion.createdAt,
    citations: store.citationLinks.filter(
      (citation) => citation.docVersionId === latestVersion.id,
    ),
    content: latestVersion.content,
    doc: document,
    docVersionId: latestVersion.id,
  };
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

function assertActorMembership(
  store: WritingStore,
  actorUserId: string,
  spaceId: string,
): void {
  const actorHasMembership = store.memberships.some(
    (membership) =>
      membership.spaceId === spaceId && membership.userId === actorUserId,
  );

  if (!actorHasMembership) {
    throw new Error('Access denied for the requested space resource.');
  }
}

function assertDocumentAccess(
  actorSpaceId: string,
  actorUserId: string,
  document: StoredWritingDoc,
): void {
  if (
    actorSpaceId !== document.spaceId ||
    actorUserId !== document.ownerUserId
  ) {
    throw new Error('Access denied for the requested writing document.');
  }
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

      if (input.ownerUserId !== input.actorUserId) {
        throw new Error('Writing documents must be created by their owner.');
      }

      if (input.actorSpaceId !== input.spaceId) {
        throw new Error('Access denied for the requested writing document.');
      }

      assertActorMembership(store, input.actorUserId, input.spaceId);

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
    async getDocument(
      input: GetDocumentRequest,
    ): Promise<WritingDocumentView | null> {
      const document = store.writingDocs.find(
        (candidate) =>
          candidate.spaceId === input.spaceId &&
          candidate.ownerUserId === input.actorUserId,
      );

      if (!document) {
        return null;
      }

      assertDocumentAccess(input.actorSpaceId, input.actorUserId, document);

      return {
        documentId: document.id,
        latestSnapshot: buildLatestSnapshot(store, document),
        projectId: input.projectId,
        publishState: document.publishState,
        spaceId: document.spaceId,
        title: document.title,
      };
    },
    async saveDocument(input: SaveDocumentRequest): Promise<WritingDocSnapshot> {
      const document = findDocument(store, input.docId);
      assertDocumentAccess(input.actorSpaceId, input.actorUserId, document);

      return store.versioningService.saveVersion({
        citations: input.citations,
        content: input.content,
        writingDoc: document,
      });
    },
    async saveProjectDocument(
      input: SaveProjectDocumentRequest,
    ): Promise<WritingDocumentView> {
      const existingDocument = await this.getDocument({
        actorSpaceId: input.actorSpaceId,
        actorUserId: input.actorUserId,
        projectId: input.projectId,
        spaceId: input.spaceId,
      });

      const document =
        existingDocument
          ? findDocument(store, existingDocument.documentId)
          : await this.createDocument({
              actorSpaceId: input.actorSpaceId,
              actorUserId: input.actorUserId,
              ownerUserId: input.actorUserId,
              spaceId: input.spaceId,
              title: input.title,
            });

      document.title = input.title;
      store.persist();

      const latestSnapshot = await this.saveDocument({
        actorSpaceId: input.actorSpaceId,
        actorUserId: input.actorUserId,
        citations: input.citations,
        content: input.content,
        docId: document.id,
      });

      return {
        documentId: document.id,
        latestSnapshot,
        projectId: input.projectId,
        publishState: document.publishState,
        spaceId: document.spaceId,
        title: document.title,
      };
    },
    async transitionPublishState(
      input: TransitionPublishStateRequest,
    ): Promise<WritingDocRecord> {
      const document = findDocument(store, input.docId);
      assertDocumentAccess(input.actorSpaceId, input.actorUserId, document);
      document.publishState = input.publishState;
      store.persist();

      return document;
    },
  };
}
