export interface EvidenceSpanRecord {
  endOffset: number;
  paperAssetId: string;
  quote: string;
  startOffset: number;
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
