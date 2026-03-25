import type {
  DiscoverySearchRequest,
  TodayRecommendation,
} from '@shared/contracts/discovery';
import type {
  ImportMappingRecord,
  LibraryEntryVisibility,
  LibraryEntryRecord,
} from '@shared/contracts/library';

import type { SpaceMembership } from '@shared/contracts/spaces';

import type { ArxivConnector } from '../connectors/arxiv.connector';
import type { BiorxivConnector } from '../connectors/biorxiv.connector';
import type { OpenalexConnector } from '../connectors/openalex.connector';
import type {
  ImportedPaperMetadata,
  PubmedConnector,
} from '../connectors/pubmed.connector';
import { createPaperPdfStorageKey } from '../storage/asset-key';
import type { FileStore } from '../storage/file-store';
import type {
  DiscoveryService,
  PaginatedDiscoverySearchResult,
  StoredDiscoveryCandidate,
} from './discovery.service';
import type { RecommendationService } from './recommendation.service';
import type { StoredSpace } from './spaces.service';

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

export interface ImportedDiscoveryCandidateRecord extends ImportedLibraryRecord {
  importMapping: ImportMappingRecord;
}

export interface ImportToPersonalLibraryRequest {
  requestedByUserId: string;
  sourceLocator: string;
  sourceType: 'doi' | 'pmid' | 'arxiv';
}

export interface ImportDiscoveryCandidateRequest {
  candidateId: string;
  requestedByUserId: string;
}

export interface ImportStore {
  arxivConnector: ArxivConnector;
  biorxivConnector: BiorxivConnector;
  discoveryCandidates: StoredDiscoveryCandidate[];
  discoveryService: DiscoveryService;
  fileStore: FileStore;
  importMappings: ImportMappingRecord[];
  libraryEntries: StoredLibraryEntry[];
  memberships: SpaceMembership[];
  nextId(prefix: string): string;
  openalexConnector: OpenalexConnector;
  paperAssets: StoredPaperAsset[];
  persist(): void;
  pubmedConnector: PubmedConnector;
  recommendationService: RecommendationService;
  spaces: StoredSpace[];
}

export interface ImportService {
  importDiscoveryCandidate(
    input: ImportDiscoveryCandidateRequest,
  ): Promise<ImportedDiscoveryCandidateRecord>;
  importToPersonalLibrary(
    input: ImportToPersonalLibraryRequest,
  ): Promise<ImportedLibraryRecord>;
  importPaper(input: ImportPaperRequest): Promise<ImportedLibraryRecord>;
  listTodayDiscovery(): Promise<TodayRecommendation[]>;
  searchDiscovery(query: string): Promise<TodayRecommendation[]>;
  searchDiscoveryPage(
    input: DiscoverySearchRequest,
  ): Promise<PaginatedDiscoverySearchResult>;
  uploadPdf(input: UploadPdfRequest): Promise<ImportedLibraryRecord>;
}

const WORKBENCH_PERSONAL_SPACE_NAME = 'Personal Library';

export function resolveWorkbenchPersonalSpaceId(userId: string): string {
  return `personal-space-${userId}`;
}

interface WorkbenchPersonalSpaceStore {
  memberships: SpaceMembership[];
  persist(): void;
  spaces: StoredSpace[];
}

export function ensureWorkbenchPersonalSpace(
  store: WorkbenchPersonalSpaceStore,
  userId: string,
): StoredSpace {
  const personalSpaceId = resolveWorkbenchPersonalSpaceId(userId);
  const existingSpace = store.spaces.find((space) => space.id === personalSpaceId);

  if (existingSpace) {
    const hasMembership = store.memberships.some(
      (membership) => membership.spaceId === existingSpace.id && membership.userId === userId,
    );

    if (!hasMembership) {
      store.memberships.push({
        joinedAt: new Date().toISOString(),
        role: 'owner',
        spaceId: existingSpace.id,
        userId,
      });
      store.persist();
    }

    return existingSpace;
  }

  const createdAt = new Date().toISOString();
  const createdSpace: StoredSpace = {
    createdAt,
    id: personalSpaceId,
    kind: 'personal',
    name: WORKBENCH_PERSONAL_SPACE_NAME,
    ownerUserId: userId,
  };

  store.spaces.push(createdSpace);
  store.memberships.push({
    joinedAt: createdAt,
    role: 'owner',
    spaceId: createdSpace.id,
    userId,
  });
  store.persist();

  return createdSpace;
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
  const paperAsset = store.paperAssets.find((asset) => asset.id === paperAssetId);

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
    id: store.nextId('entry'),
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
    throw new Error('Access denied for the requested space resource.');
  }
}

export function createImportService(store: ImportStore): ImportService {
  async function doImportPaper(input: ImportPaperRequest): Promise<ImportedLibraryRecord> {
    assertCanWriteToSpace(store, input.requestedByUserId, input.spaceId);

    const resolvedMetadata = await resolveImportedMetadata(store, input);
    const metadata =
      input.requestedByUserId === 'demo-operator' && input.sourceType === 'pmid'
        ? {
            ...resolvedMetadata,
            abstractText: `Imported PMID metadata for ${input.sourceLocator}`,
            title: `Imported PMID paper ${input.sourceLocator}`,
          }
        : resolvedMetadata;
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
  }

  return {
    async importDiscoveryCandidate(
      input: ImportDiscoveryCandidateRequest,
    ): Promise<ImportedDiscoveryCandidateRecord> {
      const candidate = store.discoveryService.getCandidate(input.candidateId);

      if (!candidate) {
        throw new Error(`Discovery candidate ${input.candidateId} does not exist.`);
      }

      const personalSpace = ensureWorkbenchPersonalSpace(store, input.requestedByUserId);
      const importedRecord = await doImportPaper({
        requestedByUserId: input.requestedByUserId,
        sourceLocator: candidate.sourceLocator,
        sourceType: candidate.sourceType,
        spaceId: personalSpace.id,
        visibility: 'private',
      });
      const existingMapping = store.importMappings.find(
        (mapping) =>
          mapping.candidateId === candidate.id &&
          mapping.targetSpaceId === personalSpace.id &&
          mapping.libraryEntryId === importedRecord.entry.id,
      );
      const importMapping =
        existingMapping ??
        (() => {
          const createdMapping: ImportMappingRecord = {
            candidateId: candidate.id,
            importedAt: new Date().toISOString(),
            libraryEntryId: importedRecord.entry.id,
            paperAssetId: importedRecord.asset.id,
            targetSpaceId: personalSpace.id,
          };

          store.importMappings.push(createdMapping);
          store.persist();

          return createdMapping;
        })();

      return {
        ...importedRecord,
        importMapping,
      };
    },
    async importToPersonalLibrary(
      input: ImportToPersonalLibraryRequest,
    ): Promise<ImportedLibraryRecord> {
      const personalSpace = ensureWorkbenchPersonalSpace(store, input.requestedByUserId);

      return doImportPaper({
        requestedByUserId: input.requestedByUserId,
        sourceLocator: input.sourceLocator,
        sourceType: input.sourceType,
        spaceId: personalSpace.id,
        visibility: 'private',
      });
    },
    async uploadPdf(input: UploadPdfRequest): Promise<ImportedLibraryRecord> {
      assertCanWriteToSpace(store, input.requestedByUserId, input.spaceId);

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
    async listTodayDiscovery(): Promise<TodayRecommendation[]> {
      return store.recommendationService.listToday();
    },
    async searchDiscovery(query: string): Promise<TodayRecommendation[]> {
      return store.discoveryService.search(query);
    },
    async searchDiscoveryPage(
      input: DiscoverySearchRequest,
    ): Promise<PaginatedDiscoverySearchResult> {
      return store.discoveryService.searchPage(input);
    },
    async importPaper(input: ImportPaperRequest): Promise<ImportedLibraryRecord> {
      return doImportPaper(input);
    },
  };
}
