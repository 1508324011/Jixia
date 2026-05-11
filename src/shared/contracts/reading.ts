import type { GeneratedInsightRecord, EvidenceSpanRecord } from "./evidence";
import type { LibraryEntryRecord, PaperAssetRecord } from "./library";

/**
 * @deprecated Reader collaboration authority no longer comes from visibility.
 * Private notes and project comments have separate DTOs and write paths.
 */
export type NoteVisibility = "private" | "space_shared";

export interface PrivateReadingNoteRecord {
  id: string;
  kind: "private_note";
  libraryEntryId: string;
  authorUserId: string;
  body: string;
  createdAt: string;
}

export interface ProjectReadingCommentRecord {
  id: string;
  kind: "project_comment";
  libraryEntryId: string;
  projectId: string;
  authorUserId: string;
  body: string;
  createdAt: string;
}

/** @deprecated Use PrivateReadingNoteRecord for private notes. */
export interface NoteRecord extends PrivateReadingNoteRecord {
  /** @deprecated Compatibility mirror only; never use for authority. */
  visibility?: NoteVisibility;
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

export interface ReadingDetailView {
  asset: PaperAssetRecord;
  entry: LibraryEntryRecord;
  insights: GeneratedInsightRecord[];
  notes: PrivateReadingNoteRecord[];
  projectComments: ProjectReadingCommentRecord[];
}

export type ReadingDetail = ReadingDetailView;

export interface GetReadingDetailQuery {
  /** @deprecated Protected HTTP routes derive access context from the authenticated actor. */
  actorSpaceId?: string;
  /** @deprecated Protected HTTP routes derive the actor from session transport headers. */
  actorUserId?: string;
}

export interface CreateReadingNoteRequest {
  body: string;
  libraryEntryId: string;
}

export type CreatePrivateReadingNoteRequest = CreateReadingNoteRequest;

export interface CreateProjectReadingCommentRequest {
  body: string;
  libraryEntryId: string;
  /**
   * @deprecated Compatibility assertion only. The server derives project
   * authority from LibraryEntry.scope and ProjectMember access.
   */
  projectId?: string;
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

export interface ReadingNoteResponse {
  note: PrivateReadingNoteRecord;
}

export interface ReadingProjectCommentResponse {
  comment: ProjectReadingCommentRecord;
}

export interface ReadingInsightResponse {
  insight: GeneratedInsightRecord;
}

export const readingContract = "jixia-reading-contract";
