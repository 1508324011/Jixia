import type {
  DocumentBlockDocument,
  DocumentBlockReference,
} from '@shared/contracts/document-content';
import {
  createEmptyDocumentBlockDocument,
  documentBlockDocumentToLegacyText,
  extractDocumentBlockReferences,
  legacyTextToDocumentBlockDocument,
  normalizeDocumentBlockDocument,
  normalizePersistedDocumentSnapshot,
  serializeDocumentBlockSnapshotPayload,
} from '@shared/contracts/document-content';
import type {
  CaptureNotebookEvidenceRequest,
  CaptureNotebookEvidenceResponse,
  CreateNotebookDocumentRequest,
  ListNotebookDocumentsResponse,
  NotebookCitationRecord,
  NotebookDocumentLookup,
  NotebookDocumentRecord,
  NotebookDocumentSnapshot,
  NotebookEvidenceCaptureSource,
  NotebookGeneratedInsightCaptureSource,
  NotebookReaderExcerptCaptureSource,
} from '@shared/contracts/notebook';
import type { GeneratedInsightRecord } from '@shared/contracts/evidence';
import type { ReaderExcerptRecord } from '@shared/contracts/reading';

import type { NotebookRepository } from '../../db';

import type { LibraryService } from './library.service';
import type { ReadingService } from './reading.service';

export interface SaveNotebookDocumentRequest {
  citations: NotebookCitationInput[];
  content?: string;
  documentId: string;
  documentContent?: DocumentBlockDocument;
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
  readingService: Pick<ReadingService, 'getGeneratedInsightSource' | 'getReaderExcerptSource'>;
}

interface NotebookCitationInput {
  evidenceSpan?: string;
  libraryEntryId?: string;
  paperAssetId: string;
  readerExcerptId?: string;
}

function mapCitation(citation: {
  createdAt: string;
  evidenceSpan?: string;
  id: string;
  notebookDocumentVersionId: string;
  paperAssetId: string;
  readerExcerptId?: string;
}): NotebookCitationRecord {
  return {
    createdAt: citation.createdAt,
    evidenceSpan: citation.evidenceSpan,
    id: citation.id,
    notebookDocumentVersionId: citation.notebookDocumentVersionId,
    paperAssetId: citation.paperAssetId,
    readerExcerptId: citation.readerExcerptId,
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
    readerExcerptId?: string;
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
  const documentContent = normalizePersistedDocumentSnapshot(snapshot.content);

  return {
    capturedAt: snapshot.capturedAt,
    citations: snapshot.citations.map(mapCitation),
    content: documentBlockDocumentToLegacyText(documentContent),
    document: mapDocument(snapshot.document),
    documentContent,
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
    documentContent: createEmptyDocumentBlockDocument(),
    versionId: `notebook:${document.id}:version-0`,
    versionNumber: 0,
  };
}

function normalizeSaveDocumentContent(input: {
  content?: string;
  documentContent?: DocumentBlockDocument;
}): DocumentBlockDocument {
  if (typeof input.documentContent !== 'undefined') {
    return normalizeDocumentBlockDocument(input.documentContent);
  }

  if (typeof input.content !== 'string') {
    throw new Error('content is required when documentContent is not provided.');
  }

  return legacyTextToDocumentBlockDocument(input.content);
}

function referenceToCitationInput(
  reference: DocumentBlockReference,
): NotebookCitationInput {
  return {
    evidenceSpan: reference.evidenceSpan,
    libraryEntryId: reference.libraryEntryId,
    paperAssetId: reference.paperAssetId,
    readerExcerptId: reference.readerExcerptId,
  };
}

function mergeCitationInputs(
  explicitCitations: NotebookCitationInput[],
  documentContent: DocumentBlockDocument,
): NotebookCitationInput[] {
  return [
    ...explicitCitations,
    ...extractDocumentBlockReferences(documentContent).map(referenceToCitationInput),
  ];
}

function dedupeNormalizedCitations(
  citations: Array<{ evidenceSpan?: string; paperAssetId: string; readerExcerptId?: string }>,
): Array<{ evidenceSpan?: string; paperAssetId: string; readerExcerptId?: string }> {
  const byKey = new Map<string, { evidenceSpans: string[]; paperAssetId: string; readerExcerptId?: string }>();

  for (const citation of citations) {
    const key = citation.readerExcerptId
      ? `excerpt:${citation.readerExcerptId}`
      : `asset:${citation.paperAssetId}`;
    const record = byKey.get(key) ?? {
      evidenceSpans: [],
      paperAssetId: citation.paperAssetId,
      readerExcerptId: citation.readerExcerptId,
    };
    const evidenceSpan = citation.evidenceSpan?.trim();

    if (evidenceSpan && !record.evidenceSpans.includes(evidenceSpan)) {
      record.evidenceSpans.push(evidenceSpan);
    }

    byKey.set(key, record);
  }

  return [...byKey.values()].map((record) => ({
    evidenceSpan: record.evidenceSpans.length
      ? record.evidenceSpans.join('\n\n')
      : undefined,
    paperAssetId: record.paperAssetId,
    readerExcerptId: record.readerExcerptId,
  }));
}

async function normalizeAuthorizedCitations(
  store: Pick<NotebookStore, 'libraryService' | 'readingService'>,
  citations: NotebookCitationInput[],
  actorUserId: string,
): Promise<Array<{ evidenceSpan?: string; paperAssetId: string; readerExcerptId?: string }>> {
  const normalizedCitations: Array<{
    evidenceSpan?: string;
    paperAssetId: string;
    readerExcerptId?: string;
  }> = [];

  for (const citation of citations) {
    if (citation.readerExcerptId) {
      const source = await store.readingService.getReaderExcerptSource({
        actorUserId,
        readerExcerptId: citation.readerExcerptId,
      });

      if (citation.libraryEntryId && citation.libraryEntryId !== source.excerpt.libraryEntryId) {
        throw new Error(
          `Document reference ${citation.readerExcerptId} does not match library entry ${citation.libraryEntryId}.`,
        );
      }

      if (citation.paperAssetId && citation.paperAssetId !== source.excerpt.paperAssetId) {
        throw new Error(
          `Document reference ${citation.paperAssetId} does not match reader excerpt ${citation.readerExcerptId}.`,
        );
      }

      normalizedCitations.push({
        evidenceSpan: citation.evidenceSpan ?? source.excerpt.quote,
        paperAssetId: source.excerpt.paperAssetId,
        readerExcerptId: source.excerpt.id,
      });
      continue;
    }

    if (citation.libraryEntryId) {
      const authorizedEntry = await store.libraryService.assertCanAccessEntry(
        citation.libraryEntryId,
        actorUserId,
      );

      if (authorizedEntry.asset.id !== citation.paperAssetId) {
        throw new Error(
          `Document reference ${citation.paperAssetId} does not match library entry ${citation.libraryEntryId}.`,
        );
      }

      normalizedCitations.push({
        evidenceSpan: citation.evidenceSpan,
        paperAssetId: authorizedEntry.asset.id,
      });
      continue;
    }

    const authorizedView = await store.libraryService
      .assertCanAccessEntry(citation.paperAssetId, actorUserId)
      .catch((error) => {
        if (
          error instanceof Error &&
          new RegExp(`^Library entry ${citation.paperAssetId} does not exist\\.$`).test(
            error.message,
          )
        ) {
          return store.libraryService.assertCanAccessPaperAsset(
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

  return dedupeNormalizedCitations(normalizedCitations);
}

function formatEvidenceLocator(span: {
  endOffset: number;
  startOffset: number;
}): string {
  return `offsets ${span.startOffset}-${span.endOffset}`;
}

function appendCapturedInsightDocumentContent(
  existingDocumentContent: DocumentBlockDocument,
  input: {
    assetTitle?: string;
    capturedAt: string;
    insight: GeneratedInsightRecord;
    note?: string;
  },
): DocumentBlockDocument {
  return normalizeDocumentBlockDocument({
    blocks: [
      ...existingDocumentContent.blocks,
      {
        level: 2,
        text: 'Captured reader evidence',
        type: 'heading',
      },
      {
        text: [
          `Captured at: ${input.capturedAt}`,
          `Library entry: ${input.insight.libraryEntryId}`,
          '',
          'Interpretation:',
          input.insight.summary,
          '',
          'Source evidence:',
        ].join('\n'),
        type: 'paragraph',
      },
      ...input.insight.evidenceSpans.map((span, index) => ({
        capturedAt: input.capturedAt,
        evidenceSpan: span.quote,
        libraryEntryId: input.insight.libraryEntryId,
        locator: formatEvidenceLocator(span),
        note: index === 0 ? input.note : undefined,
        paperAssetId: span.paperAssetId,
        quote: span.quote,
        title: input.assetTitle,
        type: 'sourceExcerpt',
      })),
    ],
    schemaVersion: 1,
  });
}

function formatReaderExcerptNote(input: {
  captureNote?: string;
  excerptNote?: string;
}): string | undefined {
  const notes = [
    input.excerptNote ? `Reader note: ${input.excerptNote}` : undefined,
    input.captureNote ? `Capture note: ${input.captureNote}` : undefined,
  ].filter((note): note is string => Boolean(note));

  return notes.length ? notes.join('\n') : undefined;
}

function appendCapturedReaderExcerptDocumentContent(
  existingDocumentContent: DocumentBlockDocument,
  input: {
    assetTitle?: string;
    capturedAt: string;
    excerpt: ReaderExcerptRecord;
    note?: string;
  },
): DocumentBlockDocument {
  return normalizeDocumentBlockDocument({
    blocks: [
      ...existingDocumentContent.blocks,
      {
        level: 2,
        text: 'Captured reader excerpt',
        type: 'heading',
      },
      {
        text: [
          `Captured at: ${input.capturedAt}`,
          `Library entry: ${input.excerpt.libraryEntryId}`,
          '',
          'Source evidence:',
        ].join('\n'),
        type: 'paragraph',
      },
      {
        capturedAt: input.capturedAt,
        evidenceSpan: input.excerpt.quote,
        libraryEntryId: input.excerpt.libraryEntryId,
        locator: input.excerpt.locator ?? formatEvidenceLocator(input.excerpt),
        note: formatReaderExcerptNote({
          captureNote: input.note,
          excerptNote: input.excerpt.note,
        }),
        paperAssetId: input.excerpt.paperAssetId,
        quote: input.excerpt.quote,
        readerExcerptId: input.excerpt.id,
        title: input.assetTitle,
        type: 'sourceExcerpt',
      },
    ],
    schemaVersion: 1,
  });
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

function createCapturedReaderExcerptCitations(
  excerpt: ReaderExcerptRecord,
): Array<{
  evidenceSpan?: string;
  libraryEntryId?: string;
  paperAssetId: string;
  readerExcerptId?: string;
}> {
  return [
    {
      evidenceSpan: excerpt.quote,
      libraryEntryId: excerpt.libraryEntryId,
      paperAssetId: excerpt.paperAssetId,
      readerExcerptId: excerpt.id,
    },
  ];
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

function normalizeReaderExcerptCaptureSource(
  source: CaptureNotebookEvidenceRequest['source'],
): NotebookReaderExcerptCaptureSource {
  const candidate = source as unknown;

  if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) {
    throw new Error('Notebook evidence capture source must be a JSON object.');
  }

  const sourceRecord = candidate as Record<string, unknown>;

  if (sourceRecord.type !== 'readerExcerpt') {
    throw new Error('Notebook evidence capture source type must be readerExcerpt.');
  }

  if (
    typeof sourceRecord.readerExcerptId !== 'string' ||
    !sourceRecord.readerExcerptId.trim()
  ) {
    throw new Error('Notebook evidence capture source requires readerExcerptId.');
  }

  if (
    typeof sourceRecord.libraryEntryId !== 'undefined' &&
    typeof sourceRecord.libraryEntryId !== 'string'
  ) {
    throw new Error('Notebook evidence capture source libraryEntryId must be a string when provided.');
  }

  if (
    typeof sourceRecord.note !== 'undefined' &&
    typeof sourceRecord.note !== 'string'
  ) {
    throw new Error('Notebook evidence capture source note must be a string when provided.');
  }

  return {
    libraryEntryId: sourceRecord.libraryEntryId?.trim() || undefined,
    note: sourceRecord.note?.trim() || undefined,
    readerExcerptId: sourceRecord.readerExcerptId.trim(),
    type: 'readerExcerpt',
  };
}

function normalizeNotebookEvidenceCaptureSource(
  source: CaptureNotebookEvidenceRequest['source'],
): NotebookEvidenceCaptureSource {
  const candidate = source as unknown;

  if (!candidate || typeof candidate !== 'object' || Array.isArray(candidate)) {
    throw new Error('Notebook evidence capture source must be a JSON object.');
  }

  const sourceRecord = candidate as Record<string, unknown>;

  if (sourceRecord.type === 'generatedInsight') {
    return normalizeGeneratedInsightCaptureSource(source);
  }

  if (sourceRecord.type === 'readerExcerpt') {
    return normalizeReaderExcerptCaptureSource(source);
  }

  throw new Error('Notebook evidence capture source type must be generatedInsight or readerExcerpt.');
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

      const source = normalizeNotebookEvidenceCaptureSource(input.source);
      const existingTargetDocument = input.notebookDocumentId
        ? await requireOwnedDocument(
            store.notebookRepository,
            input.notebookDocumentId,
            actorUserId,
          )
        : null;

      if (source.type === 'readerExcerpt') {
        const readerExcerptSource = await store.readingService.getReaderExcerptSource({
          actorUserId,
          readerExcerptId: source.readerExcerptId,
        });

        if (
          source.libraryEntryId &&
          source.libraryEntryId !== readerExcerptSource.excerpt.libraryEntryId
        ) {
          throw new Error(
            `Reader excerpt ${source.readerExcerptId} does not match library entry ${source.libraryEntryId}.`,
          );
        }

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
        const existingDocumentContent = latestSnapshot
          ? normalizePersistedDocumentSnapshot(latestSnapshot.content)
          : createEmptyDocumentBlockDocument();
        const documentContent = appendCapturedReaderExcerptDocumentContent(
          existingDocumentContent,
          {
            assetTitle: readerExcerptSource.sourceEntry.asset.title,
            capturedAt,
            excerpt: readerExcerptSource.excerpt,
            note: source.note,
          },
        );
        const citations = await normalizeAuthorizedCitations(
          store,
          mergeCitationInputs(
            createCapturedReaderExcerptCitations(readerExcerptSource.excerpt),
            documentContent,
          ),
          actorUserId,
        );
        const snapshot = await store.notebookRepository.saveVersion({
          citations,
          content: serializeDocumentBlockSnapshotPayload(documentContent),
          documentId: targetDocument.id,
        });

        return {
          document: mapDocument(snapshot.document),
          snapshot: mapSnapshot(snapshot),
        };
      }

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
      const existingDocumentContent = latestSnapshot
        ? normalizePersistedDocumentSnapshot(latestSnapshot.content)
        : createEmptyDocumentBlockDocument();
      const documentContent = appendCapturedInsightDocumentContent(
        existingDocumentContent,
        {
          assetTitle: authorizedEntry.asset.title,
          capturedAt,
          insight,
          note: source.note,
        },
      );
      const citations = await normalizeAuthorizedCitations(
        store,
        mergeCitationInputs(createCapturedCitations(insight), documentContent),
        actorUserId,
      );
      const snapshot = await store.notebookRepository.saveVersion({
        citations,
        content: serializeDocumentBlockSnapshotPayload(documentContent),
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
      const documentContent = normalizeSaveDocumentContent(input);
      const citations = await normalizeAuthorizedCitations(
        store,
        mergeCitationInputs(input.citations, documentContent),
        actorUserId,
      );

      return mapSnapshot(
        await store.notebookRepository.saveVersion({
          citations,
          content: serializeDocumentBlockSnapshotPayload(documentContent),
          documentId: input.documentId,
        }),
      );
    },
  };
}
