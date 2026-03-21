import type { GeneratedInsightRecord } from '@shared/contracts/evidence';
import type { NoteRecord } from '@shared/contracts/reading';

import type {
  CreateNoteRequest,
  ReadingDetail,
  ReadingService,
  SaveGeneratedInsightRequest,
} from '../services/reading.service';

export interface ReadingRoutes {
  createNote(input: CreateNoteRequest): Promise<NoteRecord>;
  getDetail(libraryEntryId: string): Promise<ReadingDetail | null>;
  saveGeneratedInsight(
    input: SaveGeneratedInsightRequest,
  ): Promise<GeneratedInsightRecord>;
}

export function createReadingRoutes(service: ReadingService): ReadingRoutes {
  return {
    createNote(input: CreateNoteRequest): Promise<NoteRecord> {
      return service.createNote(input);
    },
    getDetail(libraryEntryId: string): Promise<ReadingDetail | null> {
      return service.getDetail(libraryEntryId);
    },
    saveGeneratedInsight(
      input: SaveGeneratedInsightRequest,
    ): Promise<GeneratedInsightRecord> {
      return service.saveGeneratedInsight(input);
    },
  };
}
