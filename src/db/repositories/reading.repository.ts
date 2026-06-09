import {
  type Conversation,
  type GeneratedInsight,
  type GeneratedInsightEvidenceSpan,
  type Note,
  type Prisma,
  type ProjectReadingComment,
  type ReaderExcerpt,
  type ReadingState,
  type SourceTextArtifact,
} from '@prisma/client';

import type { JixiaPrismaClient } from '../client';
import { initializeLibraryPersistence } from './library.repository';

export type PersistedNoteVisibility = 'private' | 'space_shared';

export interface PersistedNoteRecord {
  authorUserId: string;
  body: string;
  createdAt: string;
  id: string;
  kind: 'private_note';
  libraryEntryId: string;
  /** @deprecated Compatibility mirror only; never use for authority. */
  visibility: PersistedNoteVisibility;
}

export interface PersistedProjectReadingCommentRecord {
  authorUserId: string;
  body: string;
  createdAt: string;
  id: string;
  kind: 'project_comment';
  libraryEntryId: string;
  projectId: string;
}

export interface PersistedConversationRecord {
  createdAt: string;
  id: string;
  libraryEntryId: string;
  startedByUserId: string;
  title: string;
}

export interface PersistedEvidenceSpanRecord {
  endOffset: number;
  paperAssetId: string;
  quote: string;
  startOffset: number;
}

export interface PersistedGeneratedInsightRecord {
  conversationId: string;
  createdAt: string;
  evidenceSpans: PersistedEvidenceSpanRecord[];
  id: string;
  libraryEntryId: string;
  summary: string;
}

export interface PersistedReaderExcerptRecord {
  createdAt: string;
  createdByUserId: string;
  endOffset: number;
  id: string;
  libraryEntryId: string;
  locator?: string;
  note?: string;
  paperAssetId: string;
  quote: string;
  startOffset: number;
  updatedAt: string;
}

export interface PersistedReadingStateRecord {
  createdAt: string;
  lastReadAt: string;
  libraryEntryId: string;
  progressPercent: number;
  updatedAt: string;
  userId: string;
}

export type PersistedSourceTextArtifactKind = 'extracted_text' | 'ocr_text' | 'page_map';

export type PersistedSourceTextAvailabilityState =
  | 'available'
  | 'pdf_unavailable'
  | 'text_unavailable'
  | 'ocr_required'
  | 'processing'
  | 'failed'
  | 'archived';

export interface PersistedSourceTextArtifactRecord {
  availabilityState: PersistedSourceTextAvailabilityState;
  characterCount?: number;
  createdAt: string;
  id: string;
  kind: PersistedSourceTextArtifactKind;
  language?: string;
  pageCount?: number;
  paperAssetId: string;
  statusDetail?: string;
  textFormat?: string;
  updatedAt: string;
}

export interface CreatePersistedNoteParams {
  authorUserId: string;
  body: string;
  createdAt?: string;
  id?: string;
  libraryEntryId: string;
  /** @deprecated Compatibility mirror only. New writes default to private. */
  visibility: PersistedNoteVisibility;
}

export interface CreatePersistedProjectReadingCommentParams {
  authorUserId: string;
  body: string;
  createdAt?: string;
  id?: string;
  libraryEntryId: string;
  projectId: string;
}

export interface CreatePersistedConversationParams {
  createdAt?: string;
  id?: string;
  libraryEntryId: string;
  startedByUserId: string;
  title: string;
}

export interface SavePersistedGeneratedInsightParams {
  conversationId: string;
  createdAt?: string;
  createdByUserId: string;
  evidenceSpans: Array<
    Omit<PersistedEvidenceSpanRecord, 'paperAssetId'> & {
      id?: string;
      orderIndex: number;
      paperAssetId: string;
    }
  >;
  id?: string;
  libraryEntryId: string;
  summary: string;
}

export interface CreatePersistedReaderExcerptParams {
  createdAt?: string;
  createdByUserId: string;
  endOffset: number;
  id?: string;
  libraryEntryId: string;
  locator?: string;
  note?: string;
  paperAssetId: string;
  quote: string;
  startOffset: number;
}

export interface CreatePersistedSourceTextArtifactParams {
  artifactRef?: string;
  availabilityState: PersistedSourceTextAvailabilityState;
  characterCount?: number;
  createdAt?: string;
  id?: string;
  kind: PersistedSourceTextArtifactKind;
  language?: string;
  pageCount?: number;
  paperAssetId: string;
  statusDetail?: string;
  textFormat?: string;
}

export interface TouchReadingStateParams {
  lastReadAt?: string;
  libraryEntryId: string;
  progressPercent?: number;
  userId: string;
}

export interface ListEntryNotesQuery {
  actorUserId: string;
  libraryEntryId: string;
}

export interface ListProjectCommentsQuery {
  libraryEntryId: string;
  projectId: string;
}

export interface ListSourceTextArtifactsQuery {
  kind?: PersistedSourceTextArtifactKind;
  paperAssetId: string;
}

export interface ReadingRepository {
  createConversation(
    input: CreatePersistedConversationParams,
  ): Promise<PersistedConversationRecord>;
  createNote(input: CreatePersistedNoteParams): Promise<PersistedNoteRecord>;
  createPrivateNote(input: Omit<CreatePersistedNoteParams, 'visibility'>): Promise<PersistedNoteRecord>;
  createProjectComment(
    input: CreatePersistedProjectReadingCommentParams,
  ): Promise<PersistedProjectReadingCommentRecord>;
  createReaderExcerpt(
    input: CreatePersistedReaderExcerptParams,
  ): Promise<PersistedReaderExcerptRecord>;
  createSourceTextArtifact(
    input: CreatePersistedSourceTextArtifactParams,
  ): Promise<PersistedSourceTextArtifactRecord>;
  getGeneratedInsight(
    query: {
      generatedInsightId: string;
      libraryEntryId: string;
    },
  ): Promise<PersistedGeneratedInsightRecord | null>;
  getReadingState(
    libraryEntryId: string,
    userId: string,
  ): Promise<PersistedReadingStateRecord | null>;
  getReaderExcerpt(
    excerptId: string,
  ): Promise<PersistedReaderExcerptRecord | null>;
  getSourceTextArtifact(
    artifactId: string,
  ): Promise<PersistedSourceTextArtifactRecord | null>;
  listGeneratedInsightsForEntry(
    libraryEntryId: string,
  ): Promise<PersistedGeneratedInsightRecord[]>;
  listReaderExcerptsForEntry(
    libraryEntryId: string,
  ): Promise<PersistedReaderExcerptRecord[]>;
  listNotesForEntry(input: ListEntryNotesQuery): Promise<PersistedNoteRecord[]>;
  listPrivateNotesForEntry(input: ListEntryNotesQuery): Promise<PersistedNoteRecord[]>;
  listProjectCommentsForEntry(
    input: ListProjectCommentsQuery,
  ): Promise<PersistedProjectReadingCommentRecord[]>;
  listSourceTextArtifactsForPaperAsset(
    input: ListSourceTextArtifactsQuery,
  ): Promise<PersistedSourceTextArtifactRecord[]>;
  saveGeneratedInsight(
    input: SavePersistedGeneratedInsightParams,
  ): Promise<PersistedGeneratedInsightRecord>;
  touchReadingState(
    input: TouchReadingStateParams,
  ): Promise<PersistedReadingStateRecord>;
}

type TransactionClient = Prisma.TransactionClient;

type ReadingClient = JixiaPrismaClient | TransactionClient;

type GeneratedInsightWithEvidence = GeneratedInsight & {
  evidenceSpans: GeneratedInsightEvidenceSpan[];
};

const readingPersistenceInitializers = new WeakMap<
  JixiaPrismaClient,
  Promise<void>
>();

interface SqliteTableColumnRow {
  name: string;
}

interface SqliteTableSqlRow {
  sql: string | null;
}

async function readTableColumns(
  prisma: JixiaPrismaClient,
  tableName: string,
): Promise<Set<string>> {
  const columns = await prisma.$queryRawUnsafe<SqliteTableColumnRow[]>(
    `PRAGMA table_info("${tableName}")`,
  );

  return new Set(columns.map((column) => column.name));
}

async function ensureColumnIfMissing(
  prisma: JixiaPrismaClient,
  tableName: string,
  columnName: string,
  columnDefinition: string,
): Promise<void> {
  const availableColumns = await readTableColumns(prisma, tableName);

  if (!availableColumns.has(columnName)) {
    await prisma.$executeRawUnsafe(
      `ALTER TABLE "${tableName}" ADD COLUMN "${columnName}" ${columnDefinition}`,
    );
  }
}

async function readReaderAnnotationCreateTableSql(
  prisma: JixiaPrismaClient,
): Promise<string> {
  const rows = await prisma.$queryRawUnsafe<SqliteTableSqlRow[]>(
    `SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'ReaderAnnotation'`,
  );

  return rows[0]?.sql ?? '';
}

async function hasReaderAnnotationPrivacyConstraints(
  prisma: JixiaPrismaClient,
): Promise<boolean> {
  const createTableSql = await readReaderAnnotationCreateTableSql(prisma);

  return (
    createTableSql.includes('ReaderAnnotation_project_visibility_check') &&
    createTableSql.includes('ReaderAnnotation_project_note_check')
  );
}

async function rebuildReaderAnnotationPrivacyConstraints(
  prisma: JixiaPrismaClient,
): Promise<void> {
  if (await hasReaderAnnotationPrivacyConstraints(prisma)) {
    return;
  }

  await prisma.$executeRawUnsafe('PRAGMA foreign_keys = OFF');
  let transactionStarted = false;

  try {
    await prisma.$executeRawUnsafe('BEGIN IMMEDIATE');
    transactionStarted = true;

    await prisma.$executeRawUnsafe('DROP TABLE IF EXISTS "ReaderAnnotation__rebuild"');
    await prisma.$executeRawUnsafe(`
      CREATE TABLE "ReaderAnnotation__rebuild" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "libraryEntryId" TEXT NOT NULL,
        "paperAssetId" TEXT NOT NULL,
        "sourceContextType" TEXT NOT NULL,
        "sourceContextId" TEXT NOT NULL,
        "sourceContextVersionId" TEXT,
        "createdByUserId" TEXT NOT NULL,
        "visibility" TEXT NOT NULL DEFAULT 'private',
        "projectId" TEXT,
        "originalAnnotationId" TEXT,
        "sourceTextArtifactId" TEXT,
        "quote" TEXT NOT NULL,
        "selectorJson" TEXT NOT NULL,
        "locatorJson" TEXT,
        "note" TEXT,
        "lifecycleStatus" TEXT NOT NULL DEFAULT 'active',
        "archivedAt" DATETIME,
        "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "ReaderAnnotation_libraryEntryId_fkey" FOREIGN KEY ("libraryEntryId") REFERENCES "LibraryEntry" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
        CONSTRAINT "ReaderAnnotation_paperAssetId_fkey" FOREIGN KEY ("paperAssetId") REFERENCES "PaperAsset" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
        CONSTRAINT "ReaderAnnotation_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
        CONSTRAINT "ReaderAnnotation_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
        CONSTRAINT "ReaderAnnotation_originalAnnotationId_fkey" FOREIGN KEY ("originalAnnotationId") REFERENCES "ReaderAnnotation" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
        CONSTRAINT "ReaderAnnotation_sourceTextArtifactId_fkey" FOREIGN KEY ("sourceTextArtifactId") REFERENCES "SourceTextArtifact" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
        CONSTRAINT "ReaderAnnotation_project_visibility_check" CHECK (("visibility" = 'private' AND "projectId" IS NULL) OR ("visibility" = 'project' AND "projectId" IS NOT NULL)),
        CONSTRAINT "ReaderAnnotation_project_note_check" CHECK ("visibility" != 'project' OR "note" IS NULL)
      )
    `);
    await prisma.$executeRawUnsafe(`
      INSERT INTO "ReaderAnnotation__rebuild" (
        "id",
        "libraryEntryId",
        "paperAssetId",
        "sourceContextType",
        "sourceContextId",
        "sourceContextVersionId",
        "createdByUserId",
        "visibility",
        "projectId",
        "originalAnnotationId",
        "sourceTextArtifactId",
        "quote",
        "selectorJson",
        "locatorJson",
        "note",
        "lifecycleStatus",
        "archivedAt",
        "createdAt",
        "updatedAt"
      )
      SELECT
        "ReaderAnnotation"."id",
        "ReaderAnnotation"."libraryEntryId",
        "ReaderAnnotation"."paperAssetId",
        "ReaderAnnotation"."sourceContextType",
        "ReaderAnnotation"."sourceContextId",
        "ReaderAnnotation"."sourceContextVersionId",
        "ReaderAnnotation"."createdByUserId",
        CASE
          WHEN "ReaderAnnotation"."visibility" = 'project'
            AND "ReaderAnnotation"."projectId" IS NOT NULL
          THEN 'project'
          ELSE 'private'
        END AS "visibility",
        CASE
          WHEN "ReaderAnnotation"."visibility" = 'project'
            AND "ReaderAnnotation"."projectId" IS NOT NULL
          THEN "ReaderAnnotation"."projectId"
          ELSE NULL
        END AS "projectId",
        CASE
          WHEN "ReaderAnnotation"."visibility" = 'project'
            AND "ReaderAnnotation"."projectId" IS NOT NULL
          THEN "ReaderAnnotation"."originalAnnotationId"
          ELSE NULL
        END AS "originalAnnotationId",
        "ReaderAnnotation"."sourceTextArtifactId",
        "ReaderAnnotation"."quote",
        "ReaderAnnotation"."selectorJson",
        "ReaderAnnotation"."locatorJson",
        CASE
          WHEN "ReaderAnnotation"."visibility" = 'project'
            AND "ReaderAnnotation"."projectId" IS NOT NULL
          THEN NULL
          ELSE "ReaderAnnotation"."note"
        END AS "note",
        COALESCE(NULLIF("ReaderAnnotation"."lifecycleStatus", ''), 'active') AS "lifecycleStatus",
        "ReaderAnnotation"."archivedAt",
        "ReaderAnnotation"."createdAt",
        "ReaderAnnotation"."updatedAt"
      FROM "ReaderAnnotation"
    `);
    await prisma.$executeRawUnsafe('DROP TABLE "ReaderAnnotation"');
    await prisma.$executeRawUnsafe(
      'ALTER TABLE "ReaderAnnotation__rebuild" RENAME TO "ReaderAnnotation"',
    );
    await prisma.$executeRawUnsafe('COMMIT');
    transactionStarted = false;
  } catch (error) {
    if (transactionStarted) {
      await prisma.$executeRawUnsafe('ROLLBACK').catch(() => undefined);
    }

    throw error;
  } finally {
    await prisma.$executeRawUnsafe('PRAGMA foreign_keys = ON');
  }
}

function toIsoString(value: Date): string {
  return value.toISOString();
}

function optionalDate(value: string | undefined): Date | undefined {
  return value ? new Date(value) : undefined;
}

function mapNote(note: Note): PersistedNoteRecord {
  return {
    authorUserId: note.authorUserId,
    body: note.body,
    createdAt: toIsoString(note.createdAt),
    id: note.id,
    kind: 'private_note',
    libraryEntryId: note.libraryEntryId,
    visibility: note.visibility,
  };
}

function mapProjectReadingComment(
  comment: ProjectReadingComment,
): PersistedProjectReadingCommentRecord {
  return {
    authorUserId: comment.authorUserId,
    body: comment.body,
    createdAt: toIsoString(comment.createdAt),
    id: comment.id,
    kind: 'project_comment',
    libraryEntryId: comment.libraryEntryId,
    projectId: comment.projectId,
  };
}

function mapConversation(
  conversation: Conversation,
): PersistedConversationRecord {
  return {
    createdAt: toIsoString(conversation.createdAt),
    id: conversation.id,
    libraryEntryId: conversation.libraryEntryId,
    startedByUserId: conversation.userId,
    title: conversation.title,
  };
}

function mapGeneratedInsight(
  insight: GeneratedInsightWithEvidence,
): PersistedGeneratedInsightRecord {
  return {
    conversationId: insight.conversationId,
    createdAt: toIsoString(insight.createdAt),
    evidenceSpans: [...insight.evidenceSpans]
      .sort((left, right) => left.orderIndex - right.orderIndex)
      .map((span) => ({
        endOffset: span.endOffset,
        paperAssetId: span.paperAssetId,
        quote: span.quote,
        startOffset: span.startOffset,
      })),
    id: insight.id,
    libraryEntryId: insight.libraryEntryId,
    summary: insight.summary,
  };
}

function mapReaderExcerpt(excerpt: ReaderExcerpt): PersistedReaderExcerptRecord {
  return {
    createdAt: toIsoString(excerpt.createdAt),
    createdByUserId: excerpt.createdByUserId,
    endOffset: excerpt.endOffset,
    id: excerpt.id,
    libraryEntryId: excerpt.libraryEntryId,
    locator: excerpt.locator ?? undefined,
    note: excerpt.note ?? undefined,
    paperAssetId: excerpt.paperAssetId,
    quote: excerpt.quote,
    startOffset: excerpt.startOffset,
    updatedAt: toIsoString(excerpt.updatedAt),
  };
}

function mapReadingState(
  readingState: ReadingState,
): PersistedReadingStateRecord {
  return {
    createdAt: toIsoString(readingState.createdAt),
    lastReadAt: toIsoString(readingState.lastOpenedAt ?? readingState.updatedAt),
    libraryEntryId: readingState.libraryEntryId,
    progressPercent: readingState.progress,
    updatedAt: toIsoString(readingState.updatedAt),
    userId: readingState.userId,
  };
}

function mapSourceTextArtifact(
  artifact: SourceTextArtifact,
): PersistedSourceTextArtifactRecord {
  return {
    availabilityState: artifact.availabilityState,
    characterCount: artifact.characterCount ?? undefined,
    createdAt: toIsoString(artifact.createdAt),
    id: artifact.id,
    kind: artifact.kind,
    language: artifact.language ?? undefined,
    pageCount: artifact.pageCount ?? undefined,
    paperAssetId: artifact.paperAssetId,
    statusDetail: artifact.statusDetail ?? undefined,
    textFormat: artifact.textFormat ?? undefined,
    updatedAt: toIsoString(artifact.updatedAt),
  };
}

async function mirrorLegacySharedNoteAsProjectComment(
  prisma: ReadingClient,
  note: Note,
): Promise<void> {
  if (note.visibility !== 'space_shared') {
    return;
  }

  const libraryEntry = await prisma.libraryEntry.findUnique({
    select: {
      scopeId: true,
      scopeType: true,
    },
    where: { id: note.libraryEntryId },
  });

  if (libraryEntry?.scopeType !== 'project') {
    return;
  }

  await prisma.projectReadingComment.upsert({
    create: {
      authorUserId: note.authorUserId,
      body: note.body,
      createdAt: note.createdAt,
      id: note.id,
      libraryEntryId: note.libraryEntryId,
      projectId: libraryEntry.scopeId,
      updatedAt: note.updatedAt,
    },
    update: {
      authorUserId: note.authorUserId,
      body: note.body,
      createdAt: note.createdAt,
      libraryEntryId: note.libraryEntryId,
      projectId: libraryEntry.scopeId,
      updatedAt: note.updatedAt,
    },
    where: { id: note.id },
  });
}

async function ensureUser(prisma: ReadingClient, userId: string): Promise<void> {
  await prisma.user.upsert({
    create: {
      displayName: userId,
      email: `${userId}@jixia.local`,
      id: userId,
    },
    update: { updatedAt: new Date() },
    where: { id: userId },
  });
}

async function initializeReadingPersistenceTables(
  prisma: JixiaPrismaClient,
): Promise<void> {
  await initializeLibraryPersistence(prisma);
  await prisma.$executeRawUnsafe('PRAGMA foreign_keys = ON');
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "SourceTextArtifact" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "paperAssetId" TEXT NOT NULL,
      "kind" TEXT NOT NULL,
      "availabilityState" TEXT NOT NULL,
      "artifactRef" TEXT,
      "textFormat" TEXT,
      "pageCount" INTEGER,
      "characterCount" INTEGER,
      "language" TEXT,
      "statusDetail" TEXT,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "SourceTextArtifact_paperAssetId_fkey" FOREIGN KEY ("paperAssetId") REFERENCES "PaperAsset" ("id") ON DELETE CASCADE ON UPDATE CASCADE
    )
  `);
  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "SourceTextArtifact_paperAssetId_kind_idx" ON "SourceTextArtifact"("paperAssetId", "kind")
  `);
  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "SourceTextArtifact_availabilityState_updatedAt_idx" ON "SourceTextArtifact"("availabilityState", "updatedAt")
  `);
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "Note" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "libraryEntryId" TEXT NOT NULL,
      "authorUserId" TEXT NOT NULL,
      "visibility" TEXT NOT NULL,
      "body" TEXT NOT NULL,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "Note_libraryEntryId_fkey" FOREIGN KEY ("libraryEntryId") REFERENCES "LibraryEntry" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
      CONSTRAINT "Note_authorUserId_fkey" FOREIGN KEY ("authorUserId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
    )
  `);
  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "Note_libraryEntryId_createdAt_idx" ON "Note"("libraryEntryId", "createdAt")
  `);
  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "Note_libraryEntryId_authorUserId_idx" ON "Note"("libraryEntryId", "authorUserId")
  `);
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "ProjectReadingComment" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "libraryEntryId" TEXT NOT NULL,
      "projectId" TEXT NOT NULL,
      "authorUserId" TEXT NOT NULL,
      "body" TEXT NOT NULL,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "ProjectReadingComment_libraryEntryId_fkey" FOREIGN KEY ("libraryEntryId") REFERENCES "LibraryEntry" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
      CONSTRAINT "ProjectReadingComment_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
      CONSTRAINT "ProjectReadingComment_authorUserId_fkey" FOREIGN KEY ("authorUserId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
    )
  `);
  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "ProjectReadingComment_libraryEntryId_projectId_idx" ON "ProjectReadingComment"("libraryEntryId", "projectId")
  `);
  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "ProjectReadingComment_projectId_createdAt_idx" ON "ProjectReadingComment"("projectId", "createdAt")
  `);
  await prisma.$executeRawUnsafe(`
    INSERT OR IGNORE INTO "ProjectReadingComment" (
      "id",
      "libraryEntryId",
      "projectId",
      "authorUserId",
      "body",
      "createdAt",
      "updatedAt"
    )
    SELECT
      'project-comment-' || "Note"."id",
      "Note"."libraryEntryId",
      "LibraryEntry"."scopeId",
      "Note"."authorUserId",
      "Note"."body",
      "Note"."createdAt",
      "Note"."updatedAt"
    FROM "Note"
    JOIN "LibraryEntry" ON "LibraryEntry"."id" = "Note"."libraryEntryId"
    WHERE "Note"."visibility" = 'space_shared'
      AND "LibraryEntry"."scopeType" = 'project'
  `);
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "ReadingState" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "libraryEntryId" TEXT NOT NULL,
      "userId" TEXT NOT NULL,
      "lastOpenedAt" DATETIME,
      "progress" REAL NOT NULL DEFAULT 0,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "ReadingState_libraryEntryId_fkey" FOREIGN KEY ("libraryEntryId") REFERENCES "LibraryEntry" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
      CONSTRAINT "ReadingState_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
    )
  `);
  await prisma.$executeRawUnsafe(`
    CREATE UNIQUE INDEX IF NOT EXISTS "ReadingState_libraryEntryId_userId_key" ON "ReadingState"("libraryEntryId", "userId")
  `);
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "Conversation" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "libraryEntryId" TEXT NOT NULL,
      "userId" TEXT NOT NULL,
      "title" TEXT NOT NULL,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "Conversation_libraryEntryId_fkey" FOREIGN KEY ("libraryEntryId") REFERENCES "LibraryEntry" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
      CONSTRAINT "Conversation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
    )
  `);
  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "Conversation_libraryEntryId_createdAt_idx" ON "Conversation"("libraryEntryId", "createdAt")
  `);
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "GeneratedInsight" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "libraryEntryId" TEXT NOT NULL,
      "conversationId" TEXT NOT NULL,
      "createdByUserId" TEXT NOT NULL,
      "summary" TEXT NOT NULL,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "GeneratedInsight_libraryEntryId_fkey" FOREIGN KEY ("libraryEntryId") REFERENCES "LibraryEntry" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
      CONSTRAINT "GeneratedInsight_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
      CONSTRAINT "GeneratedInsight_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
    )
  `);
  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "GeneratedInsight_libraryEntryId_idx" ON "GeneratedInsight"("libraryEntryId")
  `);
  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "GeneratedInsight_conversationId_idx" ON "GeneratedInsight"("conversationId")
  `);
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "GeneratedInsightEvidenceSpan" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "generatedInsightId" TEXT NOT NULL,
      "paperAssetId" TEXT NOT NULL,
      "quote" TEXT NOT NULL,
      "startOffset" INTEGER NOT NULL,
      "endOffset" INTEGER NOT NULL,
      "orderIndex" INTEGER NOT NULL,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "GeneratedInsightEvidenceSpan_generatedInsightId_fkey" FOREIGN KEY ("generatedInsightId") REFERENCES "GeneratedInsight" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
      CONSTRAINT "GeneratedInsightEvidenceSpan_paperAssetId_fkey" FOREIGN KEY ("paperAssetId") REFERENCES "PaperAsset" ("id") ON DELETE CASCADE ON UPDATE CASCADE
    )
  `);
  await prisma.$executeRawUnsafe(`
    CREATE UNIQUE INDEX IF NOT EXISTS "GeneratedInsightEvidenceSpan_generatedInsightId_orderIndex_key" ON "GeneratedInsightEvidenceSpan"("generatedInsightId", "orderIndex")
  `);
  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "GeneratedInsightEvidenceSpan_paperAssetId_idx" ON "GeneratedInsightEvidenceSpan"("paperAssetId")
  `);
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "ReaderExcerpt" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "libraryEntryId" TEXT NOT NULL,
      "paperAssetId" TEXT NOT NULL,
      "createdByUserId" TEXT NOT NULL,
      "quote" TEXT NOT NULL,
      "startOffset" INTEGER NOT NULL,
      "endOffset" INTEGER NOT NULL,
      "locator" TEXT,
      "note" TEXT,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "ReaderExcerpt_libraryEntryId_fkey" FOREIGN KEY ("libraryEntryId") REFERENCES "LibraryEntry" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
      CONSTRAINT "ReaderExcerpt_paperAssetId_fkey" FOREIGN KEY ("paperAssetId") REFERENCES "PaperAsset" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
      CONSTRAINT "ReaderExcerpt_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
    )
  `);
  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "ReaderExcerpt_libraryEntryId_createdAt_idx" ON "ReaderExcerpt"("libraryEntryId", "createdAt")
  `);
  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "ReaderExcerpt_paperAssetId_idx" ON "ReaderExcerpt"("paperAssetId")
  `);
  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "ReaderExcerpt_createdByUserId_idx" ON "ReaderExcerpt"("createdByUserId")
  `);
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "ReaderAnnotation" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "libraryEntryId" TEXT NOT NULL,
      "paperAssetId" TEXT NOT NULL,
      "sourceContextType" TEXT NOT NULL,
      "sourceContextId" TEXT NOT NULL,
      "sourceContextVersionId" TEXT,
      "createdByUserId" TEXT NOT NULL,
      "visibility" TEXT NOT NULL DEFAULT 'private',
      "projectId" TEXT,
      "originalAnnotationId" TEXT,
      "sourceTextArtifactId" TEXT,
      "quote" TEXT NOT NULL,
      "selectorJson" TEXT NOT NULL,
      "locatorJson" TEXT,
      "note" TEXT,
      "lifecycleStatus" TEXT NOT NULL DEFAULT 'active',
      "archivedAt" DATETIME,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "ReaderAnnotation_libraryEntryId_fkey" FOREIGN KEY ("libraryEntryId") REFERENCES "LibraryEntry" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
      CONSTRAINT "ReaderAnnotation_paperAssetId_fkey" FOREIGN KEY ("paperAssetId") REFERENCES "PaperAsset" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
      CONSTRAINT "ReaderAnnotation_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
      CONSTRAINT "ReaderAnnotation_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
      CONSTRAINT "ReaderAnnotation_originalAnnotationId_fkey" FOREIGN KEY ("originalAnnotationId") REFERENCES "ReaderAnnotation" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
      CONSTRAINT "ReaderAnnotation_sourceTextArtifactId_fkey" FOREIGN KEY ("sourceTextArtifactId") REFERENCES "SourceTextArtifact" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
      CONSTRAINT "ReaderAnnotation_project_visibility_check" CHECK (("visibility" = 'private' AND "projectId" IS NULL) OR ("visibility" = 'project' AND "projectId" IS NOT NULL)),
      CONSTRAINT "ReaderAnnotation_project_note_check" CHECK ("visibility" != 'project' OR "note" IS NULL)
    )
  `);
  await ensureColumnIfMissing(
    prisma,
    'ReaderAnnotation',
    'lifecycleStatus',
    "TEXT NOT NULL DEFAULT 'active'",
  );
  await ensureColumnIfMissing(
    prisma,
    'ReaderAnnotation',
    'archivedAt',
    'DATETIME',
  );
  await rebuildReaderAnnotationPrivacyConstraints(prisma);
  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "ReaderAnnotation_libraryEntryId_createdByUserId_createdAt_idx" ON "ReaderAnnotation"("libraryEntryId", "createdByUserId", "createdAt")
  `);
  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "ReaderAnnotation_sourceContextType_sourceContextId_createdByUserId_idx" ON "ReaderAnnotation"("sourceContextType", "sourceContextId", "createdByUserId")
  `);
  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "ReaderAnnotation_projectId_visibility_createdAt_idx" ON "ReaderAnnotation"("projectId", "visibility", "createdAt")
  `);
  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "ReaderAnnotation_originalAnnotationId_idx" ON "ReaderAnnotation"("originalAnnotationId")
  `);
  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "ReaderAnnotation_lifecycleStatus_updatedAt_idx" ON "ReaderAnnotation"("lifecycleStatus", "updatedAt")
  `);
}

export async function initializeReadingPersistence(
  prisma: JixiaPrismaClient,
): Promise<void> {
  const existingInitializer = readingPersistenceInitializers.get(prisma);

  if (existingInitializer) {
    await existingInitializer;
    return;
  }

  const initializer = initializeReadingPersistenceTables(prisma);
  readingPersistenceInitializers.set(prisma, initializer);

  try {
    await initializer;
  } catch (error) {
    readingPersistenceInitializers.delete(prisma);
    throw error;
  }
}

export function createReadingRepository(
  prisma: JixiaPrismaClient,
): ReadingRepository {
  let initialized: Promise<void> | null = null;

  async function ensureInitialized(): Promise<void> {
    initialized ??= initializeReadingPersistence(prisma);

    await initialized;
  }

  return {
    async createConversation(
      input: CreatePersistedConversationParams,
    ): Promise<PersistedConversationRecord> {
      await ensureInitialized();
      await ensureUser(prisma, input.startedByUserId);

      if (input.id) {
        const existingConversation = await prisma.conversation.findUnique({
          where: { id: input.id },
        });

        if (existingConversation) {
          return mapConversation(existingConversation);
        }
      }

      const conversation = await prisma.conversation.create({
        data: {
          createdAt: optionalDate(input.createdAt),
          id: input.id,
          libraryEntryId: input.libraryEntryId,
          title: input.title,
          userId: input.startedByUserId,
        },
      });

      return mapConversation(conversation);
    },
    async createNote(input: CreatePersistedNoteParams): Promise<PersistedNoteRecord> {
      await ensureInitialized();
      await ensureUser(prisma, input.authorUserId);

      if (input.id) {
        const existingNote = await prisma.note.findUnique({
          where: { id: input.id },
        });

        if (existingNote) {
          await mirrorLegacySharedNoteAsProjectComment(prisma, existingNote);

          return mapNote(existingNote);
        }
      }

      const note = await prisma.note.create({
        data: {
          authorUserId: input.authorUserId,
          body: input.body,
          createdAt: optionalDate(input.createdAt),
          id: input.id,
          libraryEntryId: input.libraryEntryId,
          visibility: input.visibility,
        },
      });

      await mirrorLegacySharedNoteAsProjectComment(prisma, note);

      return mapNote(note);
    },
    async createPrivateNote(
      input: Omit<CreatePersistedNoteParams, 'visibility'>,
    ): Promise<PersistedNoteRecord> {
      return this.createNote({
        ...input,
        visibility: 'private',
      });
    },
    async createProjectComment(
      input: CreatePersistedProjectReadingCommentParams,
    ): Promise<PersistedProjectReadingCommentRecord> {
      await ensureInitialized();
      await ensureUser(prisma, input.authorUserId);

      if (input.id) {
        const existingComment = await prisma.projectReadingComment.findUnique({
          where: { id: input.id },
        });

        if (existingComment) {
          return mapProjectReadingComment(existingComment);
        }
      }

      const comment = await prisma.projectReadingComment.create({
        data: {
          authorUserId: input.authorUserId,
          body: input.body,
          createdAt: optionalDate(input.createdAt),
          id: input.id,
          libraryEntryId: input.libraryEntryId,
          projectId: input.projectId,
        },
      });

      return mapProjectReadingComment(comment);
    },
    async createReaderExcerpt(
      input: CreatePersistedReaderExcerptParams,
    ): Promise<PersistedReaderExcerptRecord> {
      await ensureInitialized();
      await ensureUser(prisma, input.createdByUserId);

      if (input.id) {
        const existingExcerpt = await prisma.readerExcerpt.findUnique({
          where: { id: input.id },
        });

        if (existingExcerpt) {
          return mapReaderExcerpt(existingExcerpt);
        }
      }

      const excerpt = await prisma.readerExcerpt.create({
        data: {
          createdAt: optionalDate(input.createdAt),
          createdByUserId: input.createdByUserId,
          endOffset: input.endOffset,
          id: input.id,
          libraryEntryId: input.libraryEntryId,
          locator: input.locator,
          note: input.note,
          paperAssetId: input.paperAssetId,
          quote: input.quote,
          startOffset: input.startOffset,
        },
      });

      return mapReaderExcerpt(excerpt);
    },
    async createSourceTextArtifact(
      input: CreatePersistedSourceTextArtifactParams,
    ): Promise<PersistedSourceTextArtifactRecord> {
      await ensureInitialized();

      if (input.id) {
        const existingArtifact = await prisma.sourceTextArtifact.findUnique({
          where: { id: input.id },
        });

        if (existingArtifact) {
          return mapSourceTextArtifact(existingArtifact);
        }
      }

      const artifact = await prisma.sourceTextArtifact.create({
        data: {
          artifactRef: input.artifactRef,
          availabilityState: input.availabilityState,
          characterCount: input.characterCount,
          createdAt: optionalDate(input.createdAt),
          id: input.id,
          kind: input.kind,
          language: input.language,
          pageCount: input.pageCount,
          paperAssetId: input.paperAssetId,
          statusDetail: input.statusDetail,
          textFormat: input.textFormat,
        },
      });

      return mapSourceTextArtifact(artifact);
    },
    async getGeneratedInsight(query: {
      generatedInsightId: string;
      libraryEntryId: string;
    }): Promise<PersistedGeneratedInsightRecord | null> {
      await ensureInitialized();

      const insight = await prisma.generatedInsight.findFirst({
        include: { evidenceSpans: true },
        where: {
          id: query.generatedInsightId,
          libraryEntryId: query.libraryEntryId,
        },
      });

      return insight
        ? mapGeneratedInsight(insight as GeneratedInsightWithEvidence)
        : null;
    },
    async getReadingState(
      libraryEntryId: string,
      userId: string,
    ): Promise<PersistedReadingStateRecord | null> {
      await ensureInitialized();

      const readingState = await prisma.readingState.findUnique({
        where: {
          libraryEntryId_userId: {
            libraryEntryId,
            userId,
          },
        },
      });

      return readingState ? mapReadingState(readingState) : null;
    },
    async getReaderExcerpt(
      excerptId: string,
    ): Promise<PersistedReaderExcerptRecord | null> {
      await ensureInitialized();

      const excerpt = await prisma.readerExcerpt.findUnique({
        where: { id: excerptId },
      });

      return excerpt ? mapReaderExcerpt(excerpt) : null;
    },
    async getSourceTextArtifact(
      artifactId: string,
    ): Promise<PersistedSourceTextArtifactRecord | null> {
      await ensureInitialized();

      const artifact = await prisma.sourceTextArtifact.findUnique({
        where: { id: artifactId },
      });

      return artifact ? mapSourceTextArtifact(artifact) : null;
    },
    async listGeneratedInsightsForEntry(
      libraryEntryId: string,
    ): Promise<PersistedGeneratedInsightRecord[]> {
      await ensureInitialized();

      const insights = await prisma.generatedInsight.findMany({
        include: { evidenceSpans: true },
        orderBy: { createdAt: 'asc' },
        where: { libraryEntryId },
      });

      return insights.map((insight) =>
        mapGeneratedInsight(insight as GeneratedInsightWithEvidence),
      );
    },
    async listReaderExcerptsForEntry(
      libraryEntryId: string,
    ): Promise<PersistedReaderExcerptRecord[]> {
      await ensureInitialized();

      const excerpts = await prisma.readerExcerpt.findMany({
        orderBy: { createdAt: 'asc' },
        where: { libraryEntryId },
      });

      return excerpts.map(mapReaderExcerpt);
    },
    async listNotesForEntry(input: ListEntryNotesQuery): Promise<PersistedNoteRecord[]> {
      return this.listPrivateNotesForEntry(input);
    },
    async listPrivateNotesForEntry(input: ListEntryNotesQuery): Promise<PersistedNoteRecord[]> {
      await ensureInitialized();

      const notes = await prisma.note.findMany({
        orderBy: { createdAt: 'asc' },
        where: {
          authorUserId: input.actorUserId,
          libraryEntryId: input.libraryEntryId,
        },
      });

      return notes.map(mapNote);
    },
    async listProjectCommentsForEntry(
      input: ListProjectCommentsQuery,
    ): Promise<PersistedProjectReadingCommentRecord[]> {
      await ensureInitialized();

      const comments = await prisma.projectReadingComment.findMany({
        orderBy: { createdAt: 'asc' },
        where: {
          libraryEntryId: input.libraryEntryId,
          projectId: input.projectId,
        },
      });

      return comments.map(mapProjectReadingComment);
    },
    async listSourceTextArtifactsForPaperAsset(
      input: ListSourceTextArtifactsQuery,
    ): Promise<PersistedSourceTextArtifactRecord[]> {
      await ensureInitialized();

      const artifacts = await prisma.sourceTextArtifact.findMany({
        orderBy: { createdAt: 'asc' },
        where: {
          paperAssetId: input.paperAssetId,
          ...(input.kind ? { kind: input.kind } : {}),
        },
      });

      return artifacts.map(mapSourceTextArtifact);
    },
    async saveGeneratedInsight(
      input: SavePersistedGeneratedInsightParams,
    ): Promise<PersistedGeneratedInsightRecord> {
      await ensureInitialized();
      await ensureUser(prisma, input.createdByUserId);

      if (input.id) {
        const existingInsight = await prisma.generatedInsight.findUnique({
          include: { evidenceSpans: true },
          where: { id: input.id },
        });

        if (existingInsight) {
          return mapGeneratedInsight(existingInsight as GeneratedInsightWithEvidence);
        }
      }

      const insight = await prisma.generatedInsight.create({
        data: {
          conversationId: input.conversationId,
          createdAt: optionalDate(input.createdAt),
          createdByUserId: input.createdByUserId,
          evidenceSpans: {
            create: input.evidenceSpans.map((span) => ({
              endOffset: span.endOffset,
              id: span.id,
              orderIndex: span.orderIndex,
              paperAssetId: span.paperAssetId,
              quote: span.quote,
              startOffset: span.startOffset,
            })),
          },
          id: input.id,
          libraryEntryId: input.libraryEntryId,
          summary: input.summary,
        },
        include: { evidenceSpans: true },
      });

      return mapGeneratedInsight(insight as GeneratedInsightWithEvidence);
    },
    async touchReadingState(
      input: TouchReadingStateParams,
    ): Promise<PersistedReadingStateRecord> {
      await ensureInitialized();
      await ensureUser(prisma, input.userId);

      const lastOpenedAt = new Date(input.lastReadAt ?? new Date().toISOString());
      const readingState = await prisma.readingState.upsert({
        create: {
          lastOpenedAt,
          libraryEntryId: input.libraryEntryId,
          progress: input.progressPercent ?? 0,
          userId: input.userId,
        },
        update: {
          lastOpenedAt,
          ...(typeof input.progressPercent === 'number'
            ? { progress: input.progressPercent }
            : {}),
        },
        where: {
          libraryEntryId_userId: {
            libraryEntryId: input.libraryEntryId,
            userId: input.userId,
          },
        },
      });

      return mapReadingState(readingState);
    },
  };
}
