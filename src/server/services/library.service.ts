import type { LibraryEntryView } from '@shared/contracts/library';
import type { SpaceMembership } from '@shared/contracts/spaces';

import { assertCanReadResource } from '../policies/access-policy';
import { ensureWorkbenchPersonalSpace } from './import.service';
import type {
  StoredLibraryEntry,
  StoredPaperAsset,
} from './import.service';
import type { StoredSpace } from './spaces.service';

export interface LibraryStore {
  libraryEntries: StoredLibraryEntry[];
  memberships: SpaceMembership[];
  paperAssets: StoredPaperAsset[];
  persist(): void;
  spaces: StoredSpace[];
}

export interface GetLibraryEntryRequest {
  actorSpaceId: string;
  actorUserId: string;
  entryId: string;
}

export interface ListLibraryEntriesRequest {
  actorSpaceId: string;
  actorUserId: string;
  spaceId: string;
}

export interface LibraryService {
  getEntry(input: GetLibraryEntryRequest): Promise<LibraryEntryView | null>;
  listEntries(input: ListLibraryEntriesRequest): Promise<LibraryEntryView[]>;
  listPersonalEntries(actorUserId: string): Promise<LibraryEntryView[]>;
}

function buildLibraryEntryView(
  store: LibraryStore,
  actorSpaceId: string,
  actorUserId: string,
  entry: StoredLibraryEntry,
): LibraryEntryView | null {
  const asset = store.paperAssets.find((candidate) => candidate.id === entry.paperAssetId);

  if (!asset) {
    return null;
  }

  const space = store.spaces.find((candidate) => candidate.id === entry.spaceId);

  if (!space) {
    throw new Error(`Space ${entry.spaceId} does not exist.`);
  }

  const actorHasResourceMembership = store.memberships.some(
    (membership) =>
      membership.spaceId === entry.spaceId && membership.userId === actorUserId,
  );

  assertCanReadResource({
    actorHasResourceMembership,
    actorSpaceId,
    actorUserId,
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
}

export function createLibraryService(store: LibraryStore): LibraryService {
  return {
    async getEntry(input: GetLibraryEntryRequest): Promise<LibraryEntryView | null> {
      const entry = store.libraryEntries.find(
        (candidate) => candidate.id === input.entryId,
      );

      if (!entry) {
        return null;
      }

      return buildLibraryEntryView(
        store,
        input.actorSpaceId,
        input.actorUserId,
        entry,
      );
    },
    async listEntries(input: ListLibraryEntriesRequest): Promise<LibraryEntryView[]> {
      const matchingEntries = store.libraryEntries.filter(
        (entry) => entry.spaceId === input.spaceId,
      );

      return matchingEntries.flatMap((entry) => {
        const view = buildLibraryEntryView(
          store,
          input.actorSpaceId,
          input.actorUserId,
          entry,
        );

        return view ? [view] : [];
      });
    },
    async listPersonalEntries(actorUserId: string): Promise<LibraryEntryView[]> {
      const personalSpace = ensureWorkbenchPersonalSpace(store, actorUserId);

      return this.listEntries({
        actorSpaceId: personalSpace.id,
        actorUserId,
        spaceId: personalSpace.id,
      });
    },
  };
}
