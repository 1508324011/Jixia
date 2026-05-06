export type PublishState = "draft" | "review" | "published";

export interface WritingDocRecord {
  id: string;
  projectId?: string;
  spaceId: string;
  title: string;
  publishState: PublishState;
  createdAt: string;
  updatedAt?: string;
}

export interface CitationLinkRecord {
  id: string;
  docVersionId: string;
  paperAssetId: string;
  evidenceSpan?: string;
}

export interface WritingDocSnapshot {
  doc: WritingDocRecord;
  docVersionId: string;
  versionNumber?: number;
  content: string;
  citations: CitationLinkRecord[];
  capturedAt: string;
}

export interface WritingDocumentView {
  documentId: string;
  projectId: string;
  spaceId: string;
  title: string;
  publishState: PublishState;
  latestSnapshot: WritingDocSnapshot | null;
}

export interface WritingDocumentResponse {
  document: WritingDocumentView;
}

export const writingContract = "jixia-writing-contract";
