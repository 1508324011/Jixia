import type { DocumentContentPayload } from './document-content';

/**
 * Shared, transport-safe vocabulary for Jixia-owned document version snapshots.
 *
 * These DTOs describe the stable public/server boundary shared by private
 * Notebook documents and project-scoped Project Docs. They intentionally carry
 * no ownership, authorization, persistence, editor-runtime, Prisma, browser, or
 * server implementation details. Domain-specific records keep those semantics.
 *
 * Future rich-text editors must adapt into and out of this app-owned snapshot
 * shape. Raw Lexical/Tiptap/Slate/ProseMirror runtime JSON, cursor state,
 * selection state, undo history, IME composition, focus state, and other
 * ephemeral editor internals are adapter-local details and must not become
 * Jixia's durable public/server contract. If Jixia later introduces structured
 * blocks, that schema must be explicit, versioned, and migrated by Jixia.
 */
export interface DocumentCitationRecordBase {
  createdAt: string;
  evidenceSpan?: string;
  id: string;
  paperAssetId: string;
}

export interface DocumentSnapshot<
  TDocument,
  TCitation extends DocumentCitationRecordBase,
> {
  capturedAt: string;
  citations: TCitation[];
  content: string;
  document: TDocument;
  documentContent?: DocumentContentPayload;
  versionId: string;
  versionNumber: number;
}

export const documentSnapshotContract = 'jixia-document-snapshot-contract';
