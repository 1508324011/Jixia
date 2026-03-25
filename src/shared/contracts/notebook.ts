export type NotebookSourceType = 'library-entry';

export interface NotebookRecord {
  id: string;
  ownerUserId: string;
  paperAssetId: string;
  visibility: 'private';
}

export interface NotebookQuestionRecord {
  createdAt: string;
  id: string;
  notebookId: string;
  paperAssetId: string;
  prompt: string;
}

export interface NotebookNoteRecord {
  id: string;
  notebookId: string;
  ownerUserId: string;
  paperAssetId: string;
  sourceType: NotebookSourceType;
  text: string;
  createdAt: string;
}

export interface NotebookSummaryView {
  entryId: string;
  noteCount: number;
  notebookId: string;
  notesPath: string;
  paperAssetId: string;
  paperTitle: string;
  projectDocsPath?: string;
  projectId?: string;
  readerPath: string;
  spaceId: string;
  title: string;
  updatedAt: string;
  workspaceLabel: string;
  workspacePath: string;
}

export interface NotebookListResponse {
  notebooks: NotebookSummaryView[];
}

export interface NotebookDetailResponse {
  notebook: NotebookSummaryView;
}

export const notebookContract = 'jixia-notebook-contract';
