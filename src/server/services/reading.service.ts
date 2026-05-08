import type { EvidenceSpanRecord, GeneratedInsightRecord } from "@shared/contracts/evidence";
import type {
  CreateReadingNoteRequest,
  GetReadingDetailQuery,
  NoteRecord,
  ReadingDetail,
  SaveReadingInsightRequest,
  NoteVisibility,
} from "@shared/contracts/reading";

import type {
  PersistedLibraryEntryView,
  ReadingRepository,
} from "../../db";

import { mapPersistedLibraryEntryView } from "./import.service";
import type { LibraryService } from "./library.service";

export interface CreateNoteRequest
  extends Omit<CreateReadingNoteRequest, "actorSpaceId" | "authorUserId"> {
  actorSpaceId?: string;
  actorUserId: string;
  authorUserId?: string;
}

export interface SaveGeneratedInsightRequest
  extends Omit<SaveReadingInsightRequest, "actorSpaceId" | "startedByUserId"> {
  actorSpaceId?: string;
  actorUserId: string;
  startedByUserId?: string;
}

export interface GetReadingDetailRequest extends GetReadingDetailQuery {
  actorSpaceId?: string;
  actorUserId: string;
  libraryEntryId: string;
}

export interface ReadingStore {
  libraryService: LibraryService;
  readingRepository: ReadingRepository;
}

export interface ReadingService {
  createNote(input: CreateNoteRequest): Promise<NoteRecord>;
  createWorkbenchNote(input: {
    authorUserId: string;
    body: string;
    libraryEntryId: string;
    visibility: NoteVisibility;
  }): Promise<NoteRecord>;
  getDetail(input: GetReadingDetailRequest): Promise<ReadingDetail | null>;
  getWorkbenchDetail(input: {
    actorUserId: string;
    libraryEntryId: string;
  }): Promise<ReadingDetail | null>;
  saveGeneratedInsight(
    input: SaveGeneratedInsightRequest,
  ): Promise<GeneratedInsightRecord>;
  saveWorkbenchGeneratedInsight(input: {
    evidenceSpans: Array<Omit<EvidenceSpanRecord, "paperAssetId">>;
    libraryEntryId: string;
    startedByUserId: string;
    summary: string;
    title: string;
  }): Promise<GeneratedInsightRecord>;
}

async function getAuthorizedLibraryContext(
  store: ReadingStore,
  input: {
    actorSpaceId?: string;
    actorUserId: string;
    libraryEntryId: string;
  },
): Promise<PersistedLibraryEntryView> {
  return store.libraryService.assertCanAccessEntry(
    input.libraryEntryId,
    input.actorUserId,
    input.actorSpaceId,
  );
}

function canReadNote(
  note: NoteRecord,
  actorUserId: string,
): boolean {
  if (note.visibility === "private") {
    return note.authorUserId === actorUserId;
  }

  return true;
}

export function createReadingService(store: ReadingStore): ReadingService {
  return {
    async getDetail(
      input: GetReadingDetailRequest,
    ): Promise<ReadingDetail | null> {
      const view = await getAuthorizedLibraryContext(store, input).catch((error) => {
        if (
          error instanceof Error &&
          new RegExp(`^Library entry ${input.libraryEntryId} does not exist\\.$`).test(
            error.message,
          )
        ) {
          return null;
        }

        throw error;
      });

      if (!view) {
        return null;
      }

      await store.readingRepository.touchReadingState({
        libraryEntryId: input.libraryEntryId,
        userId: input.actorUserId,
      });

      const mappedView = mapPersistedLibraryEntryView(view);
      const notes = await store.readingRepository.listNotesForEntry({
        actorUserId: input.actorUserId,
        includeSharedNotes: view.entry.scope.type === "project",
        libraryEntryId: input.libraryEntryId,
      });
      const insights = await store.readingRepository.listGeneratedInsightsForEntry(
        input.libraryEntryId,
      );

      return {
        asset: mappedView.asset,
        entry: mappedView.entry,
        insights,
        notes: notes.filter((note) => canReadNote(note, input.actorUserId)),
      };
    },
    async getWorkbenchDetail(input: {
      actorUserId: string;
      libraryEntryId: string;
    }): Promise<ReadingDetail | null> {
      return this.getDetail(input);
    },
    async createNote(input: CreateNoteRequest): Promise<NoteRecord> {
      if (input.authorUserId && input.authorUserId !== input.actorUserId) {
        throw new Error(
          "Request body actor does not match the server-derived actor.",
        );
      }

      await getAuthorizedLibraryContext(store, input);

      return store.readingRepository.createNote({
        authorUserId: input.actorUserId,
        body: input.body,
        libraryEntryId: input.libraryEntryId,
        visibility: input.visibility,
      });
    },
    async createWorkbenchNote(input: {
      authorUserId: string;
      body: string;
      libraryEntryId: string;
      visibility: NoteVisibility;
    }): Promise<NoteRecord> {
      return this.createNote({
        actorUserId: input.authorUserId,
        authorUserId: input.authorUserId,
        body: input.body,
        libraryEntryId: input.libraryEntryId,
        visibility: input.visibility,
      });
    },
    async saveGeneratedInsight(
      input: SaveGeneratedInsightRequest,
    ): Promise<GeneratedInsightRecord> {
      if (input.startedByUserId && input.startedByUserId !== input.actorUserId) {
        throw new Error(
          "Request body actor does not match the server-derived actor.",
        );
      }

      const view = await getAuthorizedLibraryContext(store, input);
      const conversation = await store.readingRepository.createConversation({
        libraryEntryId: input.libraryEntryId,
        startedByUserId: input.actorUserId,
        title: input.title,
      });

      return store.readingRepository.saveGeneratedInsight({
        conversationId: conversation.id,
        createdByUserId: input.actorUserId,
        evidenceSpans: input.evidenceSpans.map((span, index) => ({
          endOffset: span.endOffset,
          orderIndex: index,
          paperAssetId: view.asset.id,
          quote: span.quote,
          startOffset: span.startOffset,
        })),
        libraryEntryId: input.libraryEntryId,
        summary: input.summary,
      });
    },
    async saveWorkbenchGeneratedInsight(input: {
      evidenceSpans: Array<Omit<EvidenceSpanRecord, "paperAssetId">>;
      libraryEntryId: string;
      startedByUserId: string;
      summary: string;
      title: string;
    }): Promise<GeneratedInsightRecord> {
      return this.saveGeneratedInsight({
        actorUserId: input.startedByUserId,
        evidenceSpans: input.evidenceSpans,
        libraryEntryId: input.libraryEntryId,
        startedByUserId: input.startedByUserId,
        summary: input.summary,
        title: input.title,
      });
    },
  };
}
