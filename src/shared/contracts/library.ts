export type ImportSourceType = 'doi' | 'pmid' | 'arxiv' | 'upload';

export type LibraryEntryVisibility =
  | 'private'
  | 'space_shared'
  | 'published_to_project';

export interface ImportPaperAssetRequest {
  sourceType: ImportSourceType;
  sourceLocator: string;
  requestedByUserId: string;
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

export interface LibraryListItem {
  entryId: string;
  spaceId: string;
  paperAssetId: string;
  canonicalId: string;
  title: string;
  visibility: LibraryEntryVisibility;
  addedAt: string;
}

export interface LibraryListResponse {
  entries: LibraryListItem[];
}

export const libraryContract = 'jixia-library-contract';
