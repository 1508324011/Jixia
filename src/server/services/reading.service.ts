import type {
  GeneratedInsightRecord,
  EvidenceSpanRecord,
} from '@shared/contracts/evidence';
import type { LibraryEntryView } from '@shared/contracts/library';
import type {
  ConversationRecord,
  NoteRecord,
  NoteVisibility,
} from '@shared/contracts/reading';
import type { SpaceMembership } from '@shared/contracts/spaces';

import { assertCanReadResource } from '../policies/access-policy';
import type {
  StoredLibraryEntry,
  StoredPaperAsset,
} from './import.service';
import type { StoredSpace } from './spaces.service';
import type { EvidenceLinkService } from './evidence-link.service';

export interface CreateNoteRequest {
  actorSpaceId: string;
  authorUserId: string;
  body: string;
  libraryEntryId: string;
  visibility: NoteVisibility;
}

export interface SaveGeneratedInsightRequest {
  actorSpaceId: string;
  evidenceSpans: Omit<EvidenceSpanRecord, 'paperAssetId'>[];
  libraryEntryId: string;
  startedByUserId: string;
  summary: string;
  title: string;
}

export interface ReadingDetail {
  asset: LibraryEntryView['asset'];
  entry: LibraryEntryView['entry'];
  insights: GeneratedInsightRecord[];
  notes: NoteRecord[];
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
  spaces: StoredSpace[];
}

export interface ReadingService {
  createNote(input: CreateNoteRequest): Promise<NoteRecord>;
  getDetail(libraryEntryId: string): Promise<ReadingDetail | null>;
  saveGeneratedInsight(
    input: SaveGeneratedInsightRequest,
  ): Promise<GeneratedInsightRecord>;
}

function getLibraryContext(store: ReadingStore, libraryEntryId: string): {
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

  const space = store.spaces.find((candidate) => candidate.id === entry.spaceId);

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
  visibility: 'private' | 'space_shared' | 'published_to_project',
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
    visibility,
  });
}

export function createReadingService(store: ReadingStore): ReadingService {
  return {
    async getDetail(libraryEntryId: string): Promise<ReadingDetail | null> {
      const entry = store.libraryEntries.find(
        (candidate) => candidate.id === libraryEntryId,
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
          (insight) => insight.libraryEntryId === libraryEntryId,
        ),
        notes: store.notes.filter(
          (note) => note.libraryEntryId === libraryEntryId,
        ),
      };
    },
    async createNote(input: CreateNoteRequest): Promise<NoteRecord> {
      assertEntryAccess(
        store,
        input.authorUserId,
        input.actorSpaceId,
        input.libraryEntryId,
        input.visibility,
      );

      const note: NoteRecord = {
        authorUserId: input.authorUserId,
        body: input.body,
        createdAt: new Date().toISOString(),
        id: store.nextId('note'),
        libraryEntryId: input.libraryEntryId,
        visibility: input.visibility,
      };

      store.notes.push(note);

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
        'space_shared',
      );

      const { asset } = getLibraryContext(store, input.libraryEntryId);
      const createdAt = new Date().toISOString();
      const conversation: ConversationRecord = {
        createdAt,
        id: store.nextId('conversation'),
        libraryEntryId: input.libraryEntryId,
        startedByUserId: input.startedByUserId,
        title: input.title,
      };

      store.conversations.push(conversation);

      const insight = store.evidenceLinkService.createGeneratedInsight({
        conversationId: conversation.id,
        createdAt,
        evidenceSpans: input.evidenceSpans,
        id: store.nextId('insight'),
        libraryEntryId: input.libraryEntryId,
        paperAssetId: asset.id,
        summary: input.summary,
      });

      store.insights.push(insight);

      return insight;
    },
  };
}
