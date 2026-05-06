import type { EvidenceSpanRecord, GeneratedInsightRecord } from "@shared/contracts/evidence";
import type {
  CreateReadingNoteRequest,
  ConversationRecord,
  GetReadingDetailQuery,
  NoteRecord,
  ReadingDetail,
  SaveReadingInsightRequest,
  NoteVisibility,
} from "@shared/contracts/reading";

import type { PersistedLibraryEntryView } from "../../db";

import { mapPersistedLibraryEntryView } from "./import.service";
import type { LibraryService } from "./library.service";
import type { EvidenceLinkService } from "./evidence-link.service";

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
  conversations: ConversationRecord[];
  evidenceLinkService: EvidenceLinkService;
  insights: GeneratedInsightRecord[];
  libraryService: LibraryService;
  nextId(prefix: string): string;
  notes: NoteRecord[];
  persist(): void;
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
  entry: PersistedLibraryEntryView["entry"],
): boolean {
  if (note.visibility === "private") {
    return note.authorUserId === actorUserId;
  }

  return entry.scope.type === "project" || note.authorUserId === actorUserId;
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

      const mappedView = mapPersistedLibraryEntryView(view);

      return {
        asset: mappedView.asset,
        entry: mappedView.entry,
        insights: store.insights.filter(
          (insight) => insight.libraryEntryId === input.libraryEntryId,
        ),
        notes: store.notes.filter((note) => {
          if (note.libraryEntryId !== input.libraryEntryId) {
            return false;
          }

          return canReadNote(note, input.actorUserId, view.entry);
        }),
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

      const note: NoteRecord = {
        authorUserId: input.actorUserId,
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
      const createdAt = new Date().toISOString();
      const conversation: ConversationRecord = {
        createdAt,
        id: store.nextId("conversation"),
        libraryEntryId: input.libraryEntryId,
        startedByUserId: input.actorUserId,
        title: input.title,
      };

      store.conversations.push(conversation);

      const insight = store.evidenceLinkService.createGeneratedInsight({
        conversationId: conversation.id,
        createdAt,
        evidenceSpans: input.evidenceSpans,
        id: store.nextId("insight"),
        libraryEntryId: input.libraryEntryId,
        paperAssetId: view.asset.id,
        summary: input.summary,
      });

      store.insights.push(insight);
      store.persist();

      return insight;
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
