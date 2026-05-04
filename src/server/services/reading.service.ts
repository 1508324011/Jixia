import type { GeneratedInsightRecord } from "@shared/contracts/evidence";
import type {
  CreateReadingNoteRequest,
  ConversationRecord,
  GetReadingDetailQuery,
  NoteRecord,
  ReadingDetail,
  SaveReadingInsightRequest,
} from "@shared/contracts/reading";
import type { SpaceMembership } from "@shared/contracts/spaces";

import {
  assertCanReadResource,
  canReadResource,
} from "../policies/access-policy";
import type { StoredLibraryEntry, StoredPaperAsset } from "./import.service";
import type { StoredSpace } from "./spaces.service";
import type { EvidenceLinkService } from "./evidence-link.service";

export interface CreateNoteRequest extends CreateReadingNoteRequest {}

export interface SaveGeneratedInsightRequest extends SaveReadingInsightRequest {}

export interface GetReadingDetailRequest extends GetReadingDetailQuery {
  libraryEntryId: string;
}

export interface ReadingStore {
  conversations: ConversationRecord[];
  evidenceLinkService: EvidenceLinkService;
  insights: GeneratedInsightRecord[];
  libraryEntries: StoredLibraryEntry[];
  memberships: SpaceMembership[];
  nextId(prefix: string): string;
  notes: NoteRecord[];
  paperAssets: StoredPaperAsset[];
  persist(): void;
  spaces: StoredSpace[];
}

export interface ReadingService {
  createNote(input: CreateNoteRequest): Promise<NoteRecord>;
  getDetail(input: GetReadingDetailRequest): Promise<ReadingDetail | null>;
  saveGeneratedInsight(
    input: SaveGeneratedInsightRequest,
  ): Promise<GeneratedInsightRecord>;
}

function getLibraryContext(
  store: ReadingStore,
  libraryEntryId: string,
): {
  asset: StoredPaperAsset;
  entry: StoredLibraryEntry;
  space: StoredSpace;
} {
  const entry = store.libraryEntries.find(
    (candidate) => candidate.id === libraryEntryId,
  );

  if (!entry) {
    throw new Error(`Library entry ${libraryEntryId} does not exist.`);
  }

  const asset = store.paperAssets.find(
    (candidate) => candidate.id === entry.paperAssetId,
  );

  if (!asset) {
    throw new Error(`Paper asset ${entry.paperAssetId} does not exist.`);
  }

  const space = store.spaces.find(
    (candidate) => candidate.id === entry.spaceId,
  );

  if (!space) {
    throw new Error(`Space ${entry.spaceId} does not exist.`);
  }

  return { asset, entry, space };
}

function assertEntryAccess(
  store: ReadingStore,
  actorUserId: string,
  actorSpaceId: string,
  libraryEntryId: string,
): void {
  const { entry, space } = getLibraryContext(store, libraryEntryId);
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
}

export function createReadingService(store: ReadingStore): ReadingService {
  return {
    async getDetail(
      input: GetReadingDetailRequest,
    ): Promise<ReadingDetail | null> {
      const entry = store.libraryEntries.find(
        (candidate) => candidate.id === input.libraryEntryId,
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

      const actorHasResourceMembership = store.memberships.some(
        (membership) =>
          membership.spaceId === entry.spaceId &&
          membership.userId === input.actorUserId,
      );

      assertCanReadResource({
        actorHasResourceMembership,
        actorSpaceId: input.actorSpaceId,
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
        insights: store.insights.filter(
          (insight) => insight.libraryEntryId === input.libraryEntryId,
        ),
        notes: store.notes.filter((note) => {
          if (note.libraryEntryId !== input.libraryEntryId) {
            return false;
          }

          return canReadResource({
            actorHasResourceMembership,
            actorSpaceId: input.actorSpaceId,
            actorUserId: input.actorUserId,
            resourceOwnerUserId: note.authorUserId,
            resourceSpaceId: entry.spaceId,
            visibility: note.visibility,
          });
        }),
      };
    },
    async createNote(input: CreateNoteRequest): Promise<NoteRecord> {
      assertEntryAccess(
        store,
        input.authorUserId,
        input.actorSpaceId,
        input.libraryEntryId,
      );

      const note: NoteRecord = {
        authorUserId: input.authorUserId,
        body: input.body,
        createdAt: new Date().toISOString(),
        id: store.nextId("note"),
        libraryEntryId: input.libraryEntryId,
        visibility: input.visibility,
      };

      store.notes.push(note);
      store.persist();

      return note;
    },
    async saveGeneratedInsight(
      input: SaveGeneratedInsightRequest,
    ): Promise<GeneratedInsightRecord> {
      assertEntryAccess(
        store,
        input.startedByUserId,
        input.actorSpaceId,
        input.libraryEntryId,
      );

      const { asset } = getLibraryContext(store, input.libraryEntryId);
      const createdAt = new Date().toISOString();
      const conversation: ConversationRecord = {
        createdAt,
        id: store.nextId("conversation"),
        libraryEntryId: input.libraryEntryId,
        startedByUserId: input.startedByUserId,
        title: input.title,
      };

      store.conversations.push(conversation);

      const insight = store.evidenceLinkService.createGeneratedInsight({
        conversationId: conversation.id,
        createdAt,
        evidenceSpans: input.evidenceSpans,
        id: store.nextId("insight"),
        libraryEntryId: input.libraryEntryId,
        paperAssetId: asset.id,
        summary: input.summary,
      });

      store.insights.push(insight);
      store.persist();

      return insight;
    },
  };
}
