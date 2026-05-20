import type { EvidenceSpanRecord, GeneratedInsightRecord } from "@shared/contracts/evidence";
import type {
  CreateProjectReadingCommentRequest,
  CreateReadingNoteRequest,
  GetReadingDetailQuery,
  PrivateReadingNoteRecord,
  ProjectReadingCommentRecord,
  ReadingDetail,
  SaveReadingInsightRequest,
} from "@shared/contracts/reading";

import type {
  PersistedLibraryEntryView,
  ReadingRepository,
} from "../../db";

import type { LibraryService } from "./library.service";

export interface CreateNoteRequest
  extends CreateReadingNoteRequest {
  actorSpaceId?: string;
  actorUserId: string;
  /** @deprecated Compatibility assertion only. */
  authorUserId?: string;
  /** @deprecated Compatibility label. Private-note endpoint only accepts private. */
  visibility?: "private" | "space_shared";
}

export interface CreateProjectCommentRequest
  extends CreateProjectReadingCommentRequest {
  actorSpaceId?: string;
  actorUserId: string;
  /** @deprecated Compatibility assertion only. */
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
  createNote(input: CreateNoteRequest): Promise<PrivateReadingNoteRecord>;
  createProjectComment(
    input: CreateProjectCommentRequest,
  ): Promise<ProjectReadingCommentRecord>;
  createWorkbenchNote(input: {
    authorUserId: string;
    body: string;
    libraryEntryId: string;
    visibility?: "private" | "space_shared";
  }): Promise<PrivateReadingNoteRecord>;
  createWorkbenchProjectComment(input: {
    actorSpaceId?: string;
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

function assertPrivateNoteCompatibility(input: CreateNoteRequest): void {
  if (input.authorUserId && input.authorUserId !== input.actorUserId) {
    throw new Error(
      "Request body actor does not match the server-derived actor.",
    );
  }

  if (input.visibility && input.visibility !== "private") {
    throw new Error(
      "Project comments must use the project-comments endpoint instead of note visibility.",
    );
  }
}

function assertProjectCommentCompatibility(
  input: CreateProjectCommentRequest,
  projectId: string,
): void {
  if (input.authorUserId && input.authorUserId !== input.actorUserId) {
    throw new Error(
      "Request body actor does not match the server-derived actor.",
    );
  }

  if (input.projectId && input.projectId !== projectId) {
    throw new Error(
      "Request project context does not match the scoped library entry project.",
    );
  }
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

      // Repository LibraryEntry rows intentionally no longer carry live legacy
      // space/visibility mirrors. Reuse the library service HTTP/transport
      // mapper so project-scoped reader details get their compatibility
      // `entry.spaceId` from the authoritative Project.scope boundary instead
      // of from request fields or deprecated LibraryEntry columns.
      const mappedView = await store.libraryService.getEntry({
        actorSpaceId: input.actorSpaceId,
        actorUserId: input.actorUserId,
        entryId: input.libraryEntryId,
      });

      if (!mappedView) {
        return null;
      }

      const notes = await store.readingRepository.listPrivateNotesForEntry({
        actorUserId: input.actorUserId,
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
        notes: notes.map(({ visibility: _visibility, ...note }) => note),
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
    async createNote(input: CreateNoteRequest): Promise<PrivateReadingNoteRecord> {
      assertPrivateNoteCompatibility(input);
      await getAuthorizedLibraryContext(store, input);

      const { visibility: _visibility, ...note } = await store.readingRepository.createPrivateNote({
        authorUserId: input.actorUserId,
        body: input.body,
        libraryEntryId: input.libraryEntryId,
      });

      return note;
    },
    async createProjectComment(
      input: CreateProjectCommentRequest,
    ): Promise<ProjectReadingCommentRecord> {
      const view = await getAuthorizedLibraryContext(store, input);

      if (view.entry.scope.type !== "project") {
        throw new Error(
          "Project comments require a project-scoped library entry.",
        );
      }

      assertProjectCommentCompatibility(input, view.entry.scope.id);

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
      visibility?: "private" | "space_shared";
    }): Promise<PrivateReadingNoteRecord> {
      return this.createNote({
        actorUserId: input.authorUserId,
        authorUserId: input.authorUserId,
        body: input.body,
        libraryEntryId: input.libraryEntryId,
        visibility: input.visibility,
      });
    },
    async createWorkbenchProjectComment(input: {
      actorSpaceId?: string;
      authorUserId: string;
      body: string;
      libraryEntryId: string;
      projectId?: string;
    }): Promise<ProjectReadingCommentRecord> {
      return this.createProjectComment({
        actorSpaceId: input.actorSpaceId,
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
