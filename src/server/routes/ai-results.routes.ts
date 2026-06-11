import type {
  AiResultArtifactRecord,
  ApplyAiResultToNotebookRequest,
  ApplyAiResultToNotebookResponse,
  ApplyAiResultToProjectDocRequest,
  ApplyAiResultToProjectDocResponse,
  DiscardAiResultResponse,
  GetAiResultResponse,
  ListAiResultArtifactsResponse,
} from '@shared/contracts/ai-results';

import type {
  AiResultsService,
  CreateAiResultArtifactRequest,
  ListAiResultArtifactsRequest,
} from '../services/ai-results.service';

export interface AiResultsRoutes {
  applyToNotebook(
    resultId: string,
    input: ApplyAiResultToNotebookRequest,
    actorUserId: string,
  ): Promise<ApplyAiResultToNotebookResponse>;
  applyToProjectDoc(
    resultId: string,
    input: ApplyAiResultToProjectDocRequest,
    actorUserId: string,
  ): Promise<ApplyAiResultToProjectDocResponse>;
  createFromJob(
    input: CreateAiResultArtifactRequest,
    actorUserId: string,
  ): Promise<AiResultArtifactRecord>;
  discardArtifact(
    resultId: string,
    actorUserId: string,
  ): Promise<DiscardAiResultResponse>;
  getArtifact(resultId: string, actorUserId: string): Promise<GetAiResultResponse>;
  listArtifacts(
    input: ListAiResultArtifactsRequest,
  ): Promise<ListAiResultArtifactsResponse>;
}

export function createAiResultsRoutes(service: AiResultsService): AiResultsRoutes {
  return {
    applyToNotebook(resultId, input, actorUserId) {
      return service.applyToNotebook(resultId, input, actorUserId);
    },
    applyToProjectDoc(resultId, input, actorUserId) {
      return service.applyToProjectDoc(resultId, input, actorUserId);
    },
    createFromJob(input, actorUserId) {
      return service.createFromJob(input, actorUserId);
    },
    discardArtifact(resultId, actorUserId) {
      return service.discardArtifact(resultId, actorUserId);
    },
    getArtifact(resultId, actorUserId) {
      return service.getArtifact(resultId, actorUserId);
    },
    listArtifacts(input) {
      return service.listArtifacts(input);
    },
  };
}
