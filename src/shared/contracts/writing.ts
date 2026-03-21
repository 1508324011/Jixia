export type PublishState = 'draft' | 'review' | 'published';

export interface WritingDocRecord {
  id: string;
  spaceId: string;
  title: string;
  publishState: PublishState;
  createdAt: string;
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
  content: string;
  citations: CitationLinkRecord[];
  capturedAt: string;
}

export const writingContract = 'jixia-writing-contract';
