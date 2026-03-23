import type {
  EvidenceSpanRecord,
  GeneratedInsightRecord,
} from '@shared/contracts/evidence';

export interface CreateGeneratedInsightInput {
  conversationId: string;
  createdAt: string;
  evidenceSpans: Omit<EvidenceSpanRecord, 'paperAssetId'>[];
  id: string;
  libraryEntryId: string;
  paperAssetId: string;
  summary: string;
}

export interface EvidenceLinkService {
  createGeneratedInsight(
    input: CreateGeneratedInsightInput,
  ): GeneratedInsightRecord;
}

export function createEvidenceLinkService(): EvidenceLinkService {
  return {
    createGeneratedInsight(
      input: CreateGeneratedInsightInput,
    ): GeneratedInsightRecord {
      return {
        conversationId: input.conversationId,
        createdAt: input.createdAt,
        evidenceSpans: input.evidenceSpans.map((span) => ({
          endOffset: span.endOffset,
          paperAssetId: input.paperAssetId,
          quote: span.quote,
          startOffset: span.startOffset,
        })),
        id: input.id,
        libraryEntryId: input.libraryEntryId,
        summary: input.summary,
      };
    },
  };
}
