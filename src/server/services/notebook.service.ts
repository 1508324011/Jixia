import type {
  NotebookDocumentRecord,
  NotebookDocumentView,
  NotebookNoteRecord,
  NotebookRecord,
} from '@shared/contracts/notebook';

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

export interface GetNotebookDocumentRequest {
  actorUserId: string;
  notebookId: string;
}

export interface SaveNotebookDocumentRequest extends GetNotebookDocumentRequest {
  content: string;
  title: string;
}

export interface NotebookStore {
  libraryEntries: StoredLibraryEntry[];
  notebookDocuments: NotebookDocumentRecord[];
  nextId(prefix: string): string;
  notebookNotes: NotebookNoteRecord[];
  notebookRecords: NotebookRecord[];
  persist(): void;
}

export interface NotebookService {
  createNote(input: CreateNotebookNoteRequest): Promise<NotebookNoteRecord>;
  findDocument(input: GetNotebookDocumentRequest): NotebookDocumentView | null;
  getDocument(input: GetNotebookDocumentRequest): Promise<NotebookDocumentView>;
  getNotebook(notebookId: string): NotebookRecord | null;
  getNotebookByPaperAsset(input: { ownerUserId: string; paperAssetId: string }): NotebookRecord | null;
  getNotebookForLibraryEntry(
    input: GetNotebookForLibraryEntryRequest,
  ): Promise<NotebookRecord>;
  getNote(noteId: string): NotebookNoteRecord | null;
  listNotes(input: GetNotebookForLibraryEntryRequest): Promise<NotebookNoteRecord[]>;
  saveDocument(input: SaveNotebookDocumentRequest): Promise<NotebookDocumentView>;
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

function toNotebookDocumentView(document: NotebookDocumentRecord): NotebookDocumentView {
  const { notebookId: _notebookId, ...view } = document;

  return view;
}

function getNotebookWithAccess(
  store: NotebookStore,
  input: GetNotebookDocumentRequest,
): NotebookRecord {
  const notebook = store.notebookRecords.find((candidate) => candidate.id === input.notebookId);

  if (!notebook) {
    throw new Error(`Notebook ${input.notebookId} does not exist.`);
  }

  if (notebook.ownerUserId !== input.actorUserId) {
    throw new Error('Access denied for the requested notebook document.');
  }

  return notebook;
}

function ensureDocument(
  store: NotebookStore,
  input: GetNotebookDocumentRequest,
  title = 'Private notebook',
): NotebookDocumentRecord {
  const notebook = getNotebookWithAccess(store, input);
  const existingDocument = store.notebookDocuments.find(
    (candidate) => candidate.notebookId === notebook.id,
  );

  if (existingDocument) {
    return existingDocument;
  }

  const document: NotebookDocumentRecord = {
    documentId: store.nextId('notebook-doc'),
    latestSnapshot: null,
    notebookId: notebook.id,
    ownerType: 'user',
    ownerUserId: notebook.ownerUserId,
    title,
    visibility: 'private',
  };

  store.notebookDocuments.push(document);
  store.persist();

  return document;
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
    findDocument(input) {
      getNotebookWithAccess(store, input);

      const document = store.notebookDocuments.find(
        (candidate) => candidate.notebookId === input.notebookId,
      );

      return document ? toNotebookDocumentView(document) : null;
    },
    async getDocument(input) {
      return toNotebookDocumentView(ensureDocument(store, input));
    },
    getNotebook(notebookId) {
      return store.notebookRecords.find((candidate) => candidate.id === notebookId) ?? null;
    },
    getNotebookByPaperAsset(input) {
      return (
        store.notebookRecords.find(
          (candidate) =>
            candidate.ownerUserId === input.ownerUserId &&
            candidate.paperAssetId === input.paperAssetId,
        ) ?? null
      );
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
    async saveDocument(input) {
      const document = ensureDocument(store, input, input.title);

      document.title = input.title;
      document.latestSnapshot = {
        capturedAt: new Date().toISOString(),
        content: input.content,
      };
      store.persist();

      return toNotebookDocumentView(document);
    },
  };
}
