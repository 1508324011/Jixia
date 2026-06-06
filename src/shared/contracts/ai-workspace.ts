import type { JobRecord } from './jobs';
import type { ScopeRef } from './projects';

export const aiWorkspaceContract = 'jixia-ai-workspace-context-packs-v1';

export const AI_WORKSPACE_JOB_KIND = 'ai-workspace.context-pack';

export const AI_WORKSPACE_CONTEXT_SOURCE_TYPES = [
  'projectDocVersion',
  'projectLibraryEntry',
  'readerExcerpt',
  'projectDocCitation',
  'generatedInsight',
] as const;

export type AiContextSourceType = typeof AI_WORKSPACE_CONTEXT_SOURCE_TYPES[number];

export type AiContextSourceRef =
  | {
      projectDocId: string;
      projectDocVersionId: string;
      sourceType: 'projectDocVersion';
    }
  | {
      libraryEntryId: string;
      sourceType: 'projectLibraryEntry';
    }
  | {
      readerExcerptId: string;
      sourceType: 'readerExcerpt';
    }
  | {
      citationId: string;
      projectDocId: string;
      projectDocVersionId?: string;
      sourceType: 'projectDocCitation';
    }
  | {
      generatedInsightId: string;
      libraryEntryId: string;
      sourceType: 'generatedInsight';
    };

export interface AiWorkspaceSessionRecord {
  createdAt: string;
  id: string;
  scope: ScopeRef;
  title: string;
  updatedAt: string;
}

export interface AiContextPackRecord {
  createdAt: string;
  id: string;
  itemCount: number;
  sessionId: string;
  title: string;
  updatedAt: string;
}

export interface AiContextItemRecord {
  contextPackId: string;
  createdAt: string;
  id: string;
  source: AiContextSourceRef;
}

export interface AiContextPackDetail {
  contract: typeof aiWorkspaceContract;
  items: AiContextItemRecord[];
  pack: AiContextPackRecord;
  session: AiWorkspaceSessionRecord;
}

export interface CreateAiWorkspaceSessionRequest {
  title?: string;
}

export interface ListAiWorkspaceSessionsResponse {
  contract: typeof aiWorkspaceContract;
  sessions: AiWorkspaceSessionRecord[];
}

export interface CreateAiContextPackRequest {
  title?: string;
}

export interface ListAiContextPacksResponse {
  contract: typeof aiWorkspaceContract;
  packs: AiContextPackRecord[];
  session: AiWorkspaceSessionRecord;
}

export interface CreateAiContextItemRequest {
  source: AiContextSourceRef;
}

export interface CreateAiWorkspaceJobRequest {
  contextPackId: string;
  credentialRef: string;
  instruction?: string;
}

export interface CreateAiWorkspaceJobResponse {
  contextPack: AiContextPackRecord;
  itemRefs: AiContextSourceRef[];
  job: JobRecord;
  session: AiWorkspaceSessionRecord;
}
