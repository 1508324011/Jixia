import type { GeneratedInsightRecord } from "@shared/contracts/evidence";
import type {
  PrivateReadingNoteRecord,
  ReaderExcerptRecord,
  ProjectReadingCommentRecord,
  ReadingDetail,
} from "@shared/contracts/reading";

import type {
  CreateNoteRequest,
  CreateProjectCommentRequest,
  CreateReaderExcerptServiceRequest,
  GetReadingDetailRequest,
  ListReaderExcerptsRequest,
  ReadingService,
  SaveGeneratedInsightRequest,
} from "../services/reading.service";

export interface ReadingRoutes {
  createReaderExcerpt(
    input: CreateReaderExcerptServiceRequest,
  ): Promise<ReaderExcerptRecord>;
  createNote(input: CreateNoteRequest): Promise<PrivateReadingNoteRecord>;
  createProjectComment(
    input: CreateProjectCommentRequest,
  ): Promise<ProjectReadingCommentRecord>;
  createWorkbenchNote: ReadingService["createWorkbenchNote"];
  createWorkbenchProjectComment: ReadingService["createWorkbenchProjectComment"];
  getDetail(input: GetReadingDetailRequest): Promise<ReadingDetail | null>;
  getGeneratedInsightSource: ReadingService["getGeneratedInsightSource"];
  getReaderExcerptSource: ReadingService["getReaderExcerptSource"];
  getWorkbenchDetail: ReadingService["getWorkbenchDetail"];
  listReaderExcerpts(input: ListReaderExcerptsRequest): Promise<ReaderExcerptRecord[]>;
  saveGeneratedInsight(
    input: SaveGeneratedInsightRequest,
  ): Promise<GeneratedInsightRecord>;
  saveWorkbenchGeneratedInsight: ReadingService["saveWorkbenchGeneratedInsight"];
}

export function createReadingRoutes(service: ReadingService): ReadingRoutes {
  return {
    createReaderExcerpt(
      input: CreateReaderExcerptServiceRequest,
    ): Promise<ReaderExcerptRecord> {
      return service.createReaderExcerpt(input);
    },
    createNote(input: CreateNoteRequest): Promise<PrivateReadingNoteRecord> {
      return service.createNote(input);
    },
    createProjectComment(
      input: CreateProjectCommentRequest,
    ): Promise<ProjectReadingCommentRecord> {
      return service.createProjectComment(input);
    },
    createWorkbenchNote(input) {
      return service.createWorkbenchNote(input);
    },
    createWorkbenchProjectComment(input) {
      return service.createWorkbenchProjectComment(input);
    },
    getDetail(input: GetReadingDetailRequest): Promise<ReadingDetail | null> {
      return service.getDetail(input);
    },
    getGeneratedInsightSource(input) {
      return service.getGeneratedInsightSource(input);
    },
    getReaderExcerptSource(input) {
      return service.getReaderExcerptSource(input);
    },
    getWorkbenchDetail(input) {
      return service.getWorkbenchDetail(input);
    },
    listReaderExcerpts(
      input: ListReaderExcerptsRequest,
    ): Promise<ReaderExcerptRecord[]> {
      return service.listReaderExcerpts(input);
    },
    saveGeneratedInsight(
      input: SaveGeneratedInsightRequest,
    ): Promise<GeneratedInsightRecord> {
      return service.saveGeneratedInsight(input);
    },
    saveWorkbenchGeneratedInsight(input) {
      return service.saveWorkbenchGeneratedInsight(input);
    },
  };
}
