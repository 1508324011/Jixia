import type {
  ReferenceLifecycleStatus,
  SourceContextRef,
} from './reader-annotations';
import type { SourceTextRangeLocator } from './source-text';

export const aiChatContract = 'jixia-private-ai-chat-trace-contract-v1';

export type AiChatMessageRole = 'assistant' | 'system' | 'user';

export type AiChatRequestStatus =
  | 'built'
  | 'cancelled'
  | 'failed'
  | 'queued'
  | 'sent'
  | 'succeeded';

export type AiChatContextSourceType =
  | 'generatedInsight'
  | 'projectDocCitation'
  | 'projectDocVersion'
  | 'projectLibraryEntry'
  | 'readerAnnotation'
  | 'readerExcerpt'
  | 'sourceTextArtifactRange';

export type AiChatSafeMetadataValue = boolean | null | number | string;

export type AiChatSafeMetadata = Record<string, AiChatSafeMetadataValue>;

export type AiChatSourceTextRangeLocator = Omit<
  SourceTextRangeLocator,
  'quote'
>;

export type AiChatContextSourceRef =
  | {
      generatedInsightId: string;
      libraryEntryId: string;
      sourceType: 'generatedInsight';
    }
  | {
      citationId: string;
      projectDocVersionId?: string;
      sourceType: 'projectDocCitation';
    }
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
      readerAnnotationId: string;
      sourceType: 'readerAnnotation';
    }
  | {
      readerExcerptId: string;
      sourceType: 'readerExcerpt';
    }
  | {
      range: AiChatSourceTextRangeLocator;
      sourceType: 'sourceTextArtifactRange';
    };

export interface AiChatSessionRecord {
  createdAt: string;
  id: string;
  lifecycleStatus: ReferenceLifecycleStatus;
  sourceContext?: SourceContextRef;
  title: string;
  updatedAt: string;
}

export interface AiChatMessageRecord {
  body: string;
  createdAt: string;
  id: string;
  role: AiChatMessageRole;
  safeMetadata?: AiChatSafeMetadata;
  sessionId: string;
}

export interface AiChatRequestContextRefRecord {
  chipLabel: string;
  createdAt: string;
  id: string;
  omittedReason?: string;
  requestId: string;
  source: AiChatContextSourceRef;
  tokenEstimate?: number;
}

export interface AiChatRequestTraceRecord {
  contextRefs: AiChatRequestContextRefRecord[];
  contextTokenEstimate?: number;
  costEstimate?: number;
  createdAt: string;
  id: string;
  overBudgetDecision?: string;
  promptBuildVersion: string;
  responseTokenEstimate?: number;
  safeMetadata?: AiChatSafeMetadata;
  sessionId: string;
  status: AiChatRequestStatus;
  updatedAt: string;
}

export interface CreateAiChatSessionRequest {
  sourceContext?: SourceContextRef;
  title?: string;
}

export interface CreateAiChatMessageRequest {
  body: string;
  contextRefs?: AiChatContextSourceRef[];
  credentialRef?: string;
}

export interface AiChatSessionDetail {
  messages: AiChatMessageRecord[];
  requests: AiChatRequestTraceRecord[];
  session: AiChatSessionRecord;
}
