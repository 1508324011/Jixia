import type { LibraryEntryView } from '@shared/contracts/library';

import type {
  StoredLibraryEntry,
  StoredPaperAsset,
} from './import.service';

export interface LibraryStore {
  libraryEntries: StoredLibraryEntry[];
  paperAssets: StoredPaperAsset[];
}

export interface LibraryService {
  getEntry(entryId: string): Promise<LibraryEntryView | null>;
}

export function createLibraryService(store: LibraryStore): LibraryService {
  return {
    async getEntry(entryId: string): Promise<LibraryEntryView | null> {
      const entry = store.libraryEntries.find(
        (candidate) => candidate.id === entryId,
      );

      if (!entry) {
        return null;
      }

      const asset = store.paperAssets.find(
        (candidate) => candidate.id === entry.paperAssetId,
      );

      if (!asset) {
        return null;
      }

      return {
        asset: {
          abstractText: asset.abstractText,
          canonicalId: asset.canonicalId,
          createdAt: asset.createdAt,
          id: asset.id,
          title: asset.title,
        },
        entry,
      };
    },
  };
}
