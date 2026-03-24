import type { GeneratedInsightRecord } from './evidence';
import type { LibraryEntryView } from './library';

export type ReaderObjectType = 'library-entry';
export type NoteVisibility = 'private' | 'space_shared';

export interface NoteRecord {
  id: string;
  libraryEntryId: string;
  authorUserId: string;
  visibility: NoteVisibility;
  body: string;
  createdAt: string;
}

export interface ConversationRecord {
  id: string;
  libraryEntryId: string;
  startedByUserId: string;
  title: string;
  createdAt: string;
}

export interface ReadingStateRecord {
  objectType: ReaderObjectType;
  libraryEntryId: string;
  userId: string;
  progressPercent: number;
  lastReadAt: string;
}

export interface ReadingDetailView {
  asset: LibraryEntryView['asset'];
  entry: LibraryEntryView['entry'];
  insights: GeneratedInsightRecord[];
  notes: NoteRecord[];
}

export interface ReadingNoteResponse {
  note: NoteRecord;
}

export interface ReadingInsightResponse {
  insight: GeneratedInsightRecord;
}

export const readingContract = 'jixia-reading-contract';
