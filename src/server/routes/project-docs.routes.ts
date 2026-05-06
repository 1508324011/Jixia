import type {
  CreateProjectDocRequest,
  ProjectDocLookup,
  ProjectDocRecord,
  ProjectDocSnapshot,
} from '@shared/contracts/project-docs';

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
  getDocument(
    query: ProjectDocLookup,
    actorUserId: string,
  ): Promise<ProjectDocRecord>;
  saveDocument(
    input: SaveProjectDocRequest,
    actorUserId: string,
  ): Promise<ProjectDocSnapshot>;
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
    getDocument(query, actorUserId) {
      return service.getDocument(query, actorUserId);
    },
    saveDocument(input, actorUserId) {
      return service.saveDocument(input, actorUserId);
    },
    transitionPublishState(input, actorUserId) {
      return service.transitionPublishState(input, actorUserId);
    },
  };
}
