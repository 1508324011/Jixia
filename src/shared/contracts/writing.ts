export type PublishState = "draft" | "review" | "published";

export interface WritingDocRecord {
  id: string;
  /** Authoritative project context for project Writer documents. */
  projectId?: string;
  /**
   * @deprecated Non-authoritative compatibility mirror of the project's
   * governance space. ProjectDoc.projectId is the document authority.
   */
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
  /** Authoritative project context for this Writer view. */
  projectId: string;
  /**
   * @deprecated Non-authoritative compatibility mirror resolved from the
   * persisted Project.spaceId. Do not use it to choose document ownership.
   */
  spaceId: string;
  title: string;
  publishState: PublishState;
  latestSnapshot: WritingDocSnapshot | null;
}

export interface WritingDocumentResponse {
  document: WritingDocumentView;
}

export const writingContract = "jixia-writing-contract";
