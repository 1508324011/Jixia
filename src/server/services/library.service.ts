import type {
  AdoptProjectLibraryEntryResponse,
  LibraryEntryView,
  ListLibraryEntriesQuery,
} from "@shared/contracts/library";
import { extname } from "node:path";
import type { ScopeRef } from "@shared/contracts/projects";

import type {
  LibraryRepository,
  PersistedLibraryEntryView,
  ProjectRepository,
} from "../../db";

import type { FileStore } from "../storage/file-store";

import { mapPersistedLibraryEntryView } from "./import.service";

export interface LibraryStore {
  fileStore: FileStore;
  libraryRepository: LibraryRepository;
  projectRepository: ProjectRepository;
}

export interface AuthorizedPaperFile {
  body: Buffer;
  contentDisposition: string;
  contentLength: number;
  contentType: string;
}

export interface GetLibraryEntryRequest {
  actorSpaceId?: string;
  actorUserId: string;
  entryId: string;
}

export interface ListLibraryEntriesRequest
  extends Omit<ListLibraryEntriesQuery, "actorUserId"> {
  actorSpaceId?: string;
  actorUserId: string;
}

export interface AdoptProjectLibraryEntryServiceRequest {
  actorUserId: string;
  projectId: string;
  sourceLibraryEntryId: string;
}

export interface LibraryService {
  adoptProjectLibraryEntry(
    input: AdoptProjectLibraryEntryServiceRequest,
  ): Promise<AdoptProjectLibraryEntryResponse>;
  assertCanAccessEntry(
    entryId: string,
    actorUserId: string,
    actorSpaceId?: string,
  ): Promise<PersistedLibraryEntryView>;
  assertCanAccessPaperAsset(
    paperAssetId: string,
    actorUserId: string,
    actorSpaceId?: string,
  ): Promise<PersistedLibraryEntryView>;
  getEntry(input: GetLibraryEntryRequest): Promise<LibraryEntryView | null>;
  getEntryFile(input: GetLibraryEntryRequest): Promise<AuthorizedPaperFile>;
  listEntries(input: ListLibraryEntriesRequest): Promise<LibraryEntryView[]>;
  listPersonalEntries(actorUserId: string): Promise<LibraryEntryView[]>;
}

function resolveContentType(storageKey: string): string {
  return extname(storageKey).toLowerCase() === ".pdf"
    ? "application/pdf"
    : "application/octet-stream";
}

function sanitizeFileNamePart(value: string): string {
  return value
    .trim()
    .replace(/[^a-z0-9]+/gi, "-")
    .replace(/^-+|-+$/g, "");
}

function resolveDownloadFileName(view: PersistedLibraryEntryView): string {
  const extension = view.asset.storageKey
    ? extname(view.asset.storageKey).toLowerCase() || ".pdf"
    : ".pdf";
  const baseName = sanitizeFileNamePart(view.asset.title) || `paper-${view.asset.id}`;

  return `${baseName}${extension}`;
}

function resolveQueryScope(
  input: {
    actorUserId: string;
    projectId?: string;
    scope?: ScopeRef;
    scopeId?: string;
    scopeType?: ScopeRef["type"];
  },
): ScopeRef {
  if (input.scope) {
    // Canonical scope is the only authoritative listing namespace. Deprecated
    // projectId/space fields are ignored once it is present.
    if (
      (input.scope.type !== "user" && input.scope.type !== "project") ||
      typeof input.scope.id !== "string" ||
      input.scope.id.trim() === ""
    ) {
      throw new Error("Library scope requires type user/project and a scope id.");
    }

    return input.scope;
  }

  if (input.scopeType || input.scopeId) {
    if (
      (input.scopeType !== "user" && input.scopeType !== "project") ||
      typeof input.scopeId !== "string" ||
      input.scopeId.trim() === ""
    ) {
      throw new Error("Library scope requires scopeType user/project and scopeId.");
    }

    return { id: input.scopeId, type: input.scopeType };
  }

  if (input.projectId) {
    if (input.projectId.trim() === "") {
      throw new Error("Project library scope requires a project id.");
    }

    return { id: input.projectId, type: "project" };
  }

  return { id: input.actorUserId, type: "user" };
}

async function assertCanAccessScope(
  projectRepository: ProjectRepository,
  scope: ScopeRef,
  actorUserId: string,
): Promise<{ projectSpaceId?: string; scope: ScopeRef }> {
  if (scope.type === "user") {
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

  return {
    projectSpaceId: project.spaceId,
    scope,
  };
}

function assertProjectSpaceContextMatches(
  projectSpaceId: string | undefined,
  claimedSpaceId: string | undefined,
): void {
  if (!projectSpaceId || !claimedSpaceId) {
    return;
  }

  if (projectSpaceId !== claimedSpaceId) {
    throw new Error(
      "Request space context does not match the requested resource space.",
    );
  }
}

function withCanonicalProjectCompatibilitySpace(
  view: PersistedLibraryEntryView,
  projectSpaceId: string | undefined,
): PersistedLibraryEntryView {
  if (view.entry.scope.type !== "project" || !projectSpaceId) {
    return view;
  }

  return {
    asset: view.asset,
    entry: {
      ...view.entry,
      legacySpaceId: projectSpaceId,
      legacyVisibility: "published_to_project",
    },
  };
}

export function createLibraryService(store: LibraryStore): LibraryService {
  return {
    async adoptProjectLibraryEntry(
      input: AdoptProjectLibraryEntryServiceRequest,
    ): Promise<AdoptProjectLibraryEntryResponse> {
      if (!input.projectId.trim()) {
        throw new Error("Project library adoption requires a project id.");
      }

      if (!input.sourceLibraryEntryId.trim()) {
        throw new Error("sourceLibraryEntryId is required.");
      }

      const sourceView = await this.assertCanAccessEntry(
        input.sourceLibraryEntryId,
        input.actorUserId,
      );
      const project = await store.projectRepository.findProject(input.projectId);

      if (!project) {
        throw new Error(`Project ${input.projectId} does not exist.`);
      }

      const membership = await store.projectRepository.getProjectMember(
        input.projectId,
        input.actorUserId,
      );

      if (!membership) {
        throw new Error("Access denied for the requested project library.");
      }

      if (membership.role !== "owner" && membership.role !== "editor") {
        throw new Error("Access denied for the requested project library mutation.");
      }

      const adoption = await store.libraryRepository.adoptExistingPaperAsset({
        addedByUserId: input.actorUserId,
        legacySpaceId: project.spaceId,
        legacyVisibility: "published_to_project",
        paperAssetId: sourceView.asset.id,
        scope: { id: input.projectId, type: "project" },
      });

      return {
        entry: mapPersistedLibraryEntryView(
          withCanonicalProjectCompatibilitySpace(adoption.view, project.spaceId),
        ),
        reused: adoption.reused,
      };
    },
    async assertCanAccessEntry(
      entryId: string,
      actorUserId: string,
      actorSpaceId?: string,
    ): Promise<PersistedLibraryEntryView> {
      const view = await store.libraryRepository.getLibraryEntry(entryId);

      if (!view) {
        throw new Error(`Library entry ${entryId} does not exist.`);
      }

      const scopeContext = await assertCanAccessScope(
        store.projectRepository,
        view.entry.scope,
        actorUserId,
      );
      assertProjectSpaceContextMatches(
        scopeContext.projectSpaceId,
        actorSpaceId,
      );

      return withCanonicalProjectCompatibilitySpace(
        view,
        scopeContext.projectSpaceId,
      );
    },
    async assertCanAccessPaperAsset(
      paperAssetId: string,
      actorUserId: string,
      actorSpaceId?: string,
    ): Promise<PersistedLibraryEntryView> {
      const views = await store.libraryRepository.listLibraryEntriesForAsset(
        paperAssetId,
      );

      for (const view of views) {
        try {
          const scopeContext = await assertCanAccessScope(
            store.projectRepository,
            view.entry.scope,
            actorUserId,
          );
          assertProjectSpaceContextMatches(
            scopeContext.projectSpaceId,
            actorSpaceId,
          );

          return withCanonicalProjectCompatibilitySpace(
            view,
            scopeContext.projectSpaceId,
          );
        } catch (error) {
          if (
            error instanceof Error &&
            (/access denied/i.test(error.message) ||
              /space context/i.test(error.message))
          ) {
            continue;
          }

          throw error;
        }
      }

      throw new Error(`Paper asset ${paperAssetId} does not exist.`);
    },
    async listEntries(
      input: ListLibraryEntriesRequest,
    ): Promise<LibraryEntryView[]> {
      const scope = resolveQueryScope(input);

      const scopeContext = await assertCanAccessScope(
        store.projectRepository,
        scope,
        input.actorUserId,
      );

      // The request field is a deprecated mirror. When canonical scope is
      // present (or scopeType/scopeId has been normalized), only the
      // server-derived actorSpaceId compatibility context may fail a project
      // request closed; stale request spaceId never chooses or validates the
      // listing namespace.
      assertProjectSpaceContextMatches(
        scopeContext.projectSpaceId,
        input.actorSpaceId,
      );

      return (await store.libraryRepository.listLibraryEntriesForScope(scope))
        .map((view) =>
          mapPersistedLibraryEntryView(
            withCanonicalProjectCompatibilitySpace(
              view,
              scopeContext.projectSpaceId,
            ),
          ),
        );
    },
    async listPersonalEntries(actorUserId: string): Promise<LibraryEntryView[]> {
      return this.listEntries({
        actorUserId,
        scope: { id: actorUserId, type: "user" },
        spaceId: "",
      });
    },
    async getEntry(
      input: GetLibraryEntryRequest,
    ): Promise<LibraryEntryView | null> {
      const view = await store.libraryRepository.getLibraryEntry(input.entryId);

      if (!view) {
        return null;
      }

      const scopeContext = await assertCanAccessScope(
        store.projectRepository,
        view.entry.scope,
        input.actorUserId,
      );
      assertProjectSpaceContextMatches(
        scopeContext.projectSpaceId,
        input.actorSpaceId,
      );

      return mapPersistedLibraryEntryView(
        withCanonicalProjectCompatibilitySpace(view, scopeContext.projectSpaceId),
      );
    },
    async getEntryFile(
      input: GetLibraryEntryRequest,
    ): Promise<AuthorizedPaperFile> {
      const view = await this.assertCanAccessEntry(
        input.entryId,
        input.actorUserId,
        input.actorSpaceId,
      );

      if (!view.asset.storageKey) {
        throw new Error(
          `Paper asset file is not available for library entry ${input.entryId}.`,
        );
      }

      const body = await store.fileStore.readBuffer(view.asset.storageKey).catch(() => {
        throw new Error(
          `Paper asset file is not available for library entry ${input.entryId}.`,
        );
      });
      const fileName = resolveDownloadFileName(view);

      return {
        body,
        contentDisposition: `attachment; filename="${fileName}"`,
        contentLength: body.byteLength,
        contentType: resolveContentType(view.asset.storageKey),
      };
    },
  };
}
