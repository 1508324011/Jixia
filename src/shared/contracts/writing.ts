export type PublishState = 'draft' | 'review' | 'published';

export type WritingDocOwnerType = 'user' | 'project';

export type ProjectReferenceSourceType = 'notebook-note' | 'evidence-card';

interface WritingDocBaseRecord {
  id: string;
  spaceId: string;
  title: string;
  publishState: PublishState;
  createdAt: string;
}

export interface UserOwnedWritingDocRecord extends WritingDocBaseRecord {
  ownerType: 'user';
  ownerUserId: string;
}

export interface ProjectOwnedWritingDocRecord extends WritingDocBaseRecord {
  ownerType: 'project';
  projectId: string;
}

export type WritingDocRecord = UserOwnedWritingDocRecord | ProjectOwnedWritingDocRecord;

export interface CitationLinkRecord {
  id: string;
  docVersionId: string;
  paperAssetId: string;
  evidenceSpan?: string;
}

export interface WritingDocSnapshot {
  doc: WritingDocRecord;
  docVersionId: string;
  content: string;
  citations: CitationLinkRecord[];
  capturedAt: string;
}

export interface WritingDocumentView {
  documentId: string;
  ownerType: 'project';
  projectId: string;
  references: ProjectReferenceRecord[];
  spaceId: string;
  title: string;
  publishState: PublishState;
  latestSnapshot: WritingDocSnapshot | null;
}

export interface WritingDocumentResponse {
  document: WritingDocumentView;
}

export interface ProjectReferenceRecord {
  createdAt: string;
  documentId: string;
  id: string;
  ownerType: 'project';
  paperAssetId: string;
  projectId: string;
  selectedText: string;
  sourceKind: 'projection';
  sourceType: ProjectReferenceSourceType;
}

export interface ProjectDocumentPresenceRecord {
  activeDocumentId: string;
  id: string;
  projectId: string;
  updatedAt: string;
  userId: string;
}

export const writingContract = 'jixia-writing-contract';
