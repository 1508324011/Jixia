import {
  type Prisma,
  type ProjectDoc,
  type ProjectDocCitation,
  type ProjectDocVersion,
  type PublishState,
} from '@prisma/client';

import type { JixiaPrismaClient } from '../client';
import { initializeLibraryPersistence } from './library.repository';
import { initializeProjectPersistence } from './project.repository';

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
}

export interface PersistedProjectDocSnapshot {
  capturedAt: string;
  citations: PersistedProjectDocCitationRecord[];
  content: string;
  document: PersistedProjectDocRecord;
  versionId: string;
  versionNumber: number;
}

export interface ProjectDocRepository {
  createDocument(input: CreateProjectDocParams): Promise<PersistedProjectDocRecord>;
  findDocument(documentId: string): Promise<PersistedProjectDocRecord | null>;
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

type ProjectDocVersionWithRelations = Prisma.ProjectDocVersionGetPayload<{
  include: typeof PROJECT_DOC_VERSION_INCLUDE;
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

export async function initializeProjectDocPersistence(
  prisma: JixiaPrismaClient,
): Promise<void> {
  await initializeProjectPersistence(prisma);
  await initializeLibraryPersistence(prisma);
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
      "evidenceSpan" TEXT,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "ProjectDocCitation_projectDocVersionId_fkey" FOREIGN KEY ("projectDocVersionId") REFERENCES "ProjectDocVersion" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
      CONSTRAINT "ProjectDocCitation_paperAssetId_fkey" FOREIGN KEY ("paperAssetId") REFERENCES "PaperAsset" ("id") ON DELETE CASCADE ON UPDATE CASCADE
    )
  `);
  await prisma.$executeRawUnsafe(`
    CREATE UNIQUE INDEX IF NOT EXISTS "ProjectDocCitation_projectDocVersionId_paperAssetId_key" ON "ProjectDocCitation"("projectDocVersionId", "paperAssetId")
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
