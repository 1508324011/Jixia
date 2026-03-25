export type ImportSourceType = 'doi' | 'pmid' | 'arxiv' | 'upload';
export type LibraryObjectType = 'library-entry';

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
  abstractText?: string;
  addedAt: string;
  canonicalId: string;
  createdAt: string;
  entryId: string;
  paperAssetId: string;
  sourceLabel: string;
  sourceType: ImportSourceType;
  spaceId: string;
  title: string;
  visibility: LibraryEntryVisibility;
}

export interface LibraryListResponse {
  entries: LibraryListItem[];
}

export interface ImportMappingRecord {
  candidateId: string;
  importedAt: string;
  libraryEntryId: string;
  paperAssetId: string;
  targetSpaceId: string;
}

export const libraryContract = 'jixia-library-contract';
