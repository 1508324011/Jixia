import type {
  LibraryEntryView,
  ListLibraryEntriesQuery,
} from "@shared/contracts/library";
import type { SpaceMembership } from "@shared/contracts/spaces";

import { assertCanReadResource } from "../policies/access-policy";
import type { StoredLibraryEntry, StoredPaperAsset } from "./import.service";
import type { StoredSpace } from "./spaces.service";

export interface LibraryStore {
  libraryEntries: StoredLibraryEntry[];
  memberships: SpaceMembership[];
  paperAssets: StoredPaperAsset[];
  spaces: StoredSpace[];
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
  getEntry(input: GetLibraryEntryRequest): Promise<LibraryEntryView | null>;
  listEntries(input: ListLibraryEntriesRequest): Promise<LibraryEntryView[]>;
}

function assertSpaceContextMatches(
  expectedSpaceId: string,
  claimedSpaceId: string | undefined,
): void {
  if (claimedSpaceId && claimedSpaceId !== expectedSpaceId) {
    throw new Error(
      "Request space context does not match the requested resource space.",
    );
  }
}

export function createLibraryService(store: LibraryStore): LibraryService {
  return {
    async listEntries(
      input: ListLibraryEntriesRequest,
    ): Promise<LibraryEntryView[]> {
      const space = store.spaces.find(
        (candidate) => candidate.id === input.spaceId,
      );

      if (!space) {
        throw new Error(`Space ${input.spaceId} does not exist.`);
      }

      assertSpaceContextMatches(input.spaceId, input.actorSpaceId);

      const actorHasResourceMembership = store.memberships.some(
        (membership) =>
          membership.spaceId === input.spaceId &&
          membership.userId === input.actorUserId,
      );

      if (!actorHasResourceMembership) {
        throw new Error("Access denied for the requested space resource.");
      }

      assertCanReadResource({
        actorHasResourceMembership,
        actorSpaceId: input.spaceId,
        actorUserId: input.actorUserId,
        resourceOwnerUserId: space.ownerUserId,
        resourceSpaceId: input.spaceId,
        visibility: "space_shared",
      });

      return store.libraryEntries
        .filter((entry) => entry.spaceId === input.spaceId)
        .map((entry) => {
          const asset = store.paperAssets.find(
            (candidate) => candidate.id === entry.paperAssetId,
          );

          if (!asset) {
            throw new Error(
              `Paper asset ${entry.paperAssetId} does not exist.`,
            );
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
        })
        .sort((left, right) =>
          right.entry.addedAt.localeCompare(left.entry.addedAt),
        );
    },
    async getEntry(
      input: GetLibraryEntryRequest,
    ): Promise<LibraryEntryView | null> {
      const entry = store.libraryEntries.find(
        (candidate) => candidate.id === input.entryId,
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

      const space = store.spaces.find(
        (candidate) => candidate.id === entry.spaceId,
      );

      if (!space) {
        throw new Error(`Space ${entry.spaceId} does not exist.`);
      }

      assertSpaceContextMatches(entry.spaceId, input.actorSpaceId);

      const actorHasResourceMembership = store.memberships.some(
        (membership) =>
          membership.spaceId === entry.spaceId &&
          membership.userId === input.actorUserId,
      );

      if (!actorHasResourceMembership) {
        throw new Error("Access denied for the requested space resource.");
      }

      assertCanReadResource({
        actorHasResourceMembership,
        actorSpaceId: entry.spaceId,
        actorUserId: input.actorUserId,
        resourceOwnerUserId: space.ownerUserId,
        resourceSpaceId: entry.spaceId,
        visibility: entry.visibility,
      });

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
