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

export const notebookContract = 'jixia-notebook-contract';
