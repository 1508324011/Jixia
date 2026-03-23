import type { GeneratedInsightRecord } from '@shared/contracts/evidence';
import type { NoteRecord } from '@shared/contracts/reading';

import type {
  CreateNoteRequest,
  GetReadingDetailRequest,
  ReadingDetail,
  ReadingService,
  SaveGeneratedInsightRequest,
} from '../services/reading.service';

export interface ReadingRoutes {
  createNote(input: CreateNoteRequest): Promise<NoteRecord>;
  getDetail(input: GetReadingDetailRequest): Promise<ReadingDetail | null>;
  saveGeneratedInsight(
    input: SaveGeneratedInsightRequest,
  ): Promise<GeneratedInsightRecord>;
}

export function createReadingRoutes(service: ReadingService): ReadingRoutes {
  return {
    createNote(input: CreateNoteRequest): Promise<NoteRecord> {
      return service.createNote(input);
    },
    getDetail(input: GetReadingDetailRequest): Promise<ReadingDetail | null> {
      return service.getDetail(input);
    },
    saveGeneratedInsight(
      input: SaveGeneratedInsightRequest,
    ): Promise<GeneratedInsightRecord> {
      return service.saveGeneratedInsight(input);
    },
  };
}
