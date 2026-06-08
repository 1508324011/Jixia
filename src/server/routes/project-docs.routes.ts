import type {
  AdoptNotebookIntoProjectDocRequest,
  AdoptNotebookIntoProjectDocResponse,
  CreateProjectDocAiSuggestionRequest,
  CreateProjectDocAiSuggestionResponse,
  CreateProjectDocRequest,
  ProjectDocLookup,
  ProjectDocRecord,
  ProjectDocSnapshot,
  ProjectDocCitationTraceResponse,
} from '@shared/contracts/project-docs';
import type { WritingDocumentView } from '@shared/contracts/writing';
import type { DocumentBlockDocument } from '@shared/contracts/document-content';

import type {
  ProjectDocsService,
  ProjectDocCitationInput,
  SaveProjectDocRequest,
  TransitionProjectDocPublishStateRequest,
} from '../services/project-docs.service';

export interface ProjectDocsRoutes {
  createDocument(
    input: CreateProjectDocRequest,
    actorUserId: string,
  ): Promise<ProjectDocRecord>;
  /**
   * @deprecated Legacy/internal compatibility only. Primary browser Project Docs
   * flows must not call whole private Notebook adoption.
   */
  adoptNotebook(
    input: ProjectDocLookup & AdoptNotebookIntoProjectDocRequest,
    actorUserId: string,
  ): Promise<AdoptNotebookIntoProjectDocResponse>;
  createAiSuggestion(
    input: ProjectDocLookup & CreateProjectDocAiSuggestionRequest,
    actorUserId: string,
  ): Promise<CreateProjectDocAiSuggestionResponse>;
  findLatestProjectDocument(
    projectId: string,
    actorUserId: string,
  ): Promise<ProjectDocRecord | null>;
  getDocument(
    query: ProjectDocLookup,
    actorUserId: string,
  ): Promise<ProjectDocSnapshot>;
  getCitationTrace(
    query: ProjectDocLookup,
    actorUserId: string,
  ): Promise<ProjectDocCitationTraceResponse>;
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

export function createProjectDocsRoutes(
  service: ProjectDocsService,
): ProjectDocsRoutes {
  return {
    createDocument(input, actorUserId) {
      return service.createDocument(input, actorUserId);
    },
    /** @deprecated Legacy/internal compatibility only. */
    adoptNotebook(input, actorUserId) {
      return service.adoptNotebook(input, actorUserId);
    },
    createAiSuggestion(input, actorUserId) {
      return service.createAiSuggestion(input, actorUserId);
    },
    findLatestProjectDocument(projectId, actorUserId) {
      return service.findLatestProjectDocument(projectId, actorUserId);
    },
    getDocument(query, actorUserId) {
      return service.getDocument(query, actorUserId);
    },
    getCitationTrace(query, actorUserId) {
      return service.getCitationTrace(query, actorUserId);
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
