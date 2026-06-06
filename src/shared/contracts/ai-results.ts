import type { DocumentBlockDocument } from './document-content';
import type { NotebookDocumentSnapshot } from './notebook';
import type { ProjectDocSnapshot } from './project-docs';
import type { ScopeRef } from './projects';

export const aiResultsContract = 'jixia-ai-results-contract-v1';

export type AiResultStatus = 'draft' | 'applied' | 'discarded';

export interface AiResultApplyInsertion {
  mode?: 'append' | 'replace';
  targetBlockId?: string;
}

export interface AiResultProvenance {
  contextItemIds?: string[];
  contextPackId?: string;
  generatedInsightIds?: string[];
  paperAssetIds?: string[];
  projectDocCitationIds?: string[];
  projectDocIds?: string[];
  projectDocVersionIds?: string[];
  projectLibraryEntryIds?: string[];
  readerExcerptIds?: string[];
}

export type AiResultAppliedTarget =
  | {
      notebookDocumentId: string;
      notebookVersionId: string;
      notebookVersionNumber: number;
      type: 'notebookDocument';
    }
  | {
      projectDocId: string;
      projectDocVersionId: string;
      projectDocVersionNumber: number;
      projectId: string;
      type: 'projectDoc';
    };

export interface AiResultArtifactRecord {
  appliedAt?: string;
  appliedTarget?: AiResultAppliedTarget;
  createdAt: string;
  createdByUserId: string;
  documentContent?: DocumentBlockDocument;
  id: string;
  jobId: string;
  kind: string;
  plainTextPreview?: string;
  projectId?: string;
  provenance: AiResultProvenance;
  scope: ScopeRef;
  status: AiResultStatus;
  summary?: string;
  title?: string;
  updatedAt: string;
}

export type AiResultArtifact = AiResultArtifactRecord;

export interface ListAiResultArtifactsResponse {
  contract: typeof aiResultsContract;
  results: AiResultArtifactRecord[];
  scope: ScopeRef;
}

export type ListAiResultsResponse = ListAiResultArtifactsResponse;

export interface GetAiResultResponse {
  contract: typeof aiResultsContract;
  result: AiResultArtifactRecord;
}

export interface ApplyAiResultToNotebookRequest {
  insertion?: AiResultApplyInsertion;
  notebookDocumentId: string;
}

export interface ApplyAiResultToProjectDocRequest {
  insertion?: AiResultApplyInsertion;
  projectDocId: string;
}

export interface ApplyAiResultToNotebookResponse {
  appliedTarget: Extract<AiResultAppliedTarget, { type: 'notebookDocument' }>;
  contract: typeof aiResultsContract;
  result: AiResultArtifactRecord;
  snapshot: NotebookDocumentSnapshot;
}

export interface ApplyAiResultToProjectDocResponse {
  appliedTarget: Extract<AiResultAppliedTarget, { type: 'projectDoc' }>;
  contract: typeof aiResultsContract;
  result: AiResultArtifactRecord;
  snapshot: ProjectDocSnapshot;
}
