import { randomUUID } from "node:crypto";

import type { TodayRecommendation } from "@shared/contracts/discovery";
import type {
  ImportLibraryEntryRequest,
  LibraryEntryView,
  LibraryEntryVisibility,
  PaperAssetRecord,
  UploadPdfToLibraryRequest,
} from "@shared/contracts/library";
import type { ScopeRef } from "@shared/contracts/projects";

import type {
  LibraryRepository,
  PersistedLibraryEntryRecord,
  PersistedLibraryEntryView,
  PersistedPaperAssetRecord,
  ProjectRepository,
} from "../../db";

import type { ArxivConnector } from "../connectors/arxiv.connector";
import type {
  ImportedPaperMetadata,
  PubmedConnector,
} from "../connectors/pubmed.connector";
import { createPaperPdfStorageKey } from "../storage/asset-key";
import type { FileStore } from "../storage/file-store";

export type StoredLibraryEntry = LibraryEntryView["entry"];

export interface StoredPaperAsset {
  abstractText?: string;
  canonicalId: string;
  createdAt: string;
  id: string;
  importedByUserId: string;
  storageKey?: string;
  title: string;
}

export interface ImportedLibraryRecord extends LibraryEntryView {}

export interface ImportStore {
  arxivConnector: ArxivConnector;
  fileStore: FileStore;
  libraryRepository: LibraryRepository;
  projectRepository: ProjectRepository;
  pubmedConnector: PubmedConnector;
}

export interface ImportService {
  importPaper(
    input: ImportLibraryEntryRequest,
    actorUserId: string,
  ): Promise<ImportedLibraryRecord>;
  importToPersonalLibrary(input: {
    requestedByUserId: string;
    sourceLocator: string;
    sourceType: "doi" | "pmid" | "arxiv";
  }): Promise<ImportedLibraryRecord>;
  searchDiscovery(query: string): Promise<TodayRecommendation[]>;
  uploadPdf(
    input: UploadPdfToLibraryRequest,
    actorUserId: string,
  ): Promise<ImportedLibraryRecord>;
}

function visibilityForScope(
  scope: ScopeRef,
  requestedVisibility: LibraryEntryVisibility,
): LibraryEntryVisibility {
  if (scope.type === "user") {
    return "private";
  }

  if (requestedVisibility === "private") {
    return "published_to_project";
  }

  return requestedVisibility === "published_to_project"
    ? requestedVisibility
    : "published_to_project";
}

function resolveRequestedScope(
  input: {
    projectId?: string;
    scope?: ScopeRef;
    visibility?: LibraryEntryVisibility;
  },
  actorUserId: string,
): ScopeRef {
  if (input.scope) {
    if (
      (input.scope.type !== "user" && input.scope.type !== "project") ||
      typeof input.scope.id !== "string" ||
      input.scope.id.trim() === ""
    ) {
      throw new Error("Library scope requires type user/project and a scope id.");
    }

    return input.scope;
  }

  if (input.projectId) {
    if (input.projectId.trim() === "") {
      throw new Error("Project library scope requires a project id.");
    }

    return { id: input.projectId, type: "project" };
  }

  return { id: actorUserId, type: "user" };
}

async function assertCanImportToScope(
  projectRepository: ProjectRepository,
  scope: ScopeRef,
  actorUserId: string,
  legacySpaceId: string,
): Promise<string> {
  if (scope.type === "user") {
    if (scope.id !== actorUserId) {
      throw new Error("Access denied for the requested personal library.");
    }

    return legacySpaceId;
  }

  const project = await projectRepository.findProject(scope.id);

  if (!project) {
    throw new Error(`Project ${scope.id} does not exist.`);
  }

  const membership = await projectRepository.getProjectMember(scope.id, actorUserId);

  if (!membership) {
    throw new Error("Access denied for the requested project library.");
  }

  if (legacySpaceId && project.spaceId !== legacySpaceId) {
    throw new Error(
      "Request space context does not match the requested resource space.",
    );
  }

  return project.spaceId;
}

function createPrismaOwnedAssetId(): string {
  return `asset-${randomUUID()}`;
}

function mapAsset(asset: PersistedPaperAssetRecord): PaperAssetRecord {
  return {
    abstractText: asset.abstractText,
    canonicalId: asset.canonicalId,
    createdAt: asset.createdAt,
    id: asset.id,
    storageKey: asset.storageKey,
    title: asset.title,
  };
}

function mapEntry(
  entry: PersistedLibraryEntryRecord,
): LibraryEntryView["entry"] {
  const visibility = entry.legacyVisibility ??
    (entry.scope.type === "user" ? "private" : "published_to_project");

  return {
    addedAt: entry.createdAt,
    addedByUserId: entry.addedByUserId,
    createdAt: entry.createdAt,
    id: entry.id,
    paperAssetId: entry.paperAssetId,
    scope: entry.scope,
    scopeId: entry.scope.id,
    scopeType: entry.scope.type,
    spaceId: entry.legacySpaceId ?? "",
    visibility,
  };
}

export function mapPersistedLibraryEntryView(
  view: PersistedLibraryEntryView,
): LibraryEntryView {
  return {
    asset: mapAsset(view.asset),
    entry: mapEntry(view.entry),
  };
}


function toDiscoveryRecommendation(
  metadata: ImportedPaperMetadata,
): TodayRecommendation {
  return {
    abstractText: metadata.abstractText,
    canonicalId: metadata.canonicalId,
    id: metadata.canonicalId,
    imported: false,
    reason: metadata.abstractText ?? "Matched by external discovery search.",
    sourceLabel: metadata.canonicalId,
    sourceLocator: metadata.canonicalId.replace(/^(doi|pmid|arxiv):/i, ""),
    sourceType: metadata.canonicalId.startsWith("arxiv:")
      ? "arxiv"
      : metadata.canonicalId.startsWith("pmid:")
        ? "pmid"
        : "doi",
    title: metadata.title,
  };
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

export function createImportService(store: ImportStore): ImportService {
  return {
    async uploadPdf(
      input: UploadPdfToLibraryRequest,
      actorUserId: string,
    ): Promise<ImportedLibraryRecord> {
      if (input.requestedByUserId && input.requestedByUserId !== actorUserId) {
        throw new Error(
          "Request body actor does not match the server-derived actor.",
        );
      }

      const scope = resolveRequestedScope(input, actorUserId);
      const legacySpaceId = await assertCanImportToScope(
        store.projectRepository,
        scope,
        actorUserId,
        input.spaceId,
      );

      const assetId = createPrismaOwnedAssetId();
      const storageKey = await store.fileStore.writeText(
        createPaperPdfStorageKey(assetId),
        input.pdfContents,
      );
      const visibility = visibilityForScope(scope, input.visibility);

      return mapPersistedLibraryEntryView(
        await store.libraryRepository.importScopedEntry({
          asset: {
            canonicalId: `upload:${assetId}`,
            id: assetId,
            importedByUserId: actorUserId,
            sourceLocator: assetId,
            sourceType: "upload",
            storageKey,
            title: `Uploaded paper ${assetId}`,
          },
          entry: {
            addedByUserId: actorUserId,
            legacySpaceId,
            legacyVisibility: visibility,
            scope,
          },
        }),
      );
    },
    async importToPersonalLibrary(input: {
      requestedByUserId: string;
      sourceLocator: string;
      sourceType: "doi" | "pmid" | "arxiv";
    }): Promise<ImportedLibraryRecord> {
      return this.importPaper(
        {
          requestedByUserId: input.requestedByUserId,
          scope: { id: input.requestedByUserId, type: "user" },
          sourceLocator: input.sourceLocator,
          sourceType: input.sourceType,
          spaceId: "",
          visibility: "private",
        },
        input.requestedByUserId,
      );
    },
    async searchDiscovery(query: string): Promise<TodayRecommendation[]> {
      if (!query.trim()) {
        return [];
      }

      return (await store.pubmedConnector.search(query))
        .map(toDiscoveryRecommendation);
    },
    async importPaper(
      input: ImportLibraryEntryRequest,
      actorUserId: string,
    ): Promise<ImportedLibraryRecord> {
      if (input.requestedByUserId && input.requestedByUserId !== actorUserId) {
        throw new Error(
          "Request body actor does not match the server-derived actor.",
        );
      }

      const scope = resolveRequestedScope(input, actorUserId);
      const legacySpaceId = await assertCanImportToScope(
        store.projectRepository,
        scope,
        actorUserId,
        input.spaceId,
      );

      const metadata = await resolveImportedMetadata(store, input);
      const visibility = visibilityForScope(scope, input.visibility);

      return mapPersistedLibraryEntryView(
        await store.libraryRepository.importScopedEntry({
          asset: {
            abstractText: metadata.abstractText,
            canonicalId: metadata.canonicalId,
            importedByUserId: actorUserId,
            sourceLocator: input.sourceLocator,
            sourceType: input.sourceType,
            title: metadata.title,
          },
          entry: {
            addedByUserId: actorUserId,
            legacySpaceId,
            legacyVisibility: visibility,
            scope,
          },
        }),
      );
    },
  };
}
