import type {
  CreateProjectDocRequest,
  ProjectDocLookup,
  ProjectDocRecord,
  ProjectDocSnapshot,
} from '@shared/contracts/project-docs';
import type { WritingDocumentView } from '@shared/contracts/writing';
import type { DocumentBlockDocument } from '@shared/contracts/document-content';

import type {
  ProjectDocsService,
  SaveProjectDocRequest,
  TransitionProjectDocPublishStateRequest,
} from '../services/project-docs.service';

export interface ProjectDocsRoutes {
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
      citations: Array<{
        evidenceSpan?: string;
        libraryEntryId?: string;
        paperAssetId: string;
      }>;
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

export function createProjectDocsRoutes(
  service: ProjectDocsService,
): ProjectDocsRoutes {
  return {
    createDocument(input, actorUserId) {
      return service.createDocument(input, actorUserId);
    },
    findLatestProjectDocument(projectId, actorUserId) {
      return service.findLatestProjectDocument(projectId, actorUserId);
    },
    getDocument(query, actorUserId) {
      return service.getDocument(query, actorUserId);
    },
    saveDocument(input, actorUserId) {
      return service.saveDocument(input, actorUserId);
    },
    getWorkbenchDocument(projectId, actorUserId) {
      return service.getWorkbenchDocument(projectId, actorUserId);
    },
    saveWorkbenchDocument(input, actorUserId) {
      return service.saveWorkbenchDocument(input, actorUserId);
    },
    transitionPublishState(input, actorUserId) {
      return service.transitionPublishState(input, actorUserId);
    },
  };
}
