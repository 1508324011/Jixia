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

export interface ReadingRetrievalStateView {
  detail: string;
  fullTextAvailable: boolean;
  state: 'document-ready' | 'metadata-only';
  summary: string;
}

export interface ReadingDocumentSectionView {
  body: string;
  id: string;
  title: string;
}

export interface ReadingDocumentView {
  sections: ReadingDocumentSectionView[];
  title: string;
}

export interface ReadingCompanionView {
  notebookPath: string;
  projectDocsPath?: string;
  projectPath?: string;
  readerPath: string;
}

export interface ReadingWorkspaceView {
  companion?: ReadingCompanionView;
  notebookId: string;
  sharedComments: NoteRecord[];
}

export const metadataOnlyReadingRetrievalState: ReadingRetrievalStateView = {
  detail: 'Abstract metadata is ready for review, but full text stays outside this demo.',
  fullTextAvailable: false,
  state: 'metadata-only',
  summary: 'Metadata imported',
};

export const documentReadyReadingRetrievalState: ReadingRetrievalStateView = {
  detail: 'Structured reading content is ready for the document-first canvas.',
  fullTextAvailable: true,
  state: 'document-ready',
  summary: 'Reading document ready',
};

export interface ReadingDetailView {
  asset: LibraryEntryView['asset'];
  document: ReadingDocumentView;
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
