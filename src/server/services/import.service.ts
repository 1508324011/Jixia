import type { LibraryEntryVisibility, LibraryEntryRecord } from '@shared/contracts/library';

import type { ArxivConnector } from '../connectors/arxiv.connector';
import type {
  ImportedPaperMetadata,
  PubmedConnector,
} from '../connectors/pubmed.connector';
import { createPaperPdfStorageKey } from '../storage/asset-key';
import type { FileStore } from '../storage/file-store';

export interface StoredPaperAsset {
  abstractText?: string;
  canonicalId: string;
  createdAt: string;
  id: string;
  importedByUserId: string;
  storageKey?: string;
  title: string;
}

export interface StoredLibraryEntry extends LibraryEntryRecord {}

export interface UploadPdfRequest {
  pdfContents: string;
  requestedByUserId: string;
  spaceId: string;
  visibility: LibraryEntryVisibility;
}

export interface ImportPaperRequest {
  requestedByUserId: string;
  sourceLocator: string;
  sourceType: 'doi' | 'pmid' | 'arxiv';
  spaceId: string;
  visibility: LibraryEntryVisibility;
}

export interface ImportedLibraryRecord {
  asset: StoredPaperAsset;
  entry: StoredLibraryEntry;
}

export interface ImportStore {
  arxivConnector: ArxivConnector;
  fileStore: FileStore;
  libraryEntries: StoredLibraryEntry[];
  nextId(prefix: string): string;
  paperAssets: StoredPaperAsset[];
  pubmedConnector: PubmedConnector;
}

export interface ImportService {
  importPaper(input: ImportPaperRequest): Promise<ImportedLibraryRecord>;
  uploadPdf(input: UploadPdfRequest): Promise<ImportedLibraryRecord>;
}

async function resolveImportedMetadata(
  store: ImportStore,
  input: ImportPaperRequest,
): Promise<ImportedPaperMetadata> {
  if (input.sourceType === 'arxiv') {
    return store.arxivConnector.lookup(input.sourceLocator);
  }

  return store.pubmedConnector.lookup(input.sourceLocator, input.sourceType);
}

function createLibraryEntry(
  store: ImportStore,
  spaceId: string,
  paperAssetId: string,
  visibility: LibraryEntryVisibility,
): StoredLibraryEntry {
  const existingEntry = store.libraryEntries.find(
    (entry) => entry.spaceId === spaceId && entry.paperAssetId === paperAssetId,
  );

  if (existingEntry) {
    return existingEntry;
  }

  const entry: StoredLibraryEntry = {
    addedAt: new Date().toISOString(),
    id: store.nextId('entry'),
    paperAssetId,
    spaceId,
    visibility,
  };

  store.libraryEntries.push(entry);

  return entry;
}

export function createImportService(store: ImportStore): ImportService {
  return {
    async uploadPdf(input: UploadPdfRequest): Promise<ImportedLibraryRecord> {
      const assetId = store.nextId('asset');
      const storageKey = await store.fileStore.writeText(
        createPaperPdfStorageKey(assetId),
        input.pdfContents,
      );
      const asset: StoredPaperAsset = {
        canonicalId: `upload:${assetId}`,
        createdAt: new Date().toISOString(),
        id: assetId,
        importedByUserId: input.requestedByUserId,
        storageKey,
        title: `Uploaded paper ${assetId}`,
      };

      store.paperAssets.push(asset);

      return {
        asset,
        entry: createLibraryEntry(
          store,
          input.spaceId,
          asset.id,
          input.visibility,
        ),
      };
    },
    async importPaper(input: ImportPaperRequest): Promise<ImportedLibraryRecord> {
      const metadata = await resolveImportedMetadata(store, input);
      const existingAsset = store.paperAssets.find(
        (asset) => asset.canonicalId === metadata.canonicalId,
      );
      const asset =
        existingAsset ??
        (() => {
          const createdAsset: StoredPaperAsset = {
            abstractText: metadata.abstractText,
            canonicalId: metadata.canonicalId,
            createdAt: new Date().toISOString(),
            id: store.nextId('asset'),
            importedByUserId: input.requestedByUserId,
            title: metadata.title,
          };

          store.paperAssets.push(createdAsset);

          return createdAsset;
        })();

      return {
        asset,
        entry: createLibraryEntry(
          store,
          input.spaceId,
          asset.id,
          input.visibility,
        ),
      };
    },
  };
}
