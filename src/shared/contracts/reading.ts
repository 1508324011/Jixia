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

export interface NotebookQuestionView {
  id: string;
  prompt: string;
}

export interface ReadingRetrievalStateView {
  detail: string;
  fullTextAvailable: boolean;
  state: 'metadata-only';
  summary: string;
}

export interface ReadingWorkspaceView {
  notebookId: string;
  privateNotes: NoteRecord[];
  questions: NotebookQuestionView[];
  sharedComments: NoteRecord[];
}

export const defaultNotebookQuestionPrompts = [
  'What changes my interpretation of this paper?',
  'Which claim deserves a project-level reference?',
  'What follow-up question should stay private for now?',
] as const;

export const metadataOnlyReadingRetrievalState: ReadingRetrievalStateView = {
  detail: 'Abstract metadata is ready for review, but full text stays outside this demo.',
  fullTextAvailable: false,
  state: 'metadata-only',
  summary: 'Metadata imported',
};

export interface ReadingDetailView {
  asset: LibraryEntryView['asset'];
  entry: LibraryEntryView['entry'];
  insights: GeneratedInsightRecord[];
  notes: NoteRecord[];
  retrieval: ReadingRetrievalStateView;
  workspace: ReadingWorkspaceView;
}

export interface ReadingNoteResponse {
  note: NoteRecord;
}

export interface ReadingInsightResponse {
  insight: GeneratedInsightRecord;
}

export const readingContract = 'jixia-reading-contract';
