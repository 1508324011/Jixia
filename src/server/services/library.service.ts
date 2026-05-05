import type {
  LibraryEntryView,
  ListLibraryEntriesQuery,
} from "@shared/contracts/library";
import type { ScopeRef } from "@shared/contracts/projects";

import type {
  LibraryRepository,
  PersistedLibraryEntryRecord,
  PersistedLibraryEntryView,
  ProjectRepository,
} from "../../db";

import { mapPersistedLibraryEntryView } from "./import.service";

export interface LibraryStore {
  libraryRepository: LibraryRepository;
  projectRepository: ProjectRepository;
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

export interface LibraryService {
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
  listEntries(input: ListLibraryEntriesRequest): Promise<LibraryEntryView[]>;
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
    return input.scope;
  }

  if (input.scopeType && input.scopeId) {
    return { id: input.scopeId, type: input.scopeType };
  }

  if (input.projectId) {
    return { id: input.projectId, type: "project" };
  }

  return { id: input.actorUserId, type: "user" };
}

async function assertCanAccessScope(
  projectRepository: ProjectRepository,
  scope: ScopeRef,
  actorUserId: string,
): Promise<void> {
  if (scope.type === "user") {
    if (scope.id !== actorUserId) {
      throw new Error("Access denied for the requested personal library.");
    }

    return;
  }

  const project = await projectRepository.findProject(scope.id);

  if (!project) {
    throw new Error(`Project ${scope.id} does not exist.`);
  }

  const membership = await projectRepository.getProjectMember(scope.id, actorUserId);

  if (!membership) {
    throw new Error("Access denied for the requested project library.");
  }
}

async function assertSpaceContextMatches(
  projectRepository: ProjectRepository,
  entry: PersistedLibraryEntryRecord,
  claimedSpaceId: string | undefined,
): Promise<void> {
  if (!claimedSpaceId) {
    return;
  }

  if (entry.scope.type === "project") {
    const project = await projectRepository.findProject(entry.scope.id);

    if (!project) {
      throw new Error(`Project ${entry.scope.id} does not exist.`);
    }

    if (project.spaceId !== claimedSpaceId) {
      throw new Error(
        "Request space context does not match the requested resource space.",
      );
    }

    return;
  }

  if (entry.legacySpaceId && entry.legacySpaceId !== claimedSpaceId) {
    throw new Error(
      "Request space context does not match the requested resource space.",
    );
  }
}

export function createLibraryService(store: LibraryStore): LibraryService {
  return {
    async assertCanAccessEntry(
      entryId: string,
      actorUserId: string,
      actorSpaceId?: string,
    ): Promise<PersistedLibraryEntryView> {
      const view = await store.libraryRepository.getLibraryEntry(entryId);

      if (!view) {
        throw new Error(`Library entry ${entryId} does not exist.`);
      }

      await assertCanAccessScope(
        store.projectRepository,
        view.entry.scope,
        actorUserId,
      );
      await assertSpaceContextMatches(
        store.projectRepository,
        view.entry,
        actorSpaceId,
      );

      return view;
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
          await assertCanAccessScope(
            store.projectRepository,
            view.entry.scope,
            actorUserId,
          );
          await assertSpaceContextMatches(
            store.projectRepository,
            view.entry,
            actorSpaceId,
          );

          return view;
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

      await assertCanAccessScope(
        store.projectRepository,
        scope,
        input.actorUserId,
      );

      if (input.actorSpaceId) {
        if (scope.type === "user") {
          throw new Error(
            "Request space context does not match the requested resource space.",
          );
        }

        const project = await store.projectRepository.findProject(scope.id);

        if (!project) {
          throw new Error(`Project ${scope.id} does not exist.`);
        }

        if (project.spaceId !== input.actorSpaceId) {
          throw new Error(
            "Request space context does not match the requested resource space.",
          );
        }
      }

      return (await store.libraryRepository.listLibraryEntriesForScope(scope))
        .map(mapPersistedLibraryEntryView);
    },
    async getEntry(
      input: GetLibraryEntryRequest,
    ): Promise<LibraryEntryView | null> {
      const view = await store.libraryRepository.getLibraryEntry(input.entryId);

      if (!view) {
        return null;
      }

      await assertCanAccessScope(
        store.projectRepository,
        view.entry.scope,
        input.actorUserId,
      );
      await assertSpaceContextMatches(
        store.projectRepository,
        view.entry,
        input.actorSpaceId,
      );

      return mapPersistedLibraryEntryView(view);
    },
  };
}
