import type {
  CaptureNotebookEvidenceRequest,
  CaptureNotebookEvidenceResponse,
  CreateNotebookDocumentRequest,
  ListNotebookDocumentsResponse,
  NotebookCitationRecord,
  NotebookDocumentLookup,
  NotebookDocumentRecord,
  NotebookDocumentSnapshot,
  NotebookGeneratedInsightCaptureSource,
} from '@shared/contracts/notebook';
import type { GeneratedInsightRecord } from '@shared/contracts/evidence';

import type { NotebookRepository } from '../../db';

import type { LibraryService } from './library.service';
import type { ReadingService } from './reading.service';

export interface SaveNotebookDocumentRequest {
  citations: Array<{
    evidenceSpan?: string;
    paperAssetId: string;
  }>;
  content: string;
  documentId: string;
}

export interface NotebookService {
  captureEvidence(
    input: CaptureNotebookEvidenceRequest,
    actorUserId: string,
  ): Promise<CaptureNotebookEvidenceResponse>;
  createDocument(
    input: CreateNotebookDocumentRequest,
    actorUserId: string,
  ): Promise<NotebookDocumentRecord>;
  getDocument(
    query: NotebookDocumentLookup,
    actorUserId: string,
  ): Promise<NotebookDocumentRecord>;
  getLatestSnapshot(
    query: NotebookDocumentLookup,
    actorUserId: string,
  ): Promise<NotebookDocumentSnapshot>;
  listDocuments(actorUserId: string): Promise<ListNotebookDocumentsResponse>;
  saveDocument(
    input: SaveNotebookDocumentRequest,
    actorUserId: string,
  ): Promise<NotebookDocumentSnapshot>;
}

export interface NotebookStore {
  libraryService: LibraryService;
  notebookRepository: NotebookRepository;
  readingService: Pick<ReadingService, 'getGeneratedInsightSource'>;
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

function createEmptySnapshot(document: NotebookDocumentRecord): NotebookDocumentSnapshot {
  return {
    capturedAt: document.updatedAt,
    citations: [],
    content: '',
    document,
    versionId: `notebook:${document.id}:version-0`,
    versionNumber: 0,
  };
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

function formatEvidenceLocator(span: {
  endOffset: number;
  startOffset: number;
}): string {
  return `offsets ${span.startOffset}-${span.endOffset}`;
}

function appendCapturedInsightContent(
  existingContent: string,
  input: {
    assetTitle?: string;
    capturedAt: string;
    insight: GeneratedInsightRecord;
    note?: string;
  },
): string {
  const blocks = input.insight.evidenceSpans.map((span, index) => {
    const lines = [
      `> ${span.quote}`,
      '',
      `Source: ${input.assetTitle ?? span.paperAssetId} (${formatEvidenceLocator(span)})`,
    ];

    if (index === 0 && input.note?.trim()) {
      lines.push(`Capture note: ${input.note.trim()}`);
    }

    return lines.join('\n');
  });

  const captureSection = [
    '## Captured reader evidence',
    '',
    `Captured at: ${input.capturedAt}`,
    `Library entry: ${input.insight.libraryEntryId}`,
    `Generated insight: ${input.insight.id}`,
    '',
    'Interpretation:',
    input.insight.summary,
    '',
    'Source evidence:',
    ...blocks,
  ].join('\n');

  const currentContent = existingContent.trimEnd();

  return currentContent ? `${currentContent}\n\n${captureSection}` : captureSection;
}

function createCapturedCitations(
  insight: GeneratedInsightRecord,
): Array<{ evidenceSpan?: string; paperAssetId: string }> {
  const citations = new Map<string, string[]>();

  for (const span of insight.evidenceSpans) {
    citations.set(span.paperAssetId, [
      ...(citations.get(span.paperAssetId) ?? []),
      span.quote,
    ]);
  }

  return [...citations.entries()].map(([paperAssetId, quotes]) => ({
    evidenceSpan: quotes.join('\n\n'),
    paperAssetId,
  }));
}

function normalizeGeneratedInsightCaptureSource(
  source: CaptureNotebookEvidenceRequest['source'],
): NotebookGeneratedInsightCaptureSource {
  const candidate = source as unknown;

  if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) {
    throw new Error('Notebook evidence capture source must be a JSON object.');
  }

  const sourceRecord = candidate as Record<string, unknown>;

  if (sourceRecord.type !== 'generatedInsight') {
    throw new Error('Notebook evidence capture source type must be generatedInsight.');
  }

  if (
    typeof sourceRecord.generatedInsightId !== 'string' ||
    !sourceRecord.generatedInsightId.trim()
  ) {
    throw new Error('Notebook evidence capture source requires generatedInsightId.');
  }

  if (
    typeof sourceRecord.libraryEntryId !== 'string' ||
    !sourceRecord.libraryEntryId.trim()
  ) {
    throw new Error('Notebook evidence capture source requires libraryEntryId.');
  }

  if (
    typeof sourceRecord.note !== 'undefined' &&
    typeof sourceRecord.note !== 'string'
  ) {
    throw new Error('Notebook evidence capture source note must be a string when provided.');
  }

  return {
    generatedInsightId: sourceRecord.generatedInsightId.trim(),
    libraryEntryId: sourceRecord.libraryEntryId.trim(),
    note: sourceRecord.note?.trim() || undefined,
    type: 'generatedInsight',
  };
}

export function createNotebookService(store: NotebookStore): NotebookService {
  return {
    async captureEvidence(
      input: CaptureNotebookEvidenceRequest,
      actorUserId: string,
    ): Promise<CaptureNotebookEvidenceResponse> {
      if (!input.notebookDocumentId && !input.notebookTitle?.trim()) {
        throw new Error('Notebook evidence capture requires a target notebook or title.');
      }

      const source = normalizeGeneratedInsightCaptureSource(input.source);
      const existingTargetDocument = input.notebookDocumentId
        ? await requireOwnedDocument(
            store.notebookRepository,
            input.notebookDocumentId,
            actorUserId,
          )
        : null;
      const insight = await store.readingService.getGeneratedInsightSource({
        actorUserId,
        generatedInsightId: source.generatedInsightId,
        libraryEntryId: source.libraryEntryId,
      });
      const authorizedEntry = await store.libraryService.assertCanAccessEntry(
        source.libraryEntryId,
        actorUserId,
      );
      const targetDocument = existingTargetDocument ?? mapDocument(
        await store.notebookRepository.createDocument({
          ownerId: actorUserId,
          title: input.notebookTitle?.trim() || 'Notebook',
        }),
      );
      const latestSnapshot = await store.notebookRepository.getLatestSnapshot(
        targetDocument.id,
      );
      const capturedAt = new Date().toISOString();
      const content = appendCapturedInsightContent(latestSnapshot?.content ?? '', {
        assetTitle: authorizedEntry.asset.title,
        capturedAt,
        insight,
        note: source.note,
      });
      const citations = await normalizeAuthorizedCitations(
        store.libraryService,
        createCapturedCitations(insight),
        actorUserId,
      );
      const snapshot = await store.notebookRepository.saveVersion({
        citations,
        content,
        documentId: targetDocument.id,
      });

      return {
        document: mapDocument(snapshot.document),
        snapshot: mapSnapshot(snapshot),
      };
    },
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
    async getLatestSnapshot(
      query: NotebookDocumentLookup,
      actorUserId: string,
    ): Promise<NotebookDocumentSnapshot> {
      const document = await requireOwnedDocument(
        store.notebookRepository,
        query.documentId,
        actorUserId,
      );
      const snapshot = await store.notebookRepository.getLatestSnapshot(query.documentId);

      return snapshot ? mapSnapshot(snapshot) : createEmptySnapshot(document);
    },
    async listDocuments(actorUserId: string): Promise<ListNotebookDocumentsResponse> {
      const documents = await store.notebookRepository.listDocumentsForOwner(actorUserId);

      return { documents: documents.map(mapDocument) };
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
