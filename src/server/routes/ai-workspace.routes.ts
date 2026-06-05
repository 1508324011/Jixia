import type {
  AiContextItemRecord,
  AiContextPackDetail,
  AiContextPackRecord,
  AiContextSourceRef,
  AiWorkspaceSessionRecord,
  CreateAiWorkspaceJobResponse,
  ListAiContextPacksResponse,
  ListAiWorkspaceSessionsResponse,
} from '@shared/contracts/ai-workspace';
import type { ScopeRef } from '@shared/contracts/projects';

import type { AiWorkspaceService } from '../services/ai-workspace.service';

export interface AiWorkspaceRoutes {
  addContextItem(input: {
    contextPackId: string;
    source: AiContextSourceRef;
  }, actorUserId: string): Promise<AiContextItemRecord>;
  createContextPack(input: {
    sessionId: string;
    title?: string;
  }, actorUserId: string): Promise<AiContextPackRecord>;
  createJob(input: {
    contextPackId: string;
    credentialRef: string;
    instruction?: string;
  }, actorUserId: string): Promise<CreateAiWorkspaceJobResponse>;
  createSession(input: {
    scope: ScopeRef;
    title?: string;
  }, actorUserId: string): Promise<AiWorkspaceSessionRecord>;
  getContextPack(
    contextPackId: string,
    actorUserId: string,
  ): Promise<AiContextPackDetail>;
  listContextPacks(
    sessionId: string,
    actorUserId: string,
  ): Promise<ListAiContextPacksResponse>;
  listSessions(
    scope: ScopeRef,
    actorUserId: string,
  ): Promise<ListAiWorkspaceSessionsResponse>;
}

export function createAiWorkspaceRoutes(
  service: AiWorkspaceService,
): AiWorkspaceRoutes {
  return {
    addContextItem(input, actorUserId): Promise<AiContextItemRecord> {
      return service.addContextItem({
        actorUserId,
        contextPackId: input.contextPackId,
        source: input.source,
      });
    },
    createContextPack(input, actorUserId): Promise<AiContextPackRecord> {
      return service.createContextPack({
        actorUserId,
        sessionId: input.sessionId,
        title: input.title,
      });
    },
    createJob(input, actorUserId): Promise<CreateAiWorkspaceJobResponse> {
      return service.createJob({
        actorUserId,
        contextPackId: input.contextPackId,
        credentialRef: input.credentialRef,
        instruction: input.instruction,
      });
    },
    createSession(input, actorUserId): Promise<AiWorkspaceSessionRecord> {
      return service.createSession({
        actorUserId,
        scope: input.scope,
        title: input.title,
      });
    },
    getContextPack(
      contextPackId: string,
      actorUserId: string,
    ): Promise<AiContextPackDetail> {
      return service.getContextPack(contextPackId, actorUserId);
    },
    listContextPacks(
      sessionId: string,
      actorUserId: string,
    ): Promise<ListAiContextPacksResponse> {
      return service.listContextPacks(sessionId, actorUserId);
    },
    listSessions(
      scope: ScopeRef,
      actorUserId: string,
    ): Promise<ListAiWorkspaceSessionsResponse> {
      return service.listSessions(scope, actorUserId);
    },
  };
}
