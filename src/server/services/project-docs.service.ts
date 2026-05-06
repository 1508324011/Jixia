import type {
  CreateProjectDocRequest,
  ProjectDocCitationRecord,
  ProjectDocLookup,
  ProjectDocRecord,
  ProjectDocSnapshot,
} from '@shared/contracts/project-docs';

import type {
  LibraryRepository,
  ProjectDocRepository,
  ProjectRepository,
} from '../../db';

import type { LibraryService } from './library.service';

export interface SaveProjectDocRequest {
  citations: Array<{
    evidenceSpan?: string;
    paperAssetId: string;
  }>;
  content: string;
  documentId: string;
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
  return {
    capturedAt: snapshot.capturedAt,
    citations: snapshot.citations.map(mapCitation),
    content: snapshot.content,
    document: mapDocument(snapshot.document),
    versionId: snapshot.versionId,
    versionNumber: snapshot.versionNumber,
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
  citations: Array<{ evidenceSpan?: string; paperAssetId: string }>,
  actorUserId: string,
  projectId: string,
  actorSpaceId: string,
): Promise<Array<{ evidenceSpan?: string; paperAssetId: string }>> {
  const normalizedCitations: Array<{
    evidenceSpan?: string;
    paperAssetId: string;
  }> = [];

  for (const citation of citations) {
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

    normalizedCitations.push({
      evidenceSpan: citation.evidenceSpan,
      paperAssetId: authorizedView.asset.id,
    });
  }

  return normalizedCitations;
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

      const snapshot = await store.projectDocRepository.findLatestSnapshot(
        query.documentId,
      );

      if (!snapshot) {
        return {
          capturedAt: authorized.document.updatedAt,
          citations: [],
          content: '',
          document: authorized.document,
          versionId: `project-doc:${authorized.document.id}:version-0`,
          versionNumber: 0,
        };
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
      const citations = await normalizeAuthorizedCitations(
        store,
        input.citations,
        actorUserId,
        document.projectId,
        projectSpaceId,
      );

      return mapSnapshot(
        await store.projectDocRepository.saveVersion({
          citations,
          content: input.content,
          documentId: input.documentId,
        }),
      );
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
