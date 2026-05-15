import type { GeneratedInsightRecord } from "@shared/contracts/evidence";
import type {
  NoteRecord,
  ProjectReadingCommentRecord,
  ReadingDetail,
} from "@shared/contracts/reading";

import type {
  CreateNoteRequest,
  CreateProjectCommentRequest,
  GetReadingDetailRequest,
  ReadingService,
  SaveGeneratedInsightRequest,
} from "../services/reading.service";

export interface ReadingRoutes {
  createNote(input: CreateNoteRequest): Promise<NoteRecord>;
  createProjectComment(
    input: CreateProjectCommentRequest,
  ): Promise<ProjectReadingCommentRecord>;
  createWorkbenchNote: ReadingService["createWorkbenchNote"];
  createWorkbenchProjectComment: ReadingService["createWorkbenchProjectComment"];
  getDetail(input: GetReadingDetailRequest): Promise<ReadingDetail | null>;
  getGeneratedInsightSource: ReadingService["getGeneratedInsightSource"];
  getWorkbenchDetail: ReadingService["getWorkbenchDetail"];
  saveGeneratedInsight(
    input: SaveGeneratedInsightRequest,
  ): Promise<GeneratedInsightRecord>;
  saveWorkbenchGeneratedInsight: ReadingService["saveWorkbenchGeneratedInsight"];
}

export function createReadingRoutes(service: ReadingService): ReadingRoutes {
  return {
    createNote(input: CreateNoteRequest): Promise<NoteRecord> {
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
    getWorkbenchDetail(input) {
      return service.getWorkbenchDetail(input);
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
