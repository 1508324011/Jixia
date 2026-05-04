import type {
  ImportLibraryEntryRequest,
  LibraryEntryRecord,
  LibraryEntryVisibility,
  UploadPdfToLibraryRequest,
} from "@shared/contracts/library";

import type { SpaceMembership } from "@shared/contracts/spaces";

import type { ArxivConnector } from "../connectors/arxiv.connector";
import type {
  ImportedPaperMetadata,
  PubmedConnector,
} from "../connectors/pubmed.connector";
import { createPaperPdfStorageKey } from "../storage/asset-key";
import type { FileStore } from "../storage/file-store";
import type { StoredSpace } from "./spaces.service";

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

export interface ImportedLibraryRecord {
  asset: StoredPaperAsset;
  entry: StoredLibraryEntry;
}

export interface ImportStore {
  arxivConnector: ArxivConnector;
  fileStore: FileStore;
  libraryEntries: StoredLibraryEntry[];
  memberships: SpaceMembership[];
  nextId(prefix: string): string;
  paperAssets: StoredPaperAsset[];
  persist(): void;
  pubmedConnector: PubmedConnector;
  spaces: StoredSpace[];
}

export interface ImportService {
  importPaper(input: ImportLibraryEntryRequest): Promise<ImportedLibraryRecord>;
  uploadPdf(input: UploadPdfToLibraryRequest): Promise<ImportedLibraryRecord>;
}

async function resolveImportedMetadata(
  store: ImportStore,
  input: ImportLibraryEntryRequest,
): Promise<ImportedPaperMetadata> {
  if (input.sourceType === "arxiv") {
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
  const paperAsset = store.paperAssets.find(
    (asset) => asset.id === paperAssetId,
  );

  if (!paperAsset) {
    throw new Error(`Paper asset ${paperAssetId} does not exist.`);
  }

  const space = store.spaces.find((candidate) => candidate.id === spaceId);

  if (!space) {
    throw new Error(`Space ${spaceId} does not exist.`);
  }

  const existingEntry = store.libraryEntries.find(
    (entry) => entry.spaceId === spaceId && entry.paperAssetId === paperAssetId,
  );

  if (existingEntry) {
    return existingEntry;
  }

  const entry: StoredLibraryEntry = {
    addedAt: new Date().toISOString(),
    id: store.nextId("entry"),
    paperAssetId,
    spaceId,
    visibility,
  };

  store.libraryEntries.push(entry);
  store.persist();

  return entry;
}

function assertCanWriteToSpace(
  store: ImportStore,
  requestedByUserId: string,
  spaceId: string,
): void {
  const space = store.spaces.find((candidate) => candidate.id === spaceId);

  if (!space) {
    throw new Error(`Space ${spaceId} does not exist.`);
  }

  const actorHasMembership = store.memberships.some(
    (membership) =>
      membership.spaceId === spaceId && membership.userId === requestedByUserId,
  );

  if (!actorHasMembership) {
    throw new Error("Access denied for the requested space resource.");
  }
}

export function createImportService(store: ImportStore): ImportService {
  return {
    async uploadPdf(
      input: UploadPdfToLibraryRequest,
    ): Promise<ImportedLibraryRecord> {
      assertCanWriteToSpace(store, input.requestedByUserId, input.spaceId);

      const assetId = store.nextId("asset");
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
      store.persist();

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
    async importPaper(
      input: ImportLibraryEntryRequest,
    ): Promise<ImportedLibraryRecord> {
      assertCanWriteToSpace(store, input.requestedByUserId, input.spaceId);

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
            id: store.nextId("asset"),
            importedByUserId: input.requestedByUserId,
            title: metadata.title,
          };

          store.paperAssets.push(createdAsset);
          store.persist();

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
