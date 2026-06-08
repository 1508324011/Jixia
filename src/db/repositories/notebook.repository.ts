import {
  type NotebookDocument,
  type NotebookDocumentCitation,
  type NotebookDocumentVersion,
  type Prisma,
} from '@prisma/client';

import type { JixiaPrismaClient } from '../client';
import { initializeReadingPersistence } from './reading.repository';

export interface CreateNotebookDocumentParams {
  id?: string;
  ownerId: string;
  title: string;
}

export interface CreateNotebookDocumentVersionParams {
  citations: Array<{
    evidenceSpan?: string;
    paperAssetId: string;
    readerExcerptId?: string;
  }>;
  content: string;
  documentId: string;
}

export interface PersistedNotebookDocumentRecord {
  createdAt: string;
  id: string;
  ownerId: string;
  title: string;
  updatedAt: string;
}

export interface PersistedNotebookCitationRecord {
  createdAt: string;
  evidenceSpan?: string;
  id: string;
  notebookDocumentVersionId: string;
  paperAssetId: string;
  readerExcerptId?: string;
}

export interface PersistedNotebookDocumentSnapshot {
  capturedAt: string;
  citations: PersistedNotebookCitationRecord[];
  content: string;
  document: PersistedNotebookDocumentRecord;
  versionId: string;
  versionNumber: number;
}

export interface NotebookRepository {
  createDocument(
    input: CreateNotebookDocumentParams,
  ): Promise<PersistedNotebookDocumentRecord>;
  findDocument(documentId: string): Promise<PersistedNotebookDocumentRecord | null>;
  getLatestSnapshot(
    documentId: string,
  ): Promise<PersistedNotebookDocumentSnapshot | null>;
  getDocumentForOwner(
    documentId: string,
    ownerId: string,
  ): Promise<PersistedNotebookDocumentRecord | null>;
  listDocumentsForOwner(
    ownerId: string,
  ): Promise<PersistedNotebookDocumentRecord[]>;
  saveVersion(
    input: CreateNotebookDocumentVersionParams,
  ): Promise<PersistedNotebookDocumentSnapshot>;
}

type TransactionClient = Prisma.TransactionClient;

type NotebookClient = JixiaPrismaClient | TransactionClient;

const NOTEBOOK_VERSION_INCLUDE = {
  citations: true,
  notebookDocument: true,
} satisfies Prisma.NotebookDocumentVersionInclude;

type NotebookVersionWithRelations = Prisma.NotebookDocumentVersionGetPayload<{
  include: typeof NOTEBOOK_VERSION_INCLUDE;
}>;

function toIsoString(value: Date): string {
  return value.toISOString();
}

function mapDocument(
  document: NotebookDocument,
): PersistedNotebookDocumentRecord {
  return {
    createdAt: toIsoString(document.createdAt),
    id: document.id,
    ownerId: document.ownerId,
    title: document.title,
    updatedAt: toIsoString(document.updatedAt),
  };
}

function mapCitation(
  citation: NotebookDocumentCitation,
): PersistedNotebookCitationRecord {
  return {
    createdAt: toIsoString(citation.createdAt),
    evidenceSpan: citation.evidenceSpan ?? undefined,
    id: citation.id,
    notebookDocumentVersionId: citation.notebookDocumentVersionId,
    paperAssetId: citation.paperAssetId,
    readerExcerptId: citation.readerExcerptId ?? undefined,
  };
}

function mapSnapshot(
  version: NotebookVersionWithRelations,
): PersistedNotebookDocumentSnapshot {
  return {
    capturedAt: toIsoString(version.createdAt),
    citations: version.citations.map(mapCitation),
    content: version.snapshot,
    document: mapDocument(version.notebookDocument),
    versionId: version.id,
    versionNumber: version.versionNumber,
  };
}

async function ensureUser(
  prisma: NotebookClient,
  userId: string,
): Promise<void> {
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

async function getNextVersionNumber(
  prisma: NotebookClient,
  documentId: string,
): Promise<number> {
  const latestVersion = await prisma.notebookDocumentVersion.findFirst({
    orderBy: { versionNumber: 'desc' },
    where: { notebookDocumentId: documentId },
  });

  return (latestVersion?.versionNumber ?? 0) + 1;
}

async function getLatestVersion(
  prisma: NotebookClient,
  documentId: string,
): Promise<NotebookVersionWithRelations | null> {
  return prisma.notebookDocumentVersion.findFirst({
    include: NOTEBOOK_VERSION_INCLUDE,
    orderBy: { versionNumber: 'desc' },
    where: { notebookDocumentId: documentId },
  });
}

interface SqliteForeignKeyRow {
  from: string;
  on_delete: string;
  on_update: string;
  table: string;
  to: string;
}

async function hasNotebookCitationReaderExcerptForeignKey(
  prisma: JixiaPrismaClient,
): Promise<boolean> {
  const foreignKeys = await prisma.$queryRawUnsafe<SqliteForeignKeyRow[]>(
    'PRAGMA foreign_key_list("NotebookDocumentCitation")',
  );

  return foreignKeys.some(
    (foreignKey) =>
      foreignKey.from === 'readerExcerptId' &&
      foreignKey.table === 'ReaderExcerpt' &&
      foreignKey.to === 'id' &&
      foreignKey.on_delete === 'SET NULL' &&
      foreignKey.on_update === 'CASCADE',
  );
}

async function rebuildNotebookCitationReaderExcerptForeignKey(
  prisma: JixiaPrismaClient,
): Promise<void> {
  if (await hasNotebookCitationReaderExcerptForeignKey(prisma)) {
    return;
  }

  await prisma.$executeRawUnsafe('PRAGMA foreign_keys = OFF');

  try {
    await prisma.$executeRawUnsafe(
      'DROP TABLE IF EXISTS "NotebookDocumentCitation__rebuild"',
    );
    await prisma.$executeRawUnsafe(`
      CREATE TABLE "NotebookDocumentCitation__rebuild" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "notebookDocumentVersionId" TEXT NOT NULL,
        "paperAssetId" TEXT NOT NULL,
        "readerExcerptId" TEXT,
        "evidenceSpan" TEXT,
        "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "NotebookDocumentCitation_notebookDocumentVersionId_fkey" FOREIGN KEY ("notebookDocumentVersionId") REFERENCES "NotebookDocumentVersion" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
        CONSTRAINT "NotebookDocumentCitation_paperAssetId_fkey" FOREIGN KEY ("paperAssetId") REFERENCES "PaperAsset" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
        CONSTRAINT "NotebookDocumentCitation_readerExcerptId_fkey" FOREIGN KEY ("readerExcerptId") REFERENCES "ReaderExcerpt" ("id") ON DELETE SET NULL ON UPDATE CASCADE
      )
    `);
    await prisma.$executeRawUnsafe(`
      INSERT INTO "NotebookDocumentCitation__rebuild" (
        "id",
        "notebookDocumentVersionId",
        "paperAssetId",
        "readerExcerptId",
        "evidenceSpan",
        "createdAt"
      )
      SELECT
        "NotebookDocumentCitation"."id",
        "NotebookDocumentCitation"."notebookDocumentVersionId",
        "NotebookDocumentCitation"."paperAssetId",
        CASE
          WHEN "NotebookDocumentCitation"."readerExcerptId" IS NOT NULL
            AND EXISTS (
              SELECT 1
              FROM "ReaderExcerpt"
              WHERE "ReaderExcerpt"."id" = "NotebookDocumentCitation"."readerExcerptId"
            )
          THEN "NotebookDocumentCitation"."readerExcerptId"
          ELSE NULL
        END AS "readerExcerptId",
        "NotebookDocumentCitation"."evidenceSpan",
        "NotebookDocumentCitation"."createdAt"
      FROM "NotebookDocumentCitation"
    `);
    await prisma.$executeRawUnsafe('DROP TABLE "NotebookDocumentCitation"');
    await prisma.$executeRawUnsafe(
      'ALTER TABLE "NotebookDocumentCitation__rebuild" RENAME TO "NotebookDocumentCitation"',
    );
  } finally {
    await prisma.$executeRawUnsafe('PRAGMA foreign_keys = ON');
  }
}

export async function initializeNotebookPersistence(
  prisma: JixiaPrismaClient,
): Promise<void> {
  await initializeReadingPersistence(prisma);
  await prisma.$executeRawUnsafe('PRAGMA foreign_keys = ON');
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "NotebookDocument" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "ownerId" TEXT NOT NULL,
      "title" TEXT NOT NULL,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "NotebookDocument_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
    )
  `);
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "NotebookDocumentVersion" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "notebookDocumentId" TEXT NOT NULL,
      "versionNumber" INTEGER NOT NULL,
      "snapshot" TEXT NOT NULL,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "NotebookDocumentVersion_notebookDocumentId_fkey" FOREIGN KEY ("notebookDocumentId") REFERENCES "NotebookDocument" ("id") ON DELETE CASCADE ON UPDATE CASCADE
    )
  `);
  await prisma.$executeRawUnsafe(`
    CREATE UNIQUE INDEX IF NOT EXISTS "NotebookDocumentVersion_notebookDocumentId_versionNumber_key" ON "NotebookDocumentVersion"("notebookDocumentId", "versionNumber")
  `);
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "ReaderNotebookBinding" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "userId" TEXT NOT NULL,
      "sourceContextType" TEXT NOT NULL,
      "sourceContextId" TEXT NOT NULL,
      "sourceContextVersionId" TEXT,
      "notebookDocumentId" TEXT NOT NULL,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "ReaderNotebookBinding_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
      CONSTRAINT "ReaderNotebookBinding_notebookDocumentId_fkey" FOREIGN KEY ("notebookDocumentId") REFERENCES "NotebookDocument" ("id") ON DELETE CASCADE ON UPDATE CASCADE
    )
  `);
  await prisma.$executeRawUnsafe(`
    CREATE UNIQUE INDEX IF NOT EXISTS "ReaderNotebookBinding_user_source_unique" ON "ReaderNotebookBinding"("userId", "sourceContextType", "sourceContextId")
  `);
  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "ReaderNotebookBinding_notebookDocumentId_idx" ON "ReaderNotebookBinding"("notebookDocumentId")
  `);
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "NotebookSourceLink" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "notebookDocumentVersionId" TEXT NOT NULL,
      "sourceType" TEXT NOT NULL,
      "sourceId" TEXT NOT NULL,
      "sourceVersionId" TEXT,
      "sourceLibraryEntryId" TEXT,
      "readerAnnotationId" TEXT,
      "sourceTextArtifactId" TEXT,
      "paperAssetId" TEXT,
      "evidenceSpan" TEXT,
      "locatorJson" TEXT,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "NotebookSourceLink_notebookDocumentVersionId_fkey" FOREIGN KEY ("notebookDocumentVersionId") REFERENCES "NotebookDocumentVersion" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
      CONSTRAINT "NotebookSourceLink_sourceLibraryEntryId_fkey" FOREIGN KEY ("sourceLibraryEntryId") REFERENCES "LibraryEntry" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
      CONSTRAINT "NotebookSourceLink_readerAnnotationId_fkey" FOREIGN KEY ("readerAnnotationId") REFERENCES "ReaderAnnotation" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
      CONSTRAINT "NotebookSourceLink_sourceTextArtifactId_fkey" FOREIGN KEY ("sourceTextArtifactId") REFERENCES "SourceTextArtifact" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
      CONSTRAINT "NotebookSourceLink_paperAssetId_fkey" FOREIGN KEY ("paperAssetId") REFERENCES "PaperAsset" ("id") ON DELETE SET NULL ON UPDATE CASCADE
    )
  `);
  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "NotebookSourceLink_notebookDocumentVersionId_sourceType_idx" ON "NotebookSourceLink"("notebookDocumentVersionId", "sourceType")
  `);
  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "NotebookSourceLink_sourceType_sourceId_idx" ON "NotebookSourceLink"("sourceType", "sourceId")
  `);
  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "NotebookSourceLink_sourceLibraryEntryId_idx" ON "NotebookSourceLink"("sourceLibraryEntryId")
  `);
  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "NotebookSourceLink_readerAnnotationId_idx" ON "NotebookSourceLink"("readerAnnotationId")
  `);
  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "NotebookSourceLink_sourceTextArtifactId_idx" ON "NotebookSourceLink"("sourceTextArtifactId")
  `);
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "NotebookDocumentCitation" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "notebookDocumentVersionId" TEXT NOT NULL,
      "paperAssetId" TEXT NOT NULL,
      "readerExcerptId" TEXT,
      "evidenceSpan" TEXT,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "NotebookDocumentCitation_notebookDocumentVersionId_fkey" FOREIGN KEY ("notebookDocumentVersionId") REFERENCES "NotebookDocumentVersion" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
      CONSTRAINT "NotebookDocumentCitation_paperAssetId_fkey" FOREIGN KEY ("paperAssetId") REFERENCES "PaperAsset" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
      CONSTRAINT "NotebookDocumentCitation_readerExcerptId_fkey" FOREIGN KEY ("readerExcerptId") REFERENCES "ReaderExcerpt" ("id") ON DELETE SET NULL ON UPDATE CASCADE
    )
  `);
  await prisma.$executeRawUnsafe(`
    ALTER TABLE "NotebookDocumentCitation" ADD COLUMN "readerExcerptId" TEXT
  `).catch((error) => {
    if (
      error instanceof Error &&
      /duplicate column name|already exists/i.test(error.message)
    ) {
      return;
    }

    throw error;
  });
  await prisma.$executeRawUnsafe(`
    DROP INDEX IF EXISTS "NotebookDocumentCitation_notebookDocumentVersionId_paperAssetId_key"
  `);
  await rebuildNotebookCitationReaderExcerptForeignKey(prisma);
  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "NotebookDocumentCitation_notebookDocumentVersionId_paperAssetId_idx" ON "NotebookDocumentCitation"("notebookDocumentVersionId", "paperAssetId")
  `);
  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "NotebookDocumentCitation_readerExcerptId_idx" ON "NotebookDocumentCitation"("readerExcerptId")
  `);
}

export function createNotebookRepository(
  prisma: JixiaPrismaClient,
): NotebookRepository {
  let initialized: Promise<void> | null = null;

  async function ensureInitialized(): Promise<void> {
    initialized ??= initializeNotebookPersistence(prisma);

    await initialized;
  }

  return {
    async createDocument(
      input: CreateNotebookDocumentParams,
    ): Promise<PersistedNotebookDocumentRecord> {
      await ensureInitialized();
      await ensureUser(prisma, input.ownerId);

      const document = await prisma.notebookDocument.create({
        data: {
          id: input.id,
          ownerId: input.ownerId,
          title: input.title,
        },
      });

      return mapDocument(document);
    },
    async findDocument(
      documentId: string,
    ): Promise<PersistedNotebookDocumentRecord | null> {
      await ensureInitialized();

      const document = await prisma.notebookDocument.findUnique({
        where: { id: documentId },
      });

      return document ? mapDocument(document) : null;
    },
    async getLatestSnapshot(
      documentId: string,
    ): Promise<PersistedNotebookDocumentSnapshot | null> {
      await ensureInitialized();

      const snapshot = await getLatestVersion(prisma, documentId);

      return snapshot ? mapSnapshot(snapshot) : null;
    },
    async getDocumentForOwner(
      documentId: string,
      ownerId: string,
    ): Promise<PersistedNotebookDocumentRecord | null> {
      await ensureInitialized();

      const document = await prisma.notebookDocument.findFirst({
        where: {
          id: documentId,
          ownerId,
        },
      });

      return document ? mapDocument(document) : null;
    },
    async listDocumentsForOwner(
      ownerId: string,
    ): Promise<PersistedNotebookDocumentRecord[]> {
      await ensureInitialized();
      await ensureUser(prisma, ownerId);

      const documents = await prisma.notebookDocument.findMany({
        orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }],
        where: { ownerId },
      });

      return documents.map(mapDocument);
    },
    async saveVersion(
      input: CreateNotebookDocumentVersionParams,
    ): Promise<PersistedNotebookDocumentSnapshot> {
      await ensureInitialized();

      return prisma.$transaction(async (transaction) => {
        const document = await transaction.notebookDocument.findUnique({
          where: { id: input.documentId },
        });

        if (!document) {
          throw new Error(`Notebook document ${input.documentId} does not exist.`);
        }

        const versionNumber = await getNextVersionNumber(
          transaction,
          input.documentId,
        );
        await transaction.notebookDocument.update({
          data: { updatedAt: new Date() },
          where: { id: input.documentId },
        });
        const version = await transaction.notebookDocumentVersion.create({
          data: {
            citations: {
              create: input.citations.map((citation) => ({
                evidenceSpan: citation.evidenceSpan,
                paperAssetId: citation.paperAssetId,
                readerExcerptId: citation.readerExcerptId,
              })),
            },
            notebookDocumentId: input.documentId,
            snapshot: input.content,
            versionNumber,
          },
          include: NOTEBOOK_VERSION_INCLUDE,
        });

        return mapSnapshot(version);
      });
    },
  };
}
