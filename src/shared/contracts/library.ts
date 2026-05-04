export type ImportSourceType = "doi" | "pmid" | "arxiv" | "upload";

export type LibraryEntryVisibility =
  | "private"
  | "space_shared"
  | "published_to_project";

export interface ImportPaperAssetRequest {
  sourceType: ImportSourceType;
  sourceLocator: string;
  requestedByUserId: string;
}

export interface ImportLibraryEntryRequest {
  requestedByUserId: string;
  sourceLocator: string;
  sourceType: "doi" | "pmid" | "arxiv";
  spaceId: string;
  visibility: LibraryEntryVisibility;
}

export interface UploadPdfToLibraryRequest {
  pdfContents: string;
  requestedByUserId: string;
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
  actorSpaceId: string;
  actorUserId: string;
  spaceId: string;
}

export const libraryContract = "jixia-library-contract";
