import type {
  DocumentBlockDocument,
  DocumentBlockReference,
} from '@shared/contracts/document-content';
import {
  createEmptyDocumentBlockDocument,
  documentBlockDocumentToLegacyText,
  extractDocumentBlockReferences,
  legacyTextToDocumentBlockDocument,
  normalizeDocumentBlockDocument,
  normalizePersistedDocumentSnapshot,
  serializeDocumentBlockSnapshotPayload,
} from '@shared/contracts/document-content';
import type {
  CreateProjectDocRequest,
  ProjectDocCitationRecord,
  ProjectDocLookup,
  ProjectDocRecord,
  ProjectDocSnapshot,
} from '@shared/contracts/project-docs';
import type { WritingDocumentView, WritingDocSnapshot } from '@shared/contracts/writing';

import type {
  LibraryRepository,
  ProjectDocRepository,
  ProjectRepository,
} from '../../db';

import type { LibraryService } from './library.service';

export interface SaveProjectDocRequest {
  citations: ProjectDocCitationInput[];
  content?: string;
  documentId: string;
  documentContent?: DocumentBlockDocument;
}

export interface TransitionProjectDocPublishStateRequest {
  documentId: string;
  publishState: ProjectDocRecord['publishState'];
}

export interface ProjectDocsService {
  createDocument(
    input: CreateProjectDocRequest,
    actorUserId: string,
  ): Promise<ProjectDocRecord>;
  findLatestProjectDocument(
    projectId: string,
    actorUserId: string,
  ): Promise<ProjectDocRecord | null>;
  getDocument(
    query: ProjectDocLookup,
    actorUserId: string,
  ): Promise<ProjectDocSnapshot>;
  saveDocument(
    input: SaveProjectDocRequest,
    actorUserId: string,
  ): Promise<ProjectDocSnapshot>;
  getWorkbenchDocument(
    projectId: string,
    actorUserId: string,
  ): Promise<WritingDocumentView | null>;
  saveWorkbenchDocument(
    input: {
      citations: ProjectDocCitationInput[];
      content?: string;
      documentContent?: DocumentBlockDocument;
      projectId: string;
      title: string;
    },
    actorUserId: string,
  ): Promise<WritingDocumentView>;
  transitionPublishState(
    input: TransitionProjectDocPublishStateRequest,
    actorUserId: string,
  ): Promise<ProjectDocRecord>;
}

export interface ProjectDocsStore {
  libraryRepository: LibraryRepository;
  libraryService: LibraryService;
  projectDocRepository: ProjectDocRepository;
  projectRepository: ProjectRepository;
}

interface ProjectDocCitationInput {
  evidenceSpan?: string;
  libraryEntryId?: string;
  paperAssetId: string;
}

function mapCitation(citation: {
  createdAt: string;
  evidenceSpan?: string;
  id: string;
  paperAssetId: string;
  projectDocVersionId: string;
}): ProjectDocCitationRecord {
  return {
    createdAt: citation.createdAt,
    evidenceSpan: citation.evidenceSpan,
    id: citation.id,
    paperAssetId: citation.paperAssetId,
    projectDocVersionId: citation.projectDocVersionId,
  };
}

function mapDocument(document: {
  createdAt: string;
  createdByUserId: string;
  id: string;
  projectId: string;
  publishState: ProjectDocRecord['publishState'];
  title: string;
  updatedAt: string;
}): ProjectDocRecord {
  return {
    createdAt: document.createdAt,
    createdByUserId: document.createdByUserId,
    id: document.id,
    projectId: document.projectId,
    publishState: document.publishState,
    title: document.title,
    updatedAt: document.updatedAt,
  };
}

function mapSnapshot(snapshot: {
  capturedAt: string;
  citations: Array<{
    createdAt: string;
    evidenceSpan?: string;
    id: string;
    paperAssetId: string;
    projectDocVersionId: string;
  }>;
  content: string;
  document: {
    createdAt: string;
    createdByUserId: string;
    id: string;
    projectId: string;
    publishState: ProjectDocRecord['publishState'];
    title: string;
    updatedAt: string;
  };
  versionId: string;
  versionNumber: number;
}): ProjectDocSnapshot {
  const documentContent = normalizePersistedDocumentSnapshot(snapshot.content);

  return {
    capturedAt: snapshot.capturedAt,
    citations: snapshot.citations.map(mapCitation),
    content: documentBlockDocumentToLegacyText(documentContent),
    document: mapDocument(snapshot.document),
    documentContent,
    versionId: snapshot.versionId,
    versionNumber: snapshot.versionNumber,
  };
}

function mapWritingSnapshot(
  snapshot: ProjectDocSnapshot,
  projectId: string,
  spaceId: string,
): WritingDocSnapshot {
  return {
    capturedAt: snapshot.capturedAt,
    citations: snapshot.citations.map((citation) => ({
      docVersionId: citation.projectDocVersionId,
      evidenceSpan: citation.evidenceSpan,
      id: citation.id,
      paperAssetId: citation.paperAssetId,
    })),
    content: snapshot.content,
    documentContent: snapshot.documentContent,
    doc: {
      createdAt: snapshot.document.createdAt,
      id: snapshot.document.id,
      projectId,
      publishState: snapshot.document.publishState,
      spaceId,
      title: snapshot.document.title,
      updatedAt: snapshot.document.updatedAt,
    },
    docVersionId: snapshot.versionId,
    versionNumber: snapshot.versionNumber,
  };
}

function createEmptySnapshot(document: ProjectDocRecord): ProjectDocSnapshot {
  return {
    capturedAt: document.updatedAt,
    citations: [],
    content: '',
    document,
    documentContent: createEmptyDocumentBlockDocument(),
    versionId: `project-doc:${document.id}:version-0`,
    versionNumber: 0,
  };
}

function normalizeSaveDocumentContent(input: {
  content?: string;
  documentContent?: DocumentBlockDocument;
}): DocumentBlockDocument {
  if (typeof input.documentContent !== 'undefined') {
    return normalizeDocumentBlockDocument(input.documentContent);
  }

  if (typeof input.content !== 'string') {
    throw new Error('content is required when documentContent is not provided.');
  }

  return legacyTextToDocumentBlockDocument(input.content);
}

function referenceToCitationInput(
  reference: DocumentBlockReference,
): ProjectDocCitationInput {
  return {
    evidenceSpan: reference.evidenceSpan,
    libraryEntryId: reference.libraryEntryId,
    paperAssetId: reference.paperAssetId,
  };
}

function mergeCitationInputs(
  explicitCitations: ProjectDocCitationInput[],
  documentContent: DocumentBlockDocument,
): ProjectDocCitationInput[] {
  return [
    ...explicitCitations,
    ...extractDocumentBlockReferences(documentContent).map(referenceToCitationInput),
  ];
}

function dedupeNormalizedCitations(
  citations: Array<{ evidenceSpan?: string; paperAssetId: string }>,
): Array<{ evidenceSpan?: string; paperAssetId: string }> {
  const byAsset = new Map<string, string[]>();

  for (const citation of citations) {
    const spans = byAsset.get(citation.paperAssetId) ?? [];
    const evidenceSpan = citation.evidenceSpan?.trim();

    if (evidenceSpan && !spans.includes(evidenceSpan)) {
      spans.push(evidenceSpan);
    }

    byAsset.set(citation.paperAssetId, spans);
  }

  return [...byAsset.entries()].map(([paperAssetId, evidenceSpans]) => ({
    evidenceSpan: evidenceSpans.length ? evidenceSpans.join('\n\n') : undefined,
    paperAssetId,
  }));
}

function mapWritingDocument(
  document: ProjectDocRecord,
  spaceId: string,
  latestSnapshot: ProjectDocSnapshot | null,
): WritingDocumentView {
  return {
    documentId: document.id,
    latestSnapshot: latestSnapshot
      ? mapWritingSnapshot(latestSnapshot, document.projectId, spaceId)
      : null,
    projectId: document.projectId,
    publishState: document.publishState,
    spaceId,
    title: document.title,
  };
}

async function getAuthorizedProject(
  store: ProjectDocsStore,
  projectId: string,
  actorUserId: string,
): Promise<{
  membership: Awaited<ReturnType<ProjectRepository['getProjectMember']>>;
  project: NonNullable<Awaited<ReturnType<ProjectRepository['findProject']>>>;
}> {
  const membership = await store.projectRepository.getProjectMember(projectId, actorUserId);

  if (!membership) {
    throw new Error('Access denied for the requested project document.');
  }

  const project = await store.projectRepository.findProject(projectId);

  if (!project) {
    throw new Error(`Project ${projectId} does not exist.`);
  }

  return {
    membership,
    project,
  };
}

async function getAuthorizedProjectDoc(
  store: ProjectDocsStore,
  documentId: string,
  actorUserId: string,
): Promise<{
  canWrite: boolean;
  document: ProjectDocRecord;
  projectSpaceId: string;
}> {
  const document = await store.projectDocRepository.findDocument(documentId);

  if (!document) {
    throw new Error(`Project document ${documentId} does not exist.`);
  }

  const membership = await store.projectRepository.getProjectMember(
    document.projectId,
    actorUserId,
  );

  if (!membership) {
    throw new Error('Access denied for the requested project document.');
  }

  const project = await store.projectRepository.findProject(document.projectId);

  if (!project) {
    throw new Error(`Project ${document.projectId} does not exist.`);
  }

  return {
    canWrite: membership.role === 'owner' || membership.role === 'editor',
    document: mapDocument(document),
    projectSpaceId: project.spaceId,
  };
}

async function assertProjectWriteAccess(
  store: ProjectDocsStore,
  documentId: string,
  actorUserId: string,
): Promise<{
  document: ProjectDocRecord;
  projectSpaceId: string;
}> {
  const authorized = await getAuthorizedProjectDoc(store, documentId, actorUserId);

  if (!authorized.canWrite) {
    throw new Error('Access denied for the requested project document mutation.');
  }

  return {
    document: authorized.document,
    projectSpaceId: authorized.projectSpaceId,
  };
}

async function normalizeAuthorizedCitations(
  store: ProjectDocsStore,
  citations: ProjectDocCitationInput[],
  actorUserId: string,
  projectId: string,
  actorSpaceId: string,
): Promise<Array<{ evidenceSpan?: string; paperAssetId: string }>> {
  const normalizedCitations: Array<{
    evidenceSpan?: string;
    paperAssetId: string;
  }> = [];

  for (const citation of citations) {
    if (citation.libraryEntryId) {
      const authorizedView = await store.libraryService.assertCanAccessEntry(
        citation.libraryEntryId,
        actorUserId,
        actorSpaceId,
      );

      if (
        authorizedView.entry.scope.type !== 'project' ||
        authorizedView.entry.scope.id !== projectId
      ) {
        throw new Error(
          `Paper asset ${authorizedView.asset.id} is not available in project ${projectId}.`,
        );
      }

      if (authorizedView.asset.id !== citation.paperAssetId) {
        throw new Error(
          `Document reference ${citation.paperAssetId} does not match library entry ${citation.libraryEntryId}.`,
        );
      }

      normalizedCitations.push({
        evidenceSpan: citation.evidenceSpan,
        paperAssetId: authorizedView.asset.id,
      });
      continue;
    }

    const directEntry = await store.libraryRepository.getLibraryEntry(
      citation.paperAssetId,
    );

    if (directEntry) {
      const authorizedView = await store.libraryService.assertCanAccessEntry(
        citation.paperAssetId,
        actorUserId,
        actorSpaceId,
      );

      if (
        authorizedView.entry.scope.type !== 'project' ||
        authorizedView.entry.scope.id !== projectId
      ) {
        throw new Error(
          `Paper asset ${authorizedView.asset.id} is not available in project ${projectId}.`,
        );
      }

      normalizedCitations.push({
        evidenceSpan: citation.evidenceSpan,
        paperAssetId: authorizedView.asset.id,
      });
      continue;
    }

    const projectScopedView = (
      await store.libraryRepository.listLibraryEntriesForAsset(citation.paperAssetId)
    ).find(
      (view) =>
        view.entry.scope.type === 'project' &&
        view.entry.scope.id === projectId,
    );

    if (!projectScopedView) {
      const existingAsset = await store.libraryRepository.findPaperAsset(
        citation.paperAssetId,
      );

      if (!existingAsset) {
        throw new Error(`Paper asset ${citation.paperAssetId} does not exist.`);
      }

      throw new Error(
        `Paper asset ${citation.paperAssetId} is not available in project ${projectId}.`,
      );
    }

    const authorizedView = await store.libraryService.assertCanAccessEntry(
      projectScopedView.entry.id,
      actorUserId,
      actorSpaceId,
    );

    if (
      authorizedView.entry.id !== projectScopedView.entry.id ||
      authorizedView.entry.scope.type !== 'project' ||
      authorizedView.entry.scope.id !== projectId
    ) {
      throw new Error(
        `Paper asset ${citation.paperAssetId} is not available in project ${projectId}.`,
      );
    }

    normalizedCitations.push({
      evidenceSpan: citation.evidenceSpan,
      paperAssetId: authorizedView.asset.id,
    });
  }

  return dedupeNormalizedCitations(normalizedCitations);
}

export function createProjectDocsService(
  store: ProjectDocsStore,
): ProjectDocsService {
  return {
    async createDocument(
      input: CreateProjectDocRequest,
      actorUserId: string,
    ): Promise<ProjectDocRecord> {
      if (input.createdByUserId && input.createdByUserId !== actorUserId) {
        throw new Error('Project documents must be created by the active actor.');
      }

      const membership = await store.projectRepository.getProjectMember(
        input.projectId,
        actorUserId,
      );

      if (!membership) {
        throw new Error('Access denied for the requested project document.');
      }

      if (membership.role === 'viewer') {
        throw new Error('Access denied for the requested project document mutation.');
      }

      return mapDocument(
        await store.projectDocRepository.createDocument({
          createdByUserId: actorUserId,
          projectId: input.projectId,
          publishState: input.publishState,
          title: input.title,
        }),
      );
    },
    async findLatestProjectDocument(
      projectId: string,
      actorUserId: string,
    ): Promise<ProjectDocRecord | null> {
      const membership = await store.projectRepository.getProjectMember(
        projectId,
        actorUserId,
      );

      if (!membership) {
        throw new Error('Access denied for the requested project document.');
      }

      const document = await store.projectDocRepository.findLatestDocumentForProject(projectId);

      return document ? mapDocument(document) : null;
    },
    async getDocument(
      query: ProjectDocLookup,
      actorUserId: string,
    ): Promise<ProjectDocSnapshot> {
      const authorized = await getAuthorizedProjectDoc(
        store,
        query.documentId,
        actorUserId,
      );

      const snapshot = await store.projectDocRepository.getLatestSnapshot(
        query.documentId,
      );

      if (!snapshot) {
        return createEmptySnapshot(authorized.document);
      }

      return mapSnapshot(snapshot);
    },
    async saveDocument(
      input: SaveProjectDocRequest,
      actorUserId: string,
    ): Promise<ProjectDocSnapshot> {
      const { document, projectSpaceId } = await assertProjectWriteAccess(
        store,
        input.documentId,
        actorUserId,
      );
      const documentContent = normalizeSaveDocumentContent(input);
      const citations = await normalizeAuthorizedCitations(
        store,
        mergeCitationInputs(input.citations, documentContent),
        actorUserId,
        document.projectId,
        projectSpaceId,
      );

      return mapSnapshot(
        await store.projectDocRepository.saveVersion({
          citations,
          content: serializeDocumentBlockSnapshotPayload(documentContent),
          documentId: input.documentId,
        }),
      );
    },
    async getWorkbenchDocument(
      projectId: string,
      actorUserId: string,
    ): Promise<WritingDocumentView | null> {
      const { project } = await getAuthorizedProject(store, projectId, actorUserId);
      const document = await store.projectDocRepository.findLatestDocumentForProject(projectId);

      if (!document) {
        return null;
      }

      const latestSnapshot = await store.projectDocRepository.getLatestSnapshot(document.id);

      return mapWritingDocument(
        mapDocument(document),
        project.spaceId,
        latestSnapshot ? mapSnapshot(latestSnapshot) : null,
      );
    },
    async saveWorkbenchDocument(
      input: {
        citations: ProjectDocCitationInput[];
        content?: string;
        documentContent?: DocumentBlockDocument;
        projectId: string;
        title: string;
      },
      actorUserId: string,
    ): Promise<WritingDocumentView> {
      const { membership, project } = await getAuthorizedProject(
        store,
        input.projectId,
        actorUserId,
      );

      if (membership?.role === 'viewer') {
        throw new Error('Access denied for the requested project document mutation.');
      }

      let document = await store.projectDocRepository.findLatestDocumentForProject(input.projectId);

      if (!document) {
        document = await store.projectDocRepository.createDocument({
          createdByUserId: actorUserId,
          projectId: input.projectId,
          title: input.title,
        });
      }

      const snapshot = await this.saveDocument(
        {
          citations: input.citations,
          content: input.content,
          documentContent: input.documentContent,
          documentId: document.id,
        },
        actorUserId,
      );

      return mapWritingDocument(snapshot.document, project.spaceId, snapshot);
    },
    async transitionPublishState(
      input: TransitionProjectDocPublishStateRequest,
      actorUserId: string,
    ): Promise<ProjectDocRecord> {
      await assertProjectWriteAccess(store, input.documentId, actorUserId);

      return mapDocument(
        await store.projectDocRepository.updatePublishState(
          input.documentId,
          input.publishState,
        ),
      );
    },
  };
}
