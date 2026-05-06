import type { PublishState } from './writing';

export interface CreateProjectDocRequest {
  createdByUserId?: string;
  projectId: string;
  publishState?: PublishState;
  title: string;
}

export interface ProjectDocLookup {
  documentId: string;
}

export interface ProjectDocCitationRecord {
  createdAt: string;
  evidenceSpan?: string;
  id: string;
  paperAssetId: string;
  projectDocVersionId: string;
}

export interface ProjectDocRecord {
  createdAt: string;
  createdByUserId: string;
  id: string;
  projectId: string;
  publishState: PublishState;
  title: string;
  updatedAt: string;
}

export interface ProjectDocSnapshot {
  capturedAt: string;
  citations: ProjectDocCitationRecord[];
  content: string;
  document: ProjectDocRecord;
  versionId: string;
  versionNumber: number;
}

export const projectDocsContract = 'jixia-project-docs-contract';
