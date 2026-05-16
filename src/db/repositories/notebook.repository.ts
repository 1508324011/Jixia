import {
  type NotebookDocument,
  type NotebookDocumentCitation,
  type NotebookDocumentVersion,
  type Prisma,
} from '@prisma/client';

import type { JixiaPrismaClient } from '../client';
import { initializeLibraryPersistence } from './library.repository';

export interface CreateNotebookDocumentParams {
  id?: string;
  ownerId: string;
  title: string;
}

export interface CreateNotebookDocumentVersionParams {
  citations: Array<{
    evidenceSpan?: string;
    paperAssetId: string;
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

export async function initializeNotebookPersistence(
  prisma: JixiaPrismaClient,
): Promise<void> {
  await initializeLibraryPersistence(prisma);
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
    CREATE TABLE IF NOT EXISTS "NotebookDocumentCitation" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "notebookDocumentVersionId" TEXT NOT NULL,
      "paperAssetId" TEXT NOT NULL,
      "evidenceSpan" TEXT,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "NotebookDocumentCitation_notebookDocumentVersionId_fkey" FOREIGN KEY ("notebookDocumentVersionId") REFERENCES "NotebookDocumentVersion" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
      CONSTRAINT "NotebookDocumentCitation_paperAssetId_fkey" FOREIGN KEY ("paperAssetId") REFERENCES "PaperAsset" ("id") ON DELETE CASCADE ON UPDATE CASCADE
    )
  `);
  await prisma.$executeRawUnsafe(`
    CREATE UNIQUE INDEX IF NOT EXISTS "NotebookDocumentCitation_notebookDocumentVersionId_paperAssetId_key" ON "NotebookDocumentCitation"("notebookDocumentVersionId", "paperAssetId")
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
