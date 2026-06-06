import {
  type Prisma,
  type ProjectDoc,
  type ProjectDocCitation,
  type ProjectDocVersion,
  type PublishState,
} from '@prisma/client';

import type { JixiaPrismaClient } from '../client';
import { initializeProjectPersistence } from './project.repository';
import { initializeReadingPersistence } from './reading.repository';

export interface CreateProjectDocParams {
  createdByUserId: string;
  id?: string;
  projectId: string;
  publishState?: PersistedProjectDocPublishState;
  title: string;
}

export interface CreateProjectDocVersionParams {
  citations: Array<{
    evidenceSpan?: string;
    paperAssetId: string;
    readerExcerptId?: string;
  }>;
  content: string;
  documentId: string;
}

export type PersistedProjectDocPublishState = 'draft' | 'review' | 'published';

export interface PersistedProjectDocRecord {
  createdAt: string;
  createdByUserId: string;
  id: string;
  projectId: string;
  publishState: PersistedProjectDocPublishState;
  title: string;
  updatedAt: string;
}

export interface PersistedProjectDocCitationRecord {
  createdAt: string;
  evidenceSpan?: string;
  id: string;
  paperAssetId: string;
  projectDocVersionId: string;
  readerExcerptId?: string;
}

export interface PersistedProjectDocSnapshot {
  capturedAt: string;
  citations: PersistedProjectDocCitationRecord[];
  content: string;
  document: PersistedProjectDocRecord;
  versionId: string;
  versionNumber: number;
}

export interface PersistedProjectDocIndexItem {
  document: PersistedProjectDocRecord;
  latestVersion: {
    capturedAt: string;
    versionId: string;
    versionNumber: number;
  } | null;
}

export interface ProjectDocRepository {
  createDocument(input: CreateProjectDocParams): Promise<PersistedProjectDocRecord>;
  findDocument(documentId: string): Promise<PersistedProjectDocRecord | null>;
  findLatestDocumentForProject(
    projectId: string,
  ): Promise<PersistedProjectDocRecord | null>;
  listDocumentsForProject(projectId: string): Promise<PersistedProjectDocIndexItem[]>;
  getLatestSnapshot(
    documentId: string,
  ): Promise<PersistedProjectDocSnapshot | null>;
  getSnapshotByVersionId(
    projectDocVersionId: string,
  ): Promise<PersistedProjectDocSnapshot | null>;
  getCitation(
    citationId: string,
  ): Promise<PersistedProjectDocCitationRecord | null>;
  getDocumentForProject(
    documentId: string,
    projectId: string,
  ): Promise<PersistedProjectDocRecord | null>;
  saveVersion(
    input: CreateProjectDocVersionParams,
  ): Promise<PersistedProjectDocSnapshot>;
  updatePublishState(
    documentId: string,
    publishState: PersistedProjectDocPublishState,
  ): Promise<PersistedProjectDocRecord>;
}

type TransactionClient = Prisma.TransactionClient;

type ProjectDocClient = JixiaPrismaClient | TransactionClient;

const PROJECT_DOC_VERSION_INCLUDE = {
  citations: true,
  projectDoc: true,
} satisfies Prisma.ProjectDocVersionInclude;

const PROJECT_DOC_INDEX_INCLUDE = {
  versions: {
    orderBy: [
      { versionNumber: 'desc' },
      { createdAt: 'desc' },
    ],
    take: 1,
  },
} satisfies Prisma.ProjectDocInclude;

type ProjectDocVersionWithRelations = Prisma.ProjectDocVersionGetPayload<{
  include: typeof PROJECT_DOC_VERSION_INCLUDE;
}>;

type ProjectDocWithIndexRelations = Prisma.ProjectDocGetPayload<{
  include: typeof PROJECT_DOC_INDEX_INCLUDE;
}>;

function toIsoString(value: Date): string {
  return value.toISOString();
}

function mapDocument(document: ProjectDoc): PersistedProjectDocRecord {
  return {
    createdAt: toIsoString(document.createdAt),
    createdByUserId: document.createdByUserId,
    id: document.id,
    projectId: document.projectId,
    publishState: document.publishState,
    title: document.title,
    updatedAt: toIsoString(document.updatedAt),
  };
}

function mapCitation(citation: ProjectDocCitation): PersistedProjectDocCitationRecord {
  return {
    createdAt: toIsoString(citation.createdAt),
    evidenceSpan: citation.evidenceSpan ?? undefined,
    id: citation.id,
    paperAssetId: citation.paperAssetId,
    projectDocVersionId: citation.projectDocVersionId,
    readerExcerptId: citation.readerExcerptId ?? undefined,
  };
}

function mapSnapshot(
  version: ProjectDocVersionWithRelations,
): PersistedProjectDocSnapshot {
  return {
    capturedAt: toIsoString(version.createdAt),
    citations: version.citations.map(mapCitation),
    content: version.snapshot,
    document: mapDocument(version.projectDoc),
    versionId: version.id,
    versionNumber: version.versionNumber,
  };
}

function mapDocumentIndexItem(
  document: ProjectDocWithIndexRelations,
): PersistedProjectDocIndexItem {
  const latestVersion = document.versions[0];

  return {
    document: mapDocument(document),
    latestVersion: latestVersion
      ? {
          capturedAt: toIsoString(latestVersion.createdAt),
          versionId: latestVersion.id,
          versionNumber: latestVersion.versionNumber,
        }
      : null,
  };
}

async function ensureUser(
  prisma: ProjectDocClient,
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
  prisma: ProjectDocClient,
  documentId: string,
): Promise<number> {
  const latestVersion = await prisma.projectDocVersion.findFirst({
    orderBy: { versionNumber: 'desc' },
    where: { projectDocId: documentId },
  });

  return (latestVersion?.versionNumber ?? 0) + 1;
}

async function getLatestVersion(
  prisma: ProjectDocClient,
  documentId: string,
): Promise<ProjectDocVersionWithRelations | null> {
  return prisma.projectDocVersion.findFirst({
    include: PROJECT_DOC_VERSION_INCLUDE,
    orderBy: { versionNumber: 'desc' },
    where: { projectDocId: documentId },
  });
}

interface SqliteForeignKeyRow {
  from: string;
  on_delete: string;
  on_update: string;
  table: string;
  to: string;
}

async function hasProjectDocCitationReaderExcerptForeignKey(
  prisma: JixiaPrismaClient,
): Promise<boolean> {
  const foreignKeys = await prisma.$queryRawUnsafe<SqliteForeignKeyRow[]>(
    'PRAGMA foreign_key_list("ProjectDocCitation")',
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

async function rebuildProjectDocCitationReaderExcerptForeignKey(
  prisma: JixiaPrismaClient,
): Promise<void> {
  if (await hasProjectDocCitationReaderExcerptForeignKey(prisma)) {
    return;
  }

  await prisma.$executeRawUnsafe('PRAGMA foreign_keys = OFF');

  try {
    await prisma.$executeRawUnsafe(
      'DROP TABLE IF EXISTS "ProjectDocCitation__rebuild"',
    );
    await prisma.$executeRawUnsafe(`
      CREATE TABLE "ProjectDocCitation__rebuild" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "projectDocVersionId" TEXT NOT NULL,
        "paperAssetId" TEXT NOT NULL,
        "readerExcerptId" TEXT,
        "evidenceSpan" TEXT,
        "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "ProjectDocCitation_projectDocVersionId_fkey" FOREIGN KEY ("projectDocVersionId") REFERENCES "ProjectDocVersion" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
        CONSTRAINT "ProjectDocCitation_paperAssetId_fkey" FOREIGN KEY ("paperAssetId") REFERENCES "PaperAsset" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
        CONSTRAINT "ProjectDocCitation_readerExcerptId_fkey" FOREIGN KEY ("readerExcerptId") REFERENCES "ReaderExcerpt" ("id") ON DELETE SET NULL ON UPDATE CASCADE
      )
    `);
    await prisma.$executeRawUnsafe(`
      INSERT INTO "ProjectDocCitation__rebuild" (
        "id",
        "projectDocVersionId",
        "paperAssetId",
        "readerExcerptId",
        "evidenceSpan",
        "createdAt"
      )
      SELECT
        "ProjectDocCitation"."id",
        "ProjectDocCitation"."projectDocVersionId",
        "ProjectDocCitation"."paperAssetId",
        CASE
          WHEN "ProjectDocCitation"."readerExcerptId" IS NOT NULL
            AND EXISTS (
              SELECT 1
              FROM "ReaderExcerpt"
              WHERE "ReaderExcerpt"."id" = "ProjectDocCitation"."readerExcerptId"
            )
          THEN "ProjectDocCitation"."readerExcerptId"
          ELSE NULL
        END AS "readerExcerptId",
        "ProjectDocCitation"."evidenceSpan",
        "ProjectDocCitation"."createdAt"
      FROM "ProjectDocCitation"
    `);
    await prisma.$executeRawUnsafe('DROP TABLE "ProjectDocCitation"');
    await prisma.$executeRawUnsafe(
      'ALTER TABLE "ProjectDocCitation__rebuild" RENAME TO "ProjectDocCitation"',
    );
  } finally {
    await prisma.$executeRawUnsafe('PRAGMA foreign_keys = ON');
  }
}

export async function initializeProjectDocPersistence(
  prisma: JixiaPrismaClient,
): Promise<void> {
  await initializeProjectPersistence(prisma);
  await initializeReadingPersistence(prisma);
  await prisma.$executeRawUnsafe('PRAGMA foreign_keys = ON');
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "ProjectDoc" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "projectId" TEXT NOT NULL,
      "createdByUserId" TEXT NOT NULL,
      "title" TEXT NOT NULL,
      "publishState" TEXT NOT NULL DEFAULT 'draft',
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "ProjectDoc_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
      CONSTRAINT "ProjectDoc_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
    )
  `);
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "ProjectDocVersion" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "projectDocId" TEXT NOT NULL,
      "versionNumber" INTEGER NOT NULL,
      "snapshot" TEXT NOT NULL,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "ProjectDocVersion_projectDocId_fkey" FOREIGN KEY ("projectDocId") REFERENCES "ProjectDoc" ("id") ON DELETE CASCADE ON UPDATE CASCADE
    )
  `);
  await prisma.$executeRawUnsafe(`
    CREATE UNIQUE INDEX IF NOT EXISTS "ProjectDocVersion_projectDocId_versionNumber_key" ON "ProjectDocVersion"("projectDocId", "versionNumber")
  `);
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "ProjectDocCitation" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "projectDocVersionId" TEXT NOT NULL,
      "paperAssetId" TEXT NOT NULL,
      "readerExcerptId" TEXT,
      "evidenceSpan" TEXT,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "ProjectDocCitation_projectDocVersionId_fkey" FOREIGN KEY ("projectDocVersionId") REFERENCES "ProjectDocVersion" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
      CONSTRAINT "ProjectDocCitation_paperAssetId_fkey" FOREIGN KEY ("paperAssetId") REFERENCES "PaperAsset" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
      CONSTRAINT "ProjectDocCitation_readerExcerptId_fkey" FOREIGN KEY ("readerExcerptId") REFERENCES "ReaderExcerpt" ("id") ON DELETE SET NULL ON UPDATE CASCADE
    )
  `);
  await prisma.$executeRawUnsafe(`
    ALTER TABLE "ProjectDocCitation" ADD COLUMN "readerExcerptId" TEXT
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
    DROP INDEX IF EXISTS "ProjectDocCitation_projectDocVersionId_paperAssetId_key"
  `);
  await rebuildProjectDocCitationReaderExcerptForeignKey(prisma);
  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "ProjectDocCitation_projectDocVersionId_paperAssetId_idx" ON "ProjectDocCitation"("projectDocVersionId", "paperAssetId")
  `);
  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "ProjectDocCitation_readerExcerptId_idx" ON "ProjectDocCitation"("readerExcerptId")
  `);
}

export function createProjectDocRepository(
  prisma: JixiaPrismaClient,
): ProjectDocRepository {
  let initialized: Promise<void> | null = null;

  async function ensureInitialized(): Promise<void> {
    initialized ??= initializeProjectDocPersistence(prisma);

    await initialized;
  }

  return {
    async createDocument(
      input: CreateProjectDocParams,
    ): Promise<PersistedProjectDocRecord> {
      await ensureInitialized();

      return prisma.$transaction(async (transaction) => {
        await ensureUser(transaction, input.createdByUserId);
        const document = await transaction.projectDoc.create({
          data: {
            createdByUserId: input.createdByUserId,
            id: input.id,
            projectId: input.projectId,
            publishState: (input.publishState ?? 'draft') as PublishState,
            title: input.title,
          },
        });

        return mapDocument(document);
      });
    },
    async findDocument(
      documentId: string,
    ): Promise<PersistedProjectDocRecord | null> {
      await ensureInitialized();

      const document = await prisma.projectDoc.findUnique({
        where: { id: documentId },
      });

      return document ? mapDocument(document) : null;
    },
    async findLatestDocumentForProject(
      projectId: string,
    ): Promise<PersistedProjectDocRecord | null> {
      await ensureInitialized();

      const document = await prisma.projectDoc.findFirst({
        orderBy: [{ updatedAt: 'desc' }, { createdAt: 'desc' }],
        where: { projectId },
      });

      return document ? mapDocument(document) : null;
    },
    async listDocumentsForProject(
      projectId: string,
    ): Promise<PersistedProjectDocIndexItem[]> {
      await ensureInitialized();

      const documents = await prisma.projectDoc.findMany({
        include: PROJECT_DOC_INDEX_INCLUDE,
        orderBy: [
          { updatedAt: 'desc' },
          { createdAt: 'desc' },
          { id: 'asc' },
        ],
        where: { projectId },
      });

      return documents.map(mapDocumentIndexItem);
    },
    async getLatestSnapshot(
      documentId: string,
    ): Promise<PersistedProjectDocSnapshot | null> {
      await ensureInitialized();

      const snapshot = await getLatestVersion(prisma, documentId);

      return snapshot ? mapSnapshot(snapshot) : null;
    },
    async getSnapshotByVersionId(
      projectDocVersionId: string,
    ): Promise<PersistedProjectDocSnapshot | null> {
      await ensureInitialized();

      const version = await prisma.projectDocVersion.findUnique({
        include: PROJECT_DOC_VERSION_INCLUDE,
        where: { id: projectDocVersionId },
      });

      return version ? mapSnapshot(version) : null;
    },
    async getCitation(
      citationId: string,
    ): Promise<PersistedProjectDocCitationRecord | null> {
      await ensureInitialized();

      const citation = await prisma.projectDocCitation.findUnique({
        where: { id: citationId },
      });

      return citation ? mapCitation(citation) : null;
    },
    async getDocumentForProject(
      documentId: string,
      projectId: string,
    ): Promise<PersistedProjectDocRecord | null> {
      await ensureInitialized();

      const document = await prisma.projectDoc.findFirst({
        where: {
          id: documentId,
          projectId,
        },
      });

      return document ? mapDocument(document) : null;
    },
    async saveVersion(
      input: CreateProjectDocVersionParams,
    ): Promise<PersistedProjectDocSnapshot> {
      await ensureInitialized();

      return prisma.$transaction(async (transaction) => {
        const document = await transaction.projectDoc.findUnique({
          where: { id: input.documentId },
        });

        if (!document) {
          throw new Error(`Project document ${input.documentId} does not exist.`);
        }

        const versionNumber = await getNextVersionNumber(
          transaction,
          input.documentId,
        );
        await transaction.projectDoc.update({
          data: { updatedAt: new Date() },
          where: { id: input.documentId },
        });
        const version = await transaction.projectDocVersion.create({
          data: {
            citations: {
              create: input.citations.map((citation) => ({
                evidenceSpan: citation.evidenceSpan,
                paperAssetId: citation.paperAssetId,
                readerExcerptId: citation.readerExcerptId,
              })),
            },
            projectDocId: input.documentId,
            snapshot: input.content,
            versionNumber,
          },
          include: PROJECT_DOC_VERSION_INCLUDE,
        });

        return mapSnapshot(version);
      });
    },
    async updatePublishState(
      documentId: string,
      publishState: PersistedProjectDocPublishState,
    ): Promise<PersistedProjectDocRecord> {
      await ensureInitialized();

      const document = await prisma.projectDoc.update({
        data: {
          publishState: publishState as PublishState,
        },
        where: { id: documentId },
      });

      return mapDocument(document);
    },
  };
}
