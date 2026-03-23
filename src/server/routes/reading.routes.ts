import type { GeneratedInsightRecord } from '@shared/contracts/evidence';
import type { NoteRecord } from '@shared/contracts/reading';

import type {
  CreateWorkbenchNoteRequest,
  CreateNoteRequest,
  GetReadingDetailRequest,
  GetWorkbenchReadingDetailRequest,
  ReadingService,
  SaveWorkbenchGeneratedInsightRequest,
  SaveGeneratedInsightRequest,
} from '../services/reading.service';
import type { ReadingDetailView } from '@shared/contracts/reading';

export interface ReadingRoutes {
  createNote(input: CreateNoteRequest): Promise<NoteRecord>;
  createWorkbenchNote(input: CreateWorkbenchNoteRequest): Promise<NoteRecord>;
  getDetail(input: GetReadingDetailRequest): Promise<ReadingDetailView | null>;
  getWorkbenchDetail(
    input: GetWorkbenchReadingDetailRequest,
  ): Promise<ReadingDetailView | null>;
  saveGeneratedInsight(
    input: SaveGeneratedInsightRequest,
  ): Promise<GeneratedInsightRecord>;
  saveWorkbenchGeneratedInsight(
    input: SaveWorkbenchGeneratedInsightRequest,
  ): Promise<GeneratedInsightRecord>;
}

export function createReadingRoutes(service: ReadingService): ReadingRoutes {
  return {
    createNote(input: CreateNoteRequest): Promise<NoteRecord> {
      return service.createNote(input);
    },
    createWorkbenchNote(input: CreateWorkbenchNoteRequest): Promise<NoteRecord> {
      return service.createWorkbenchNote(input);
    },
    getDetail(input: GetReadingDetailRequest): Promise<ReadingDetailView | null> {
      return service.getDetail(input);
    },
    getWorkbenchDetail(
      input: GetWorkbenchReadingDetailRequest,
    ): Promise<ReadingDetailView | null> {
      return service.getWorkbenchDetail(input);
    },
    saveGeneratedInsight(
      input: SaveGeneratedInsightRequest,
    ): Promise<GeneratedInsightRecord> {
      return service.saveGeneratedInsight(input);
    },
    saveWorkbenchGeneratedInsight(
      input: SaveWorkbenchGeneratedInsightRequest,
    ): Promise<GeneratedInsightRecord> {
      return service.saveWorkbenchGeneratedInsight(input);
    },
  };
}
