export interface EvidenceSpanRecord {
  endOffset: number;
  paperAssetId: string;
  quote: string;
  startOffset: number;
}

export type EvidenceScope = 'private' | 'project';

export interface EvidenceCardRecord {
  createdAt: string;
  id: string;
  paperAssetId: string;
  quote: string;
  scope: EvidenceScope;
}

export interface GeneratedInsightRecord {
  conversationId: string;
  createdAt: string;
  evidenceSpans: EvidenceSpanRecord[];
  id: string;
  libraryEntryId: string;
  summary: string;
}

export const evidenceContract = 'jixia-evidence-contract';
