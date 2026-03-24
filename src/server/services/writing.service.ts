import type {
  CitationLinkRecord,
  PublishState,
  ProjectDocumentPresenceRecord,
  ProjectOwnedWritingDocRecord,
  ProjectReferenceRecord,
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

export type StoredWritingDoc = WritingDocRecord;

export interface WritingStore {
  citationLinks: CitationLinkRecord[];
  docVersions: StoredDocVersion[];
  memberships: SpaceMembership[];
  nextId(prefix: string): string;
  paperAssets: StoredPaperAsset[];
  persist(): void;
  projectDocumentPresences: ProjectDocumentPresenceRecord[];
  projectReferences: ProjectReferenceRecord[];
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

function findDocument(store: WritingStore, docId: string): StoredWritingDoc {
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
  store: WritingStore,
  actorSpaceId: string,
  actorUserId: string,
  document: StoredWritingDoc,
): void {
  assertActorMembership(store, actorUserId, document.spaceId);

  if (actorSpaceId !== document.spaceId) {
    throw new Error('Access denied for the requested writing document.');
  }

  if (document.ownerType === 'user' && actorUserId !== document.ownerUserId) {
    throw new Error('Access denied for the requested writing document.');
  }
}

function findProjectDocument(
  store: WritingStore,
  projectId: string,
  spaceId: string,
): ProjectOwnedWritingDocRecord | undefined {
  const document = store.writingDocs.find(
    (candidate) =>
      candidate.ownerType === 'project' &&
      candidate.projectId === projectId &&
      candidate.spaceId === spaceId,
  );

  return document?.ownerType === 'project' ? document : undefined;
}

function buildProjectReferences(
  store: WritingStore,
  document: StoredWritingDoc,
): ProjectReferenceRecord[] {
  if (document.ownerType !== 'project') {
    return [];
  }

  return store.projectReferences.filter(
    (reference) =>
      reference.documentId === document.id &&
      reference.ownerType === 'project' &&
      reference.projectId === document.projectId,
  );
}

function toWritingDocumentView(
  store: WritingStore,
  document: ProjectOwnedWritingDocRecord,
  projectId: string,
  latestSnapshot = buildLatestSnapshot(store, document),
): WritingDocumentView {
  return {
    documentId: document.id,
    latestSnapshot,
    ownerType: 'project',
    projectId,
    publishState: document.publishState,
    references: buildProjectReferences(store, document),
    spaceId: document.spaceId,
    title: document.title,
  };
}

function touchProjectPresence(
  store: WritingStore,
  input: { documentId: string; projectId: string; userId: string },
): void {
  const existingPresence = store.projectDocumentPresences.find(
    (presence) =>
      presence.projectId === input.projectId && presence.userId === input.userId,
  );

  if (existingPresence) {
    existingPresence.activeDocumentId = input.documentId;
    existingPresence.updatedAt = new Date().toISOString();
    store.persist();
    return;
  }

  store.projectDocumentPresences.push({
    activeDocumentId: input.documentId,
    id: store.nextId('project-document-presence'),
    projectId: input.projectId,
    updatedAt: new Date().toISOString(),
    userId: input.userId,
  });
  store.persist();
}

export function createWritingService(store: WritingStore): WritingService {
  return {
    async createDocument(input: CreateDocumentRequest): Promise<WritingDocRecord> {
      const spaceExists = store.spaces.some((space) => space.id === input.spaceId);

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
        ownerType: 'user',
        ownerUserId: input.ownerUserId,
        publishState: 'draft',
        spaceId: input.spaceId,
        title: input.title,
      };

      store.writingDocs.push(document);
      store.persist();

      return document;
    },
    async getDocument(input: GetDocumentRequest): Promise<WritingDocumentView | null> {
      const document = findProjectDocument(store, input.projectId, input.spaceId);

      if (!document) {
        return null;
      }

      assertDocumentAccess(store, input.actorSpaceId, input.actorUserId, document);
      touchProjectPresence(store, {
        documentId: document.id,
        projectId: input.projectId,
        userId: input.actorUserId,
      });

      return toWritingDocumentView(store, document, input.projectId);
    },
    async saveDocument(input: SaveDocumentRequest): Promise<WritingDocSnapshot> {
      const document = findDocument(store, input.docId);
      assertDocumentAccess(store, input.actorSpaceId, input.actorUserId, document);

      return store.versioningService.saveVersion({
        citations: input.citations,
        content: input.content,
        writingDoc: document,
      });
    },
    async saveProjectDocument(
      input: SaveProjectDocumentRequest,
    ): Promise<WritingDocumentView> {
      assertActorMembership(store, input.actorUserId, input.spaceId);
      const existingDocument = findProjectDocument(
        store,
        input.projectId,
        input.spaceId,
      );

      const document = existingDocument
        ? existingDocument
        : {
            createdAt: new Date().toISOString(),
            id: store.nextId('doc'),
            ownerType: 'project',
            projectId: input.projectId,
            publishState: 'draft',
            spaceId: input.spaceId,
            title: input.title,
          } satisfies ProjectOwnedWritingDocRecord;

      if (!existingDocument) {
        store.writingDocs.push(document);
      }

      document.title = input.title;
      store.persist();

      const latestSnapshot = await this.saveDocument({
        actorSpaceId: input.actorSpaceId,
        actorUserId: input.actorUserId,
        citations: input.citations,
        content: input.content,
        docId: document.id,
      });
      touchProjectPresence(store, {
        documentId: document.id,
        projectId: input.projectId,
        userId: input.actorUserId,
      });

      return toWritingDocumentView(store, document, input.projectId, latestSnapshot);
    },
    async transitionPublishState(
      input: TransitionPublishStateRequest,
    ): Promise<WritingDocRecord> {
      const document = findDocument(store, input.docId);
      assertDocumentAccess(store, input.actorSpaceId, input.actorUserId, document);
      document.publishState = input.publishState;
      store.persist();

      return document;
    },
  };
}
