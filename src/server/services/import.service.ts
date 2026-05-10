import { createHash, randomUUID } from "node:crypto";

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
  importToPersonalLibrary(
    input: {
      requestedByUserId?: string;
      sourceLocator: string;
      sourceType: "doi" | "pmid" | "arxiv";
    },
    actorUserId: string,
  ): Promise<ImportedLibraryRecord>;
  searchDiscovery(query: string): Promise<TodayRecommendation[]>;
  uploadPdf(
    input: UploadPdfToLibraryRequest,
    actorUserId: string,
  ): Promise<ImportedLibraryRecord>;
}

function compatibilityVisibilityForScope(
  scope: ScopeRef,
): LibraryEntryVisibility {
  return scope.type === "user" ? "private" : "published_to_project";
}

function normalizeCanonicalScope(
  input: {
    projectId?: string;
    scope?: ScopeRef;
  },
  actorUserId: string,
): ScopeRef {
  if (input.scope) {
    // Canonical scope wins over deprecated projectId/visibility/space fields.
    // Compatibility fields may be validated later, but they never choose
    // ownership once scope is present.
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

async function resolveAuthorizedImportScopeContext(
  projectRepository: ProjectRepository,
  scope: ScopeRef,
  actorUserId: string,
  compatibilitySpaceId?: string,
): Promise<{ compatibilitySpaceId?: string; scope: ScopeRef }> {
  if (scope.type === "user") {
    // Personal scope is actor-owned. Deprecated spaceId is not an authority
    // input and is intentionally not persisted as the response mirror.
    if (scope.id !== actorUserId) {
      throw new Error("Access denied for the requested personal library.");
    }

    return { scope };
  }

  const project = await projectRepository.findProject(scope.id);

  if (!project) {
    throw new Error(`Project ${scope.id} does not exist.`);
  }

  const membership = await projectRepository.getProjectMember(scope.id, actorUserId);

  if (!membership) {
    throw new Error("Access denied for the requested project library.");
  }

  if (compatibilitySpaceId && project.spaceId !== compatibilitySpaceId) {
    // Deprecated space context can fail closed, but it cannot replace the
    // persisted Project.spaceId or bypass ProjectMember authority.
    throw new Error(
      "Request space context does not match the requested resource space.",
    );
  }

  return {
    compatibilitySpaceId: project.spaceId,
    scope,
  };
}

function createPrismaOwnedAssetId(): string {
  return `asset-${randomUUID()}`;
}

function calculateChecksum(contents: Buffer): string {
  return createHash("sha256").update(contents).digest("hex");
}

function mapAsset(asset: PersistedPaperAssetRecord): PaperAssetRecord {
  return {
    abstractText: asset.abstractText,
    canonicalId: asset.canonicalId,
    createdAt: asset.createdAt,
    id: asset.id,
    title: asset.title,
  };
}

function compatibilitySpaceIdForEntry(
  entry: PersistedLibraryEntryRecord,
): string {
  if (entry.scope.type === "user") {
    return "";
  }

  return entry.legacySpaceId ?? "";
}

function mapEntry(
  entry: PersistedLibraryEntryRecord,
): LibraryEntryView["entry"] {
  const visibility = compatibilityVisibilityForScope(entry.scope);

  return {
    addedAt: entry.createdAt,
    addedByUserId: entry.addedByUserId,
    createdAt: entry.createdAt,
    id: entry.id,
    paperAssetId: entry.paperAssetId,
    scope: entry.scope,
    scopeId: entry.scope.id,
    scopeType: entry.scope.type,
    spaceId: compatibilitySpaceIdForEntry(entry),
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

      const scope = normalizeCanonicalScope(input, actorUserId);
      const scopeContext = await resolveAuthorizedImportScopeContext(
        store.projectRepository,
        scope,
        actorUserId,
        input.spaceId,
      );

      const assetId = createPrismaOwnedAssetId();
      const pdfBytes = Buffer.from(input.pdfContents, "utf8");
      const storageKey = await store.fileStore.writeBuffer(
        createPaperPdfStorageKey(assetId),
        pdfBytes,
      );
      const visibility = compatibilityVisibilityForScope(scopeContext.scope);

      return mapPersistedLibraryEntryView(
        await store.libraryRepository.importScopedEntry({
          asset: {
            canonicalId: `upload:${assetId}`,
            checksum: calculateChecksum(pdfBytes),
            id: assetId,
            importedByUserId: actorUserId,
            sourceLocator: assetId,
            sourceType: "upload",
            storageKey,
            title: `Uploaded paper ${assetId}`,
          },
          entry: {
            addedByUserId: actorUserId,
            legacySpaceId: scopeContext.compatibilitySpaceId,
            legacyVisibility: visibility,
            scope: scopeContext.scope,
          },
        }),
      );
    },
    async importToPersonalLibrary(
      input: {
        requestedByUserId?: string;
        sourceLocator: string;
        sourceType: "doi" | "pmid" | "arxiv";
      },
      actorUserId: string,
    ): Promise<ImportedLibraryRecord> {
      return this.importPaper(
        {
          requestedByUserId: input.requestedByUserId,
          scope: { id: actorUserId, type: "user" },
          sourceLocator: input.sourceLocator,
          sourceType: input.sourceType,
          spaceId: "",
          visibility: "private",
        },
        actorUserId,
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

      const scope = normalizeCanonicalScope(input, actorUserId);
      const scopeContext = await resolveAuthorizedImportScopeContext(
        store.projectRepository,
        scope,
        actorUserId,
        input.spaceId,
      );

      const metadata = await resolveImportedMetadata(store, input);
      const visibility = compatibilityVisibilityForScope(scopeContext.scope);

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
            legacySpaceId: scopeContext.compatibilitySpaceId,
            legacyVisibility: visibility,
            scope: scopeContext.scope,
          },
        }),
      );
    },
  };
}
