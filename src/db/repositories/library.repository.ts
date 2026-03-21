export interface ImportPaperAssetCommand {
  sourceType: 'doi' | 'pmid' | 'arxiv' | 'upload';
  sourceLocator: string;
  requestedByUserId: string;
}

export interface PersistedLibraryEntryView {
  entryId: string;
  paperAssetId: string;
  spaceId: string;
  visibility: 'private' | 'space_shared' | 'published_to_project';
}

export interface LibraryRepository {
  importPaperAsset(
    input: ImportPaperAssetCommand,
  ): Promise<PersistedLibraryEntryView>;
  getLibraryEntry(entryId: string): Promise<PersistedLibraryEntryView | null>;
}

export function createLibraryRepository(): LibraryRepository {
  return {
    async importPaperAsset(): Promise<PersistedLibraryEntryView> {
      throw new Error(
        'LibraryRepository.importPaperAsset is not implemented yet.',
      );
    },
    async getLibraryEntry(): Promise<PersistedLibraryEntryView | null> {
      throw new Error(
        'LibraryRepository.getLibraryEntry is not implemented yet.',
      );
    },
  };
}
