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

export interface ReaderExcerptRecord {
  createdAt: string;
  createdByUserId: string;
  endOffset: number;
  id: string;
  libraryEntryId: string;
  locator?: string;
  note?: string;
  paperAssetId: string;
  quote: string;
  startOffset: number;
  updatedAt: string;
}

export interface ReadingDetailView {
  asset: PaperAssetRecord;
  entry: LibraryEntryRecord;
  excerpts: ReaderExcerptRecord[];
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

export interface LegacyCreateReadingNoteRequest extends CreateReadingNoteRequest {
  /** @deprecated Protected HTTP routes derive access context from the authenticated actor. */
  actorSpaceId?: string;
  /** @deprecated Protected HTTP routes derive the actor from session transport headers. */
  authorUserId?: string;
  /**
   * @deprecated Service-level compatibility label only. Protected HTTP routes
   * reject note visibility; Reader collaboration uses project comments.
   */
  visibility?: NoteVisibility;
}

export interface CreateProjectReadingCommentRequest {
  body: string;
  libraryEntryId: string;
}

export interface LegacyCreateProjectReadingCommentRequest
  extends CreateProjectReadingCommentRequest {
  /**
   * @deprecated Compatibility assertion only for server/service callers. Browser
   * clients must not send project context for Reader project comments; the
   * server derives the project from LibraryEntry.scope and ProjectMember access.
   */
  projectId?: string;
}

export interface CreateReaderExcerptRequest {
  endOffset: number;
  locator?: string;
  note?: string;
  quote: string;
  startOffset: number;
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

export interface ProjectReadingCommentResponse {
  comment: ProjectReadingCommentRecord;
}

export interface ReaderExcerptResponse {
  excerpt: ReaderExcerptRecord;
}

export interface ListReaderExcerptsResponse {
  excerpts: ReaderExcerptRecord[];
}

/** @deprecated Use ProjectReadingCommentResponse. */
export type ReadingProjectCommentResponse = ProjectReadingCommentResponse;

export interface ReadingInsightResponse {
  insight: GeneratedInsightRecord;
}

export const readingContract = "jixia-reading-contract";
