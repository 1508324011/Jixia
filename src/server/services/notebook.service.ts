import type { NotebookNoteRecord, NotebookRecord } from '@shared/contracts/notebook';

import type { StoredLibraryEntry } from './import.service';

export interface GetNotebookForLibraryEntryRequest {
  libraryEntryId: string;
  ownerUserId: string;
}

export interface CreateNotebookNoteRequest {
  libraryEntryId: string;
  ownerUserId: string;
  text: string;
}

export interface NotebookStore {
  libraryEntries: StoredLibraryEntry[];
  nextId(prefix: string): string;
  notebookNotes: NotebookNoteRecord[];
  notebookRecords: NotebookRecord[];
  persist(): void;
}

export interface NotebookService {
  createNote(input: CreateNotebookNoteRequest): Promise<NotebookNoteRecord>;
  getNotebook(notebookId: string): NotebookRecord | null;
  getNotebookForLibraryEntry(
    input: GetNotebookForLibraryEntryRequest,
  ): Promise<NotebookRecord>;
  getNote(noteId: string): NotebookNoteRecord | null;
  listNotes(input: GetNotebookForLibraryEntryRequest): Promise<NotebookNoteRecord[]>;
}

function getEntry(store: NotebookStore, libraryEntryId: string): StoredLibraryEntry {
  const entry = store.libraryEntries.find((candidate) => candidate.id === libraryEntryId);

  if (!entry) {
    throw new Error(`Library entry ${libraryEntryId} does not exist.`);
  }

  return entry;
}

function ensureNotebook(
  store: NotebookStore,
  input: GetNotebookForLibraryEntryRequest,
): NotebookRecord {
  const entry = getEntry(store, input.libraryEntryId);
  const existing = store.notebookRecords.find(
    (candidate) =>
      candidate.ownerUserId === input.ownerUserId && candidate.paperAssetId === entry.paperAssetId,
  );

  if (existing) {
    return existing;
  }

  const notebook: NotebookRecord = {
    id: store.nextId('notebook'),
    ownerUserId: input.ownerUserId,
    paperAssetId: entry.paperAssetId,
    visibility: 'private',
  };

  store.notebookRecords.push(notebook);
  store.persist();

  return notebook;
}

export function createNotebookService(store: NotebookStore): NotebookService {
  return {
    async createNote(input) {
      const notebook = ensureNotebook(store, {
        libraryEntryId: input.libraryEntryId,
        ownerUserId: input.ownerUserId,
      });
      const entry = getEntry(store, input.libraryEntryId);
      const note: NotebookNoteRecord = {
        createdAt: new Date().toISOString(),
        id: store.nextId('notebook-note'),
        notebookId: notebook.id,
        ownerUserId: input.ownerUserId,
        paperAssetId: entry.paperAssetId,
        sourceType: 'library-entry',
        text: input.text,
      };

      store.notebookNotes.push(note);
      store.persist();

      return note;
    },
    getNotebook(notebookId) {
      return store.notebookRecords.find((candidate) => candidate.id === notebookId) ?? null;
    },
    async getNotebookForLibraryEntry(input) {
      return ensureNotebook(store, input);
    },
    getNote(noteId) {
      return store.notebookNotes.find((candidate) => candidate.id === noteId) ?? null;
    },
    async listNotes(input) {
      const notebook = ensureNotebook(store, input);

      return store.notebookNotes.filter((candidate) => candidate.notebookId === notebook.id);
    },
  };
}
