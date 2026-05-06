import type {
  CreateNotebookDocumentRequest,
  NotebookCitationRecord,
  NotebookDocumentLookup,
  NotebookDocumentRecord,
  NotebookDocumentSnapshot,
} from '@shared/contracts/notebook';

import type { NotebookRepository } from '../../db';

import type { LibraryService } from './library.service';

export interface SaveNotebookDocumentRequest {
  citations: Array<{
    evidenceSpan?: string;
    paperAssetId: string;
  }>;
  content: string;
  documentId: string;
}

export interface NotebookService {
  createDocument(
    input: CreateNotebookDocumentRequest,
    actorUserId: string,
  ): Promise<NotebookDocumentRecord>;
  getDocument(
    query: NotebookDocumentLookup,
    actorUserId: string,
  ): Promise<NotebookDocumentRecord>;
  saveDocument(
    input: SaveNotebookDocumentRequest,
    actorUserId: string,
  ): Promise<NotebookDocumentSnapshot>;
}

export interface NotebookStore {
  libraryService: LibraryService;
  notebookRepository: NotebookRepository;
}

function mapCitation(citation: {
  createdAt: string;
  evidenceSpan?: string;
  id: string;
  notebookDocumentVersionId: string;
  paperAssetId: string;
}): NotebookCitationRecord {
  return {
    createdAt: citation.createdAt,
    evidenceSpan: citation.evidenceSpan,
    id: citation.id,
    notebookDocumentVersionId: citation.notebookDocumentVersionId,
    paperAssetId: citation.paperAssetId,
  };
}

function mapDocument(document: {
  createdAt: string;
  id: string;
  ownerId: string;
  title: string;
  updatedAt: string;
}): NotebookDocumentRecord {
  return {
    createdAt: document.createdAt,
    id: document.id,
    ownerId: document.ownerId,
    title: document.title,
    updatedAt: document.updatedAt,
  };
}

function mapSnapshot(snapshot: {
  capturedAt: string;
  citations: Array<{
    createdAt: string;
    evidenceSpan?: string;
    id: string;
    notebookDocumentVersionId: string;
    paperAssetId: string;
  }>;
  content: string;
  document: {
    createdAt: string;
    id: string;
    ownerId: string;
    title: string;
    updatedAt: string;
  };
  versionId: string;
  versionNumber: number;
}): NotebookDocumentSnapshot {
  return {
    capturedAt: snapshot.capturedAt,
    citations: snapshot.citations.map(mapCitation),
    content: snapshot.content,
    document: mapDocument(snapshot.document),
    versionId: snapshot.versionId,
    versionNumber: snapshot.versionNumber,
  };
}

async function requireOwnedDocument(
  notebookRepository: NotebookRepository,
  documentId: string,
  actorUserId: string,
): Promise<NotebookDocumentRecord> {
  const document = await notebookRepository.getDocumentForOwner(
    documentId,
    actorUserId,
  );

  if (!document) {
    const existingDocument = await notebookRepository.findDocument(documentId);

    if (!existingDocument) {
      throw new Error(`Notebook document ${documentId} does not exist.`);
    }

    throw new Error('Access denied for the requested notebook document.');
  }

  return mapDocument(document);
}

async function normalizeAuthorizedCitations(
  libraryService: LibraryService,
  citations: Array<{ evidenceSpan?: string; paperAssetId: string }>,
  actorUserId: string,
): Promise<Array<{ evidenceSpan?: string; paperAssetId: string }>> {
  const normalizedCitations: Array<{
    evidenceSpan?: string;
    paperAssetId: string;
  }> = [];

  for (const citation of citations) {
    const authorizedView = await libraryService
      .assertCanAccessEntry(citation.paperAssetId, actorUserId)
      .catch((error) => {
        if (
          error instanceof Error &&
          new RegExp(`^Library entry ${citation.paperAssetId} does not exist\\.$`).test(
            error.message,
          )
        ) {
          return libraryService.assertCanAccessPaperAsset(
            citation.paperAssetId,
            actorUserId,
          );
        }

        throw error;
      });

    normalizedCitations.push({
      evidenceSpan: citation.evidenceSpan,
      paperAssetId: authorizedView.asset.id,
    });
  }

  return normalizedCitations;
}

export function createNotebookService(store: NotebookStore): NotebookService {
  return {
    async createDocument(
      input: CreateNotebookDocumentRequest,
      actorUserId: string,
    ): Promise<NotebookDocumentRecord> {
      if (input.ownerId && input.ownerId !== actorUserId) {
        throw new Error(
          'Notebook documents must be created by their owner.',
        );
      }

      return mapDocument(
        await store.notebookRepository.createDocument({
          ownerId: actorUserId,
          title: input.title,
        }),
      );
    },
    async getDocument(
      query: NotebookDocumentLookup,
      actorUserId: string,
    ): Promise<NotebookDocumentRecord> {
      return requireOwnedDocument(
        store.notebookRepository,
        query.documentId,
        actorUserId,
      );
    },
    async saveDocument(
      input: SaveNotebookDocumentRequest,
      actorUserId: string,
    ): Promise<NotebookDocumentSnapshot> {
      await requireOwnedDocument(
        store.notebookRepository,
        input.documentId,
        actorUserId,
      );
      const citations = await normalizeAuthorizedCitations(
        store.libraryService,
        input.citations,
        actorUserId,
      );

      return mapSnapshot(
        await store.notebookRepository.saveVersion({
          citations,
          content: input.content,
          documentId: input.documentId,
        }),
      );
    },
  };
}
