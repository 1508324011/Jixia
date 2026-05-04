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
  sourceLocator: string;
  sourceType: "doi" | "pmid" | "arxiv";
  spaceId: string;
  visibility: LibraryEntryVisibility;
}

export interface UploadPdfToLibraryRequest {
  pdfContents: string;
  /** @deprecated Protected HTTP routes derive the actor from session transport headers. */
  requestedByUserId?: string;
  spaceId: string;
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
  spaceId: string;
  paperAssetId: string;
  visibility: LibraryEntryVisibility;
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
  spaceId: string;
}

export const libraryContract = "jixia-library-contract";
