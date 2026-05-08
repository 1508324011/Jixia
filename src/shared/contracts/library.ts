import type { ScopeRef } from "./projects";

export type ImportSourceType = "doi" | "pmid" | "arxiv" | "upload";

export type LibraryEntryVisibility =
  | "private"
  | "space_shared"
  | "published_to_project";

export interface ImportPaperAssetRequest {
  sourceType: ImportSourceType;
  sourceLocator: string;
  /** @deprecated Protected HTTP routes derive the actor from session transport headers. */
  requestedByUserId?: string;
}

export interface ImportLibraryEntryRequest {
  /** @deprecated Protected HTTP routes derive the actor from session transport headers. */
  requestedByUserId?: string;
  /** Explicit library adoption scope. Defaults to the actor's personal library for compatibility. */
  scope?: ScopeRef;
  /** @deprecated Library ownership is now represented by scope. Use scope: { type: "project", id }. */
  projectId?: string;
  sourceLocator: string;
  sourceType: "doi" | "pmid" | "arxiv";
  /** @deprecated Space is governance only. Library ownership is now represented by scope. */
  spaceId: string;
  /** @deprecated Visibility is retained as a compatibility label and is not ownership authority. */
  visibility: LibraryEntryVisibility;
}

export interface UploadPdfToLibraryRequest {
  pdfContents: string;
  /** @deprecated Protected HTTP routes derive the actor from session transport headers. */
  requestedByUserId?: string;
  /** Explicit library adoption scope. Defaults to the actor's personal library for compatibility. */
  scope?: ScopeRef;
  /** @deprecated Library ownership is now represented by scope. Use scope: { type: "project", id }. */
  projectId?: string;
  /** @deprecated Space is governance only. Library ownership is now represented by scope. */
  spaceId: string;
  /** @deprecated Visibility is retained as a compatibility label and is not ownership authority. */
  visibility: LibraryEntryVisibility;
}

export interface PaperAssetRecord {
  id: string;
  canonicalId: string;
  title: string;
  abstractText?: string;
  createdAt: string;
}

export interface LibraryEntryRecord {
  id: string;
  scope: ScopeRef;
  scopeType: ScopeRef["type"];
  scopeId: string;
  addedByUserId: string;
  createdAt: string;
  /** @deprecated Space is governance only. Prefer scope for ownership. */
  spaceId: string;
  paperAssetId: string;
  /** @deprecated Visibility is retained as a compatibility label and is not ownership authority. */
  visibility: LibraryEntryVisibility;
  /** @deprecated Use createdAt. */
  addedAt: string;
}

export interface LibraryEntryView {
  entry: LibraryEntryRecord;
  asset: PaperAssetRecord;
}

export interface ListLibraryEntriesQuery {
  /** @deprecated Protected HTTP routes derive access context from the authenticated actor. */
  actorSpaceId?: string;
  /** @deprecated Protected HTTP routes derive the actor from session transport headers. */
  actorUserId?: string;
  scope?: ScopeRef;
  scopeType?: ScopeRef["type"];
  scopeId?: string;
  /** @deprecated Use scopeType/scopeId or scope. */
  projectId?: string;
  /** @deprecated Space is governance only. Library ownership is now represented by scope. */
  spaceId: string;
}

export interface LibraryListItem {
  addedAt: string;
  canonicalId: string;
  entryId: string;
  paperAssetId: string;
  spaceId: string;
  title: string;
  visibility: LibraryEntryVisibility;
}

export interface LibraryListResponse {
  entries: LibraryListItem[];
}

export const libraryContract = "jixia-library-contract";
