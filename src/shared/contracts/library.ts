import type { ScopeRef } from "./projects";

export type ImportSourceType = "doi" | "pmid" | "arxiv" | "upload";

/**
 * Deprecated compatibility label for older library payloads.
 *
 * This is not an ownership or access-control input. Runtime authority is the
 * canonical ScopeRef plus the server-derived actor/project membership checks.
 */
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
  /**
   * Authoritative library adoption scope. Defaults to the actor's personal
   * library only for compatibility when omitted by old callers.
   */
  scope?: ScopeRef;
  /**
   * @deprecated Non-authoritative compatibility shortcut used only when
   * canonical scope is absent. Prefer scope: { type: "project", id }.
   */
  projectId?: string;
  sourceLocator: string;
  sourceType: "doi" | "pmid" | "arxiv";
  /**
   * @deprecated Non-authoritative compatibility context. For project scope the
   * server validates it against the persisted Project.spaceId; for personal
   * scope it is ignored for ownership and access control.
   */
  spaceId: string;
  /**
   * @deprecated Non-authoritative compatibility label. Responses derive the
   * mirror value from canonical scope instead of trusting this field.
   */
  visibility: LibraryEntryVisibility;
}

export interface UploadPdfToLibraryRequest {
  pdfContents: string;
  /** @deprecated Protected HTTP routes derive the actor from session transport headers. */
  requestedByUserId?: string;
  /**
   * Authoritative library adoption scope. Defaults to the actor's personal
   * library only for compatibility when omitted by old callers.
   */
  scope?: ScopeRef;
  /**
   * @deprecated Non-authoritative compatibility shortcut used only when
   * canonical scope is absent. Prefer scope: { type: "project", id }.
   */
  projectId?: string;
  /**
   * @deprecated Non-authoritative compatibility context. For project scope the
   * server validates it against the persisted Project.spaceId; for personal
   * scope it is ignored for ownership and access control.
   */
  spaceId: string;
  /**
   * @deprecated Non-authoritative compatibility label. Responses derive the
   * mirror value from canonical scope instead of trusting this field.
   */
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
  /** Authoritative persisted ownership/adoption scope for this library entry. */
  scope: ScopeRef;
  /** Mirror of scope.type for older clients; scope remains authoritative. */
  scopeType: ScopeRef["type"];
  /** Mirror of scope.id for older clients; scope remains authoritative. */
  scopeId: string;
  addedByUserId: string;
  createdAt: string;
  /**
   * @deprecated Non-authoritative compatibility mirror. Project entries mirror
   * the canonical project governance space; personal entries may be empty.
   */
  spaceId: string;
  paperAssetId: string;
  /**
   * @deprecated Non-authoritative compatibility mirror derived from canonical
   * scope; never use it for ownership or access control.
   */
  visibility: LibraryEntryVisibility;
  /** @deprecated Use createdAt. */
  addedAt: string;
}

export interface LibraryEntryView {
  entry: LibraryEntryRecord;
  asset: PaperAssetRecord;
}

export interface AdoptProjectLibraryEntryRequest {
  sourceLibraryEntryId: string;
}

export interface AdoptProjectLibraryEntryResponse {
  entry: LibraryEntryView;
  reused: boolean;
}

export interface ListLibraryEntriesQuery {
  /** @deprecated Protected HTTP routes derive access context from the authenticated actor. */
  actorSpaceId?: string;
  /** @deprecated Protected HTTP routes derive the actor from session transport headers. */
  actorUserId?: string;
  /** Authoritative library scope to list. Defaults to the actor's personal scope. */
  scope?: ScopeRef;
  /** @deprecated Compatibility mirror of scope.type. Prefer scope. */
  scopeType?: ScopeRef["type"];
  /** @deprecated Compatibility mirror of scope.id. Prefer scope. */
  scopeId?: string;
  /**
   * @deprecated Non-authoritative compatibility shortcut used only when
   * canonical scope/scopeType/scopeId are absent.
   */
  projectId?: string;
  /**
   * @deprecated Non-authoritative compatibility context. Project list requests
   * validate it against canonical project data; personal list requests ignore it.
   */
  spaceId: string;
}

export interface LibraryListItem {
  addedAt: string;
  canonicalId: string;
  entryId: string;
  paperAssetId: string;
  /** @deprecated Non-authoritative compatibility mirror; use entry scope detail. */
  spaceId: string;
  title: string;
  /** @deprecated Non-authoritative compatibility mirror; use entry scope detail. */
  visibility: LibraryEntryVisibility;
}

export interface LibraryListResponse {
  entries: LibraryListItem[];
}

export const libraryContract = "jixia-library-contract";
