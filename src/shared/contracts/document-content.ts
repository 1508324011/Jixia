/**
 * Jixia-owned structured document content contract.
 *
 * This file is deliberately transport-safe. It contains no Prisma, server,
 * browser, DOM, or editor-framework imports. Rich editors must adapt into this
 * stable app-owned grammar instead of persisting their runtime JSON directly.
 */

export type DocumentBlockSchemaVersion = 1;

export type DocumentHeadingLevel = 1 | 2 | 3;

export interface DocumentBlockBase {
  /** Client-editing convenience only. Never use as authority. */
  id?: string;
}

export interface DocumentParagraphBlock extends DocumentBlockBase {
  text: string;
  type: 'paragraph';
}

export interface DocumentHeadingBlock extends DocumentBlockBase {
  level: DocumentHeadingLevel;
  text: string;
  type: 'heading';
}

export interface DocumentQuoteBlock extends DocumentBlockBase {
  attribution?: string;
  evidenceSpan?: string;
  libraryEntryId?: string;
  locator?: string;
  paperAssetId?: string;
  readerExcerptId?: string;
  text: string;
  type: 'quote';
}

export interface DocumentTodoBlock extends DocumentBlockBase {
  checked: boolean;
  text: string;
  type: 'todo';
}

export interface DocumentCitationBlock extends DocumentBlockBase {
  evidenceSpan?: string;
  label?: string;
  libraryEntryId?: string;
  locator?: string;
  paperAssetId: string;
  readerExcerptId?: string;
  type: 'citation';
}

export interface DocumentSourceExcerptBlock extends DocumentBlockBase {
  capturedAt?: string;
  evidenceSpan?: string;
  libraryEntryId?: string;
  locator?: string;
  note?: string;
  paperAssetId: string;
  quote: string;
  readerExcerptId?: string;
  title?: string;
  type: 'sourceExcerpt';
}

export interface DocumentPaperReferenceBlock extends DocumentBlockBase {
  libraryEntryId?: string;
  locator?: string;
  paperAssetId: string;
  title?: string;
  type: 'paperReference';
}

export interface DocumentAiSuggestionBlock extends DocumentBlockBase {
  evidenceSpan?: string;
  libraryEntryId?: string;
  locator?: string;
  paperAssetId?: string;
  rationale?: string;
  readerExcerptId?: string;
  status: 'proposed';
  targetBlockId?: string;
  text: string;
  type: 'aiSuggestion';
}

export type DocumentBlock =
  | DocumentAiSuggestionBlock
  | DocumentCitationBlock
  | DocumentHeadingBlock
  | DocumentPaperReferenceBlock
  | DocumentParagraphBlock
  | DocumentQuoteBlock
  | DocumentSourceExcerptBlock
  | DocumentTodoBlock;

export interface DocumentContentPayload {
  blocks: DocumentBlock[];
  schemaVersion: DocumentBlockSchemaVersion;
}

export type DocumentBlockDocument = DocumentContentPayload;

export interface DocumentBlockReference {
  evidenceSpan?: string;
  libraryEntryId?: string;
  locator?: string;
  paperAssetId: string;
  readerExcerptId?: string;
  sourceBlockId?: string;
  sourceType:
    | 'aiSuggestion'
    | 'citation'
    | 'paperReference'
    | 'quote'
    | 'sourceExcerpt';
}

export interface SerializedDocumentBlockSnapshotPayload {
  document: DocumentBlockDocument;
  format: typeof DOCUMENT_BLOCK_SNAPSHOT_FORMAT;
}

export const DOCUMENT_BLOCK_SCHEMA_VERSION = 1 as const;
export const DOCUMENT_BLOCK_SNAPSHOT_FORMAT = 'jixia-document-blocks-v1';
export const documentContentContract = 'jixia-document-content-contract';

const AUTHORITY_FIELD_NAMES = new Set([
  'actor',
  'actorId',
  'actorSpaceId',
  'actorUserId',
  'authorUserId',
  'createdBy',
  'createdByUserId',
  'owner',
  'ownerId',
  'project',
  'projectId',
  'requestedByUserId',
  'space',
  'scope',
  'scopeId',
  'scopeType',
  'spaceId',
  'startedByUserId',
  'userId',
  'visibility',
]);

function isRecord(value: unknown): value is Record<string, unknown> {
  return Boolean(value) && typeof value === 'object' && !Array.isArray(value);
}

function assertNoAuthorityFields(
  block: Record<string, unknown>,
  path: string,
): void {
  for (const key of Object.keys(block)) {
    if (AUTHORITY_FIELD_NAMES.has(key)) {
      throw new Error(
        `${path}.${key} is not accepted in Jixia document blocks.`,
      );
    }

    assertNoAuthorityFieldsInValue(block[key], `${path}.${key}`);
  }
}

function assertNoAuthorityFieldsInValue(value: unknown, path: string): void {
  if (Array.isArray(value)) {
    value.forEach((item, index) => {
      assertNoAuthorityFieldsInValue(item, `${path}[${index}]`);
    });
    return;
  }

  if (isRecord(value)) {
    assertNoAuthorityFields(value, path);
  }
}

function optionalString(
  value: unknown,
  path: string,
): string | undefined {
  if (typeof value === 'undefined') {
    return undefined;
  }

  if (typeof value !== 'string') {
    throw new Error(`${path} must be a string when provided.`);
  }

  return value;
}

function requiredString(value: unknown, path: string): string {
  if (typeof value !== 'string') {
    throw new Error(`${path} must be a string.`);
  }

  return value;
}

function nonEmptyString(value: unknown, path: string): string {
  const normalized = requiredString(value, path).trim();

  if (!normalized) {
    throw new Error(`${path} must not be blank.`);
  }

  return normalized;
}

function optionalBlockId(value: unknown, path: string): string | undefined {
  const id = optionalString(value, path)?.trim();

  return id || undefined;
}

function normalizeHeadingLevel(value: unknown, path: string): DocumentHeadingLevel {
  if (value !== 1 && value !== 2 && value !== 3) {
    throw new Error(`${path} must be 1, 2, or 3.`);
  }

  return value;
}

function normalizeBlock(block: unknown, index: number): DocumentBlock {
  const path = `documentContent.blocks[${index}]`;

  if (!isRecord(block)) {
    throw new Error(`${path} must be a JSON object.`);
  }

  assertNoAuthorityFields(block, path);

  const id = optionalBlockId(block.id, `${path}.id`);

  switch (block.type) {
    case 'paragraph':
      return {
        ...(id ? { id } : {}),
        text: requiredString(block.text, `${path}.text`),
        type: 'paragraph',
      };
    case 'heading':
      return {
        ...(id ? { id } : {}),
        level: normalizeHeadingLevel(block.level, `${path}.level`),
        text: requiredString(block.text, `${path}.text`),
        type: 'heading',
      };
    case 'quote': {
      const paperAssetId = optionalString(block.paperAssetId, `${path}.paperAssetId`)?.trim();
      const libraryEntryId = optionalString(block.libraryEntryId, `${path}.libraryEntryId`)?.trim();
      const readerExcerptId = optionalString(block.readerExcerptId, `${path}.readerExcerptId`)?.trim();

      if (libraryEntryId && !paperAssetId) {
        throw new Error(`${path}.paperAssetId is required when libraryEntryId is provided.`);
      }

      if (readerExcerptId && !paperAssetId) {
        throw new Error(`${path}.paperAssetId is required when readerExcerptId is provided.`);
      }

      return {
        ...(id ? { id } : {}),
        attribution: optionalString(block.attribution, `${path}.attribution`),
        evidenceSpan: optionalString(block.evidenceSpan, `${path}.evidenceSpan`),
        libraryEntryId: libraryEntryId || undefined,
        locator: optionalString(block.locator, `${path}.locator`),
        paperAssetId: paperAssetId || undefined,
        readerExcerptId: readerExcerptId || undefined,
        text: requiredString(block.text, `${path}.text`),
        type: 'quote',
      };
    }
    case 'todo':
      if (typeof block.checked !== 'boolean') {
        throw new Error(`${path}.checked must be a boolean.`);
      }

      return {
        ...(id ? { id } : {}),
        checked: block.checked,
        text: requiredString(block.text, `${path}.text`),
        type: 'todo',
      };
    case 'citation':
      return {
        ...(id ? { id } : {}),
        evidenceSpan: optionalString(block.evidenceSpan, `${path}.evidenceSpan`),
        label: optionalString(block.label, `${path}.label`),
        libraryEntryId: optionalString(block.libraryEntryId, `${path}.libraryEntryId`)?.trim() || undefined,
        locator: optionalString(block.locator, `${path}.locator`),
        paperAssetId: nonEmptyString(block.paperAssetId, `${path}.paperAssetId`),
        readerExcerptId: optionalString(block.readerExcerptId, `${path}.readerExcerptId`)?.trim() || undefined,
        type: 'citation',
      };
    case 'sourceExcerpt':
      return {
        ...(id ? { id } : {}),
        capturedAt: optionalString(block.capturedAt, `${path}.capturedAt`),
        evidenceSpan: optionalString(block.evidenceSpan, `${path}.evidenceSpan`),
        libraryEntryId: optionalString(block.libraryEntryId, `${path}.libraryEntryId`)?.trim() || undefined,
        locator: optionalString(block.locator, `${path}.locator`),
        note: optionalString(block.note, `${path}.note`),
        paperAssetId: nonEmptyString(block.paperAssetId, `${path}.paperAssetId`),
        quote: requiredString(block.quote, `${path}.quote`),
        readerExcerptId: optionalString(block.readerExcerptId, `${path}.readerExcerptId`)?.trim() || undefined,
        title: optionalString(block.title, `${path}.title`),
        type: 'sourceExcerpt',
      };
    case 'paperReference':
      return {
        ...(id ? { id } : {}),
        libraryEntryId: optionalString(block.libraryEntryId, `${path}.libraryEntryId`)?.trim() || undefined,
        locator: optionalString(block.locator, `${path}.locator`),
        paperAssetId: nonEmptyString(block.paperAssetId, `${path}.paperAssetId`),
        title: optionalString(block.title, `${path}.title`),
        type: 'paperReference',
      };
    case 'aiSuggestion': {
      const paperAssetId = optionalString(block.paperAssetId, `${path}.paperAssetId`)?.trim();
      const libraryEntryId = optionalString(block.libraryEntryId, `${path}.libraryEntryId`)?.trim();
      const readerExcerptId = optionalString(block.readerExcerptId, `${path}.readerExcerptId`)?.trim();

      if (libraryEntryId && !paperAssetId) {
        throw new Error(`${path}.paperAssetId is required when libraryEntryId is provided.`);
      }

      if (readerExcerptId && !paperAssetId) {
        throw new Error(`${path}.paperAssetId is required when readerExcerptId is provided.`);
      }

      if (block.status !== 'proposed') {
        throw new Error(`${path}.status must be proposed.`);
      }

      return {
        ...(id ? { id } : {}),
        evidenceSpan: optionalString(block.evidenceSpan, `${path}.evidenceSpan`),
        libraryEntryId: libraryEntryId || undefined,
        locator: optionalString(block.locator, `${path}.locator`),
        paperAssetId: paperAssetId || undefined,
        rationale: optionalString(block.rationale, `${path}.rationale`),
        readerExcerptId: readerExcerptId || undefined,
        status: 'proposed',
        targetBlockId: optionalString(block.targetBlockId, `${path}.targetBlockId`)?.trim() || undefined,
        text: requiredString(block.text, `${path}.text`),
        type: 'aiSuggestion',
      };
    }
    default:
      throw new Error(`${path}.type is not a supported Jixia document block type.`);
  }
}

export function createEmptyDocumentBlockDocument(): DocumentBlockDocument {
  return {
    blocks: [],
    schemaVersion: DOCUMENT_BLOCK_SCHEMA_VERSION,
  };
}

export function normalizeDocumentBlockDocument(
  value: unknown,
): DocumentBlockDocument {
  if (!isRecord(value)) {
    throw new Error('documentContent must be a JSON object.');
  }

  assertNoAuthorityFields(value, 'documentContent');

  if (value.schemaVersion !== DOCUMENT_BLOCK_SCHEMA_VERSION) {
    throw new Error('documentContent.schemaVersion must be 1.');
  }

  if (!Array.isArray(value.blocks)) {
    throw new Error('documentContent.blocks must be an array.');
  }

  return {
    blocks: value.blocks.map(normalizeBlock),
    schemaVersion: DOCUMENT_BLOCK_SCHEMA_VERSION,
  };
}

export function legacyTextToDocumentBlockDocument(
  content: string,
): DocumentBlockDocument {
  return content
    ? {
        blocks: [
          {
            text: content,
            type: 'paragraph',
          },
        ],
        schemaVersion: DOCUMENT_BLOCK_SCHEMA_VERSION,
      }
    : createEmptyDocumentBlockDocument();
}

function blockToLegacyText(block: DocumentBlock): string {
  switch (block.type) {
    case 'paragraph':
      return block.text;
    case 'heading':
      return `${'#'.repeat(block.level)} ${block.text}`;
    case 'quote': {
      const quote = block.text
        .split('\n')
        .map((line) => `> ${line}`)
        .join('\n');
      const details = [
        block.attribution ? `Attribution: ${block.attribution}` : undefined,
        block.locator ? `Locator: ${block.locator}` : undefined,
      ].filter((line): line is string => Boolean(line));

      return details.length ? `${quote}\n\n${details.join('\n')}` : quote;
    }
    case 'todo':
      return `- [${block.checked ? 'x' : ' '}] ${block.text}`;
    case 'citation': {
      const label = block.label ?? block.paperAssetId;
      const details = [block.locator, block.evidenceSpan]
        .filter((value): value is string => Boolean(value))
        .join(' — ');

      return details ? `[Citation: ${label} — ${details}]` : `[Citation: ${label}]`;
    }
    case 'sourceExcerpt': {
      const sourceLabel = block.title ?? block.paperAssetId;
      const sourceLine = block.locator
        ? `Source: ${sourceLabel} (${block.locator})`
        : `Source: ${sourceLabel}`;
      const lines = [
        ...block.quote.split('\n').map((line) => `> ${line}`),
        '',
        sourceLine,
      ];

      if (block.note?.trim()) {
        lines.push(`Capture note: ${block.note.trim()}`);
      }

      return lines.join('\n');
    }
    case 'paperReference': {
      const label = block.title ?? block.paperAssetId;

      return block.locator
        ? `[Paper: ${label} — ${block.locator}]`
        : `[Paper: ${label}]`;
    }
    case 'aiSuggestion':
      return block.rationale
        ? `AI suggestion: ${block.text}\nRationale: ${block.rationale}`
        : `AI suggestion: ${block.text}`;
  }
}

export function documentBlockDocumentToLegacyText(
  documentContent: DocumentBlockDocument,
): string {
  return documentContent.blocks.map(blockToLegacyText).join('\n\n');
}

export function extractDocumentBlockReferences(
  documentContent: DocumentBlockDocument,
): DocumentBlockReference[] {
  const references: DocumentBlockReference[] = [];

  for (const block of documentContent.blocks) {
    switch (block.type) {
      case 'citation':
        references.push({
          evidenceSpan: block.evidenceSpan,
          libraryEntryId: block.libraryEntryId,
          ...(block.locator ? { locator: block.locator } : {}),
          paperAssetId: block.paperAssetId,
          readerExcerptId: block.readerExcerptId,
          sourceBlockId: block.id,
          sourceType: 'citation',
        });
        break;
      case 'sourceExcerpt':
        references.push({
          evidenceSpan: block.evidenceSpan ?? block.quote,
          libraryEntryId: block.libraryEntryId,
          ...(block.locator ? { locator: block.locator } : {}),
          paperAssetId: block.paperAssetId,
          readerExcerptId: block.readerExcerptId,
          sourceBlockId: block.id,
          sourceType: 'sourceExcerpt',
        });
        break;
      case 'paperReference':
        references.push({
          libraryEntryId: block.libraryEntryId,
          ...(block.locator ? { locator: block.locator } : {}),
          paperAssetId: block.paperAssetId,
          sourceBlockId: block.id,
          sourceType: 'paperReference',
        });
        break;
      case 'quote':
        if (block.paperAssetId) {
          references.push({
            evidenceSpan: block.evidenceSpan ?? block.text,
            libraryEntryId: block.libraryEntryId,
            ...(block.locator ? { locator: block.locator } : {}),
            paperAssetId: block.paperAssetId,
            readerExcerptId: block.readerExcerptId,
            sourceBlockId: block.id,
            sourceType: 'quote',
          });
        }
        break;
      case 'aiSuggestion':
        if (block.paperAssetId) {
          references.push({
            evidenceSpan: block.evidenceSpan,
            libraryEntryId: block.libraryEntryId,
            ...(block.locator ? { locator: block.locator } : {}),
            paperAssetId: block.paperAssetId,
            readerExcerptId: block.readerExcerptId,
            sourceBlockId: block.id,
            sourceType: 'aiSuggestion',
          });
        }
        break;
      case 'heading':
      case 'paragraph':
      case 'todo':
        break;
    }
  }

  return references;
}

export function serializeDocumentBlockSnapshotPayload(
  documentContent: DocumentBlockDocument,
): string {
  const payload: SerializedDocumentBlockSnapshotPayload = {
    document: normalizeDocumentBlockDocument(documentContent),
    format: DOCUMENT_BLOCK_SNAPSHOT_FORMAT,
  };

  return JSON.stringify(payload);
}

export function normalizePersistedDocumentSnapshot(
  snapshot: string,
): DocumentBlockDocument {
  let parsed: unknown;

  try {
    parsed = JSON.parse(snapshot) as unknown;
  } catch {
    // Historical rows are plain text and are intentionally normalized below.
    return legacyTextToDocumentBlockDocument(snapshot);
  }

  if (
    isRecord(parsed) &&
    parsed.format === DOCUMENT_BLOCK_SNAPSHOT_FORMAT &&
    'document' in parsed
  ) {
    try {
      return normalizeDocumentBlockDocument(parsed.document);
    } catch {
      return legacyTextToDocumentBlockDocument(snapshot);
    }
  }

  return legacyTextToDocumentBlockDocument(snapshot);
}
