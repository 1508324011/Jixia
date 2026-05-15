import type { EvidenceSpanRecord, GeneratedInsightRecord } from "@shared/contracts/evidence";
import type {
  CreateReadingNoteRequest,
  GetReadingDetailQuery,
  NoteRecord,
  ProjectReadingCommentRecord,
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
  visibility?: NoteVisibility;
}

export interface CreateProjectCommentRequest {
  actorSpaceId?: string;
  actorUserId: string;
  authorUserId?: string;
  body: string;
  libraryEntryId: string;
  projectId?: string;
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
  createProjectComment(
    input: CreateProjectCommentRequest,
  ): Promise<ProjectReadingCommentRecord>;
  createWorkbenchNote(input: {
    authorUserId: string;
    body: string;
    libraryEntryId: string;
    visibility?: NoteVisibility;
  }): Promise<NoteRecord>;
  createWorkbenchProjectComment(input: {
    authorUserId: string;
    body: string;
    libraryEntryId: string;
    projectId?: string;
  }): Promise<ProjectReadingCommentRecord>;
  getDetail(input: GetReadingDetailRequest): Promise<ReadingDetail | null>;
  getGeneratedInsightSource(input: {
    actorUserId: string;
    generatedInsightId: string;
    libraryEntryId: string;
  }): Promise<GeneratedInsightRecord>;
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
        includeSharedNotes: false,
        libraryEntryId: input.libraryEntryId,
      });
      const projectComments = view.entry.scope.type === "project"
        ? await store.readingRepository.listProjectCommentsForEntry({
            libraryEntryId: input.libraryEntryId,
            projectId: view.entry.scope.id,
          })
        : [];
      const insights = await store.readingRepository.listGeneratedInsightsForEntry(
        input.libraryEntryId,
      );

      return {
        asset: mappedView.asset,
        entry: mappedView.entry,
        insights,
        notes,
        projectComments,
      };
    },
    async getWorkbenchDetail(input: {
      actorUserId: string;
      libraryEntryId: string;
    }): Promise<ReadingDetail | null> {
      return this.getDetail(input);
    },
    async getGeneratedInsightSource(input: {
      actorUserId: string;
      generatedInsightId: string;
      libraryEntryId: string;
    }): Promise<GeneratedInsightRecord> {
      await getAuthorizedLibraryContext(store, input);

      const insight = await store.readingRepository.getGeneratedInsight({
        generatedInsightId: input.generatedInsightId,
        libraryEntryId: input.libraryEntryId,
      });

      if (!insight) {
        throw new Error(
          `Generated insight ${input.generatedInsightId} does not exist for library entry ${input.libraryEntryId}.`,
        );
      }

      return insight;
    },
    async createNote(input: CreateNoteRequest): Promise<NoteRecord> {
      if (input.authorUserId && input.authorUserId !== input.actorUserId) {
        throw new Error(
          "Request body actor does not match the server-derived actor.",
        );
      }

      if (input.visibility && input.visibility !== "private") {
        throw new Error(
          "Reader shared discussion must use the project-comments endpoint.",
        );
      }

      await getAuthorizedLibraryContext(store, input);

      return store.readingRepository.createNote({
        authorUserId: input.actorUserId,
        body: input.body,
        libraryEntryId: input.libraryEntryId,
        visibility: "private",
      });
    },
    async createProjectComment(
      input: CreateProjectCommentRequest,
    ): Promise<ProjectReadingCommentRecord> {
      if (input.authorUserId && input.authorUserId !== input.actorUserId) {
        throw new Error(
          "Request body actor does not match the server-derived actor.",
        );
      }

      const view = await getAuthorizedLibraryContext(store, input);

      if (view.entry.scope.type !== "project") {
        throw new Error(
          "Project comments require a project-scoped library entry.",
        );
      }

      if (input.projectId && input.projectId !== view.entry.scope.id) {
        throw new Error(
          "Request project context does not match the requested library entry.",
        );
      }

      return store.readingRepository.createProjectComment({
        authorUserId: input.actorUserId,
        body: input.body,
        libraryEntryId: input.libraryEntryId,
        projectId: view.entry.scope.id,
      });
    },
    async createWorkbenchNote(input: {
      authorUserId: string;
      body: string;
      libraryEntryId: string;
      visibility?: NoteVisibility;
    }): Promise<NoteRecord> {
      return this.createNote({
        actorUserId: input.authorUserId,
        authorUserId: input.authorUserId,
        body: input.body,
        libraryEntryId: input.libraryEntryId,
        visibility: input.visibility,
      });
    },
    async createWorkbenchProjectComment(input: {
      authorUserId: string;
      body: string;
      libraryEntryId: string;
      projectId?: string;
    }): Promise<ProjectReadingCommentRecord> {
      return this.createProjectComment({
        actorUserId: input.authorUserId,
        authorUserId: input.authorUserId,
        body: input.body,
        libraryEntryId: input.libraryEntryId,
        projectId: input.projectId,
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
