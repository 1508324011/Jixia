import type { GeneratedInsightRecord, EvidenceSpanRecord } from "./evidence";
import type { LibraryEntryRecord, PaperAssetRecord } from "./library";

export type NoteVisibility = "private" | "space_shared";

export interface NoteRecord {
  id: string;
  libraryEntryId: string;
  authorUserId: string;
  visibility: NoteVisibility;
  body: string;
  createdAt: string;
}

export interface ConversationRecord {
  id: string;
  libraryEntryId: string;
  startedByUserId: string;
  title: string;
  createdAt: string;
}

export interface ReadingStateRecord {
  libraryEntryId: string;
  userId: string;
  progressPercent: number;
  lastReadAt: string;
}

export interface ReadingDetail {
  asset: PaperAssetRecord;
  entry: LibraryEntryRecord;
  insights: GeneratedInsightRecord[];
  notes: NoteRecord[];
}

export interface GetReadingDetailQuery {
  /** @deprecated Protected HTTP routes derive access context from the authenticated actor. */
  actorSpaceId?: string;
  /** @deprecated Protected HTTP routes derive the actor from session transport headers. */
  actorUserId?: string;
}

export interface CreateReadingNoteRequest {
  /** @deprecated Protected HTTP routes derive access context from the authenticated actor. */
  actorSpaceId?: string;
  /** @deprecated Protected HTTP routes derive the actor from session transport headers. */
  authorUserId?: string;
  body: string;
  libraryEntryId: string;
  visibility: NoteVisibility;
}

export interface SaveReadingInsightRequest {
  /** @deprecated Protected HTTP routes derive access context from the authenticated actor. */
  actorSpaceId?: string;
  evidenceSpans: Omit<EvidenceSpanRecord, "paperAssetId">[];
  libraryEntryId: string;
  /** @deprecated Protected HTTP routes derive the actor from session transport headers. */
  startedByUserId?: string;
  summary: string;
  title: string;
}

export const readingContract = "jixia-reading-contract";
