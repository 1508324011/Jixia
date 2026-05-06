import type { GeneratedInsightRecord } from "@shared/contracts/evidence";
import type { NoteRecord, ReadingDetail } from "@shared/contracts/reading";

import type {
  CreateNoteRequest,
  GetReadingDetailRequest,
  ReadingService,
  SaveGeneratedInsightRequest,
} from "../services/reading.service";

export interface ReadingRoutes {
  createNote(input: CreateNoteRequest): Promise<NoteRecord>;
  createWorkbenchNote: ReadingService["createWorkbenchNote"];
  getDetail(input: GetReadingDetailRequest): Promise<ReadingDetail | null>;
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
    createWorkbenchNote(input) {
      return service.createWorkbenchNote(input);
    },
    getDetail(input: GetReadingDetailRequest): Promise<ReadingDetail | null> {
      return service.getDetail(input);
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
