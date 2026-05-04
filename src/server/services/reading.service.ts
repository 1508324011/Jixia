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

export interface CreateNoteRequest
  extends Omit<CreateReadingNoteRequest, "actorSpaceId" | "authorUserId"> {
  actorSpaceId?: string;
  actorUserId?: string;
  authorUserId?: string;
}

export interface SaveGeneratedInsightRequest
  extends Omit<SaveReadingInsightRequest, "actorSpaceId" | "startedByUserId"> {
  actorSpaceId?: string;
  actorUserId?: string;
  startedByUserId?: string;
}

export interface GetReadingDetailRequest extends GetReadingDetailQuery {
  actorSpaceId?: string;
  actorUserId: string;
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
  libraryEntryId: string,
  claimedSpaceId: string | undefined,
): void {
  const { entry, space } = getLibraryContext(store, libraryEntryId);
  assertSpaceContextMatches(entry.spaceId, claimedSpaceId);
  const actorHasResourceMembership = store.memberships.some(
    (membership) =>
      membership.spaceId === entry.spaceId && membership.userId === actorUserId,
  );

  assertCanReadResource({
    actorHasResourceMembership,
    actorSpaceId: entry.spaceId,
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
        insights: store.insights.filter(
          (insight) => insight.libraryEntryId === input.libraryEntryId,
        ),
        notes: store.notes.filter((note) => {
          if (note.libraryEntryId !== input.libraryEntryId) {
            return false;
          }

          return canReadResource({
            actorHasResourceMembership,
            actorSpaceId: entry.spaceId,
            actorUserId: input.actorUserId,
            resourceOwnerUserId: note.authorUserId,
            resourceSpaceId: entry.spaceId,
            visibility: note.visibility,
          });
        }),
      };
    },
    async createNote(input: CreateNoteRequest): Promise<NoteRecord> {
      const effectiveActorUserId = input.actorUserId ?? input.authorUserId;

      if (!effectiveActorUserId) {
        throw new Error("Reading note creation requires an actor user id.");
      }

      if (input.authorUserId && input.authorUserId !== effectiveActorUserId) {
        throw new Error(
          "Request body actor does not match the server-derived actor.",
        );
      }

      assertEntryAccess(
        store,
        effectiveActorUserId,
        input.libraryEntryId,
        input.actorSpaceId,
      );

      const note: NoteRecord = {
        authorUserId: effectiveActorUserId,
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
      const effectiveActorUserId = input.actorUserId ?? input.startedByUserId;

      if (!effectiveActorUserId) {
        throw new Error("Reading insight creation requires an actor user id.");
      }

      if (input.startedByUserId && input.startedByUserId !== effectiveActorUserId) {
        throw new Error(
          "Request body actor does not match the server-derived actor.",
        );
      }

      assertEntryAccess(
        store,
        effectiveActorUserId,
        input.libraryEntryId,
        input.actorSpaceId,
      );

      const { asset } = getLibraryContext(store, input.libraryEntryId);
      const createdAt = new Date().toISOString();
      const conversation: ConversationRecord = {
        createdAt,
        id: store.nextId("conversation"),
        libraryEntryId: input.libraryEntryId,
        startedByUserId: effectiveActorUserId,
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
