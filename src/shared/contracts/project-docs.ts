import type {
  DocumentCitationRecordBase,
  DocumentSnapshot,
} from './document-snapshot';
import type { PublishState } from './writing';

export interface CreateProjectDocRequest {
  projectId: string;
  publishState?: PublishState;
  title: string;
}

export interface ProjectDocLookup {
  documentId: string;
}

export interface ProjectDocCitationRecord extends DocumentCitationRecordBase {
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

export type ProjectDocSnapshot = DocumentSnapshot<
  ProjectDocRecord,
  ProjectDocCitationRecord
>;

export const projectDocsContract = 'jixia-project-docs-contract';
