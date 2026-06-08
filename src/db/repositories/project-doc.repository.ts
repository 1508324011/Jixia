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
  citations: PersistedProjectDocCitationInput[];
  content: string;
  documentId: string;
}

export type PersistedProjectDocCitationLifecycleStatus =
  | 'active'
  | 'archived'
  | 'removed';

export interface PersistedProjectDocCitationLocator {
  endOffset: number;
  locator?: string;
  page?: {
    endOffset?: number;
    label?: string;
    pageNumber: number;
    startOffset?: number;
  };
  quote?: string;
  sourceTextArtifactId: string;
  startOffset: number;
}

export type PersistedProjectDocCitationLocatorSourceType =
  | 'project_doc_occurrence'
  | 'project_visible_reader_annotation'
  | 'source_text_artifact_range';

export interface PersistedProjectDocCitationLocatorSource {
  id?: string;
  type: PersistedProjectDocCitationLocatorSourceType;
}

export interface PersistedProjectDocCitationOccurrence {
  key: string;
  label?: string;
}

export interface PersistedProjectDocCitationTarget {
  libraryEntryId: string;
  paperAssetId: string;
  projectId: string;
}

export interface PersistedProjectDocCitationInput {
  evidenceSpan?: string;
  lifecycleStatus?: PersistedProjectDocCitationLifecycleStatus;
  locator?: PersistedProjectDocCitationLocator;
  locatorSource?: PersistedProjectDocCitationLocatorSource;
  occurrence?: PersistedProjectDocCitationOccurrence;
  paperAssetId: string;
  readerAnnotationId?: string;
  readerExcerptId?: string;
  sourceTextArtifactId?: string;
  target?: PersistedProjectDocCitationTarget;
  targetLibraryEntryId?: string;
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
  lifecycleStatus?: PersistedProjectDocCitationLifecycleStatus;
  locator?: PersistedProjectDocCitationLocator;
  locatorSource?: PersistedProjectDocCitationLocatorSource;
  occurrence?: PersistedProjectDocCitationOccurrence;
  paperAssetId: string;
  projectDocVersionId: string;
  readerAnnotationId?: string;
  readerExcerptId?: string;
  sourceTextArtifactId?: string;
  target?: PersistedProjectDocCitationTarget;
  targetLibraryEntryId?: string;
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

function mapCitation(
  citation: ProjectDocCitation,
  projectId?: string,
): PersistedProjectDocCitationRecord {
  const locator = parseJsonObject<PersistedProjectDocCitationLocator>(
    citation.locatorJson,
    `ProjectDocCitation ${citation.id} locator`,
  );
  const targetLibraryEntryId = citation.targetLibraryEntryId ?? undefined;

  return {
    createdAt: toIsoString(citation.createdAt),
    evidenceSpan: citation.evidenceSpan ?? undefined,
    id: citation.id,
    lifecycleStatus: normalizeLifecycleStatus(citation.lifecycleStatus),
    locator,
    locatorSource: citation.locatorSourceType
      ? {
          id: citation.locatorSourceId ?? undefined,
          type: normalizeLocatorSourceType(citation.locatorSourceType),
        }
      : undefined,
    occurrence: citation.occurrenceKey
      ? {
          key: citation.occurrenceKey,
          label: citation.occurrenceLabel ?? undefined,
        }
      : undefined,
    paperAssetId: citation.paperAssetId,
    projectDocVersionId: citation.projectDocVersionId,
    readerAnnotationId: citation.readerAnnotationId ?? undefined,
    readerExcerptId: citation.readerExcerptId ?? undefined,
    sourceTextArtifactId: citation.sourceTextArtifactId ?? undefined,
    target: targetLibraryEntryId && projectId
      ? {
          libraryEntryId: targetLibraryEntryId,
          paperAssetId: citation.paperAssetId,
          projectId,
        }
      : undefined,
    targetLibraryEntryId,
  };
}

function parseJsonObject<T>(
  value: string | null,
  path: string,
): T | undefined {
  if (!value) {
    return undefined;
  }

  const parsed = JSON.parse(value) as unknown;

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(`${path} must be a JSON object.`);
  }

  return parsed as T;
}

function normalizeLifecycleStatus(
  value: string,
): PersistedProjectDocCitationLifecycleStatus {
  if (value === 'active' || value === 'archived' || value === 'removed') {
    return value;
  }

  throw new Error(`Project Doc citation lifecycle status ${value} is not supported.`);
}

function normalizeLocatorSourceType(
  value: string,
): PersistedProjectDocCitationLocatorSourceType {
  if (
    value === 'project_doc_occurrence' ||
    value === 'project_visible_reader_annotation' ||
    value === 'source_text_artifact_range'
  ) {
    return value;
  }

  throw new Error(`Project Doc citation locator source ${value} is not supported.`);
}

function mapSnapshot(
  version: ProjectDocVersionWithRelations,
): PersistedProjectDocSnapshot {
  const document = mapDocument(version.projectDoc);

  return {
    capturedAt: toIsoString(version.createdAt),
    citations: version.citations.map((citation) =>
      mapCitation(citation, document.projectId)
    ),
    content: version.snapshot,
    document,
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

async function validateProjectVisibleReaderAnnotationReference(
  prisma: ProjectDocClient,
  document: ProjectDoc,
  citation: PersistedProjectDocCitationInput,
  readerAnnotationId: string,
): Promise<void> {
  const annotation = await prisma.readerAnnotation.findUnique({
    where: { id: readerAnnotationId },
  });

  if (!annotation) {
    throw new Error(`Reader annotation ${readerAnnotationId} does not exist.`);
  }

  if (
    annotation.visibility !== 'project' ||
    annotation.projectId !== document.projectId ||
    annotation.paperAssetId !== citation.paperAssetId
  ) {
    throw new Error(
      'Project Doc citations require project-visible ReaderAnnotation evidence from the same project.',
    );
  }

  const annotationLibraryEntry = await prisma.libraryEntry.findUnique({
    where: { id: annotation.libraryEntryId },
  });

  if (
    !annotationLibraryEntry ||
    annotationLibraryEntry.scopeType !== 'project' ||
    annotationLibraryEntry.scopeId !== document.projectId ||
    annotationLibraryEntry.paperAssetId !== citation.paperAssetId
  ) {
    throw new Error(
      'Project Doc citations require project-visible ReaderAnnotation evidence from the project LibraryEntry.',
    );
  }
}

async function validateCitationReferences(
  prisma: ProjectDocClient,
  document: ProjectDoc,
  citations: PersistedProjectDocCitationInput[],
): Promise<void> {
  for (const citation of citations) {
    const targetLibraryEntryId = citation.targetLibraryEntryId ??
      citation.target?.libraryEntryId;

    if (citation.target && citation.target.projectId !== document.projectId) {
      throw new Error('Project Doc citation target project does not match the document.');
    }

    if (citation.target && citation.target.paperAssetId !== citation.paperAssetId) {
      throw new Error('Project Doc citation target paper asset does not match the citation.');
    }

    if (targetLibraryEntryId) {
      const targetEntry = await prisma.libraryEntry.findUnique({
        where: { id: targetLibraryEntryId },
      });

      if (!targetEntry) {
        throw new Error(`Library entry ${targetLibraryEntryId} does not exist.`);
      }

      if (
        targetEntry.scopeType !== 'project' ||
        targetEntry.scopeId !== document.projectId ||
        targetEntry.paperAssetId !== citation.paperAssetId
      ) {
        throw new Error('Project Doc citations require a target project LibraryEntry.');
      }
    }

    if (citation.readerAnnotationId) {
      await validateProjectVisibleReaderAnnotationReference(
        prisma,
        document,
        citation,
        citation.readerAnnotationId,
      );
    }

    if (citation.locatorSource?.type === 'project_visible_reader_annotation') {
      if (!citation.locatorSource.id) {
        throw new Error(
          'Project Doc citation project-visible reader annotation locator source requires an annotation id.',
        );
      }

      if (
        citation.readerAnnotationId &&
        citation.locatorSource.id !== citation.readerAnnotationId
      ) {
        throw new Error(
          'Project Doc citation locator source reader annotation does not match the citation reader annotation.',
        );
      }

      await validateProjectVisibleReaderAnnotationReference(
        prisma,
        document,
        citation,
        citation.locatorSource.id,
      );
    }

    if (
      citation.sourceTextArtifactId &&
      citation.locator?.sourceTextArtifactId &&
      citation.sourceTextArtifactId !== citation.locator.sourceTextArtifactId
    ) {
      throw new Error('Project Doc citation source text artifact does not match its locator.');
    }

    const sourceTextArtifactId = citation.sourceTextArtifactId ??
      citation.locator?.sourceTextArtifactId;

    if (sourceTextArtifactId) {
      const sourceTextArtifact = await prisma.sourceTextArtifact.findUnique({
        where: { id: sourceTextArtifactId },
      });

      if (!sourceTextArtifact) {
        throw new Error(`Source text artifact ${sourceTextArtifactId} does not exist.`);
      }

      if (sourceTextArtifact.paperAssetId !== citation.paperAssetId) {
        throw new Error(
          'Project Doc citation source text artifact does not match the citation paper asset.',
        );
      }
    }
  }
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

interface SqliteTableColumnRow {
  name: string;
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

async function ensureProjectDocCitationCoreColumns(
  prisma: JixiaPrismaClient,
): Promise<void> {
  await ensureColumnIfMissing(
    prisma,
    'ProjectDocCitation',
    'readerExcerptId',
    'TEXT',
  );
  await ensureColumnIfMissing(
    prisma,
    'ProjectDocCitation',
    'targetLibraryEntryId',
    'TEXT',
  );
  await ensureColumnIfMissing(
    prisma,
    'ProjectDocCitation',
    'occurrenceKey',
    'TEXT',
  );
  await ensureColumnIfMissing(
    prisma,
    'ProjectDocCitation',
    'occurrenceLabel',
    'TEXT',
  );
  await ensureColumnIfMissing(
    prisma,
    'ProjectDocCitation',
    'locatorJson',
    'TEXT',
  );
  await ensureColumnIfMissing(
    prisma,
    'ProjectDocCitation',
    'locatorSourceType',
    'TEXT',
  );
  await ensureColumnIfMissing(
    prisma,
    'ProjectDocCitation',
    'locatorSourceId',
    'TEXT',
  );
  await ensureColumnIfMissing(
    prisma,
    'ProjectDocCitation',
    'readerAnnotationId',
    'TEXT',
  );
  await ensureColumnIfMissing(
    prisma,
    'ProjectDocCitation',
    'sourceTextArtifactId',
    'TEXT',
  );
  await ensureColumnIfMissing(
    prisma,
    'ProjectDocCitation',
    'lifecycleStatus',
    "TEXT NOT NULL DEFAULT 'active'",
  );
}

async function hasProjectDocCitationCoreForeignKeys(
  prisma: JixiaPrismaClient,
): Promise<boolean> {
  const foreignKeys = await prisma.$queryRawUnsafe<SqliteForeignKeyRow[]>(
    'PRAGMA foreign_key_list("ProjectDocCitation")',
  );

  const hasReaderExcerptForeignKey = foreignKeys.some(
    (foreignKey) =>
      foreignKey.from === 'readerExcerptId' &&
      foreignKey.table === 'ReaderExcerpt' &&
      foreignKey.to === 'id' &&
      foreignKey.on_delete === 'SET NULL' &&
      foreignKey.on_update === 'CASCADE',
  );
  const hasTargetLibraryEntryForeignKey = foreignKeys.some(
    (foreignKey) =>
      foreignKey.from === 'targetLibraryEntryId' &&
      foreignKey.table === 'LibraryEntry' &&
      foreignKey.to === 'id' &&
      foreignKey.on_delete === 'RESTRICT' &&
      foreignKey.on_update === 'CASCADE',
  );
  const hasReaderAnnotationForeignKey = foreignKeys.some(
    (foreignKey) =>
      foreignKey.from === 'readerAnnotationId' &&
      foreignKey.table === 'ReaderAnnotation' &&
      foreignKey.to === 'id' &&
      foreignKey.on_delete === 'RESTRICT' &&
      foreignKey.on_update === 'CASCADE',
  );
  const hasSourceTextArtifactForeignKey = foreignKeys.some(
    (foreignKey) =>
      foreignKey.from === 'sourceTextArtifactId' &&
      foreignKey.table === 'SourceTextArtifact' &&
      foreignKey.to === 'id' &&
      foreignKey.on_delete === 'RESTRICT' &&
      foreignKey.on_update === 'CASCADE',
  );

  return (
    hasReaderExcerptForeignKey &&
    hasTargetLibraryEntryForeignKey &&
    hasReaderAnnotationForeignKey &&
    hasSourceTextArtifactForeignKey
  );
}

async function rebuildProjectDocCitationCoreForeignKeys(
  prisma: JixiaPrismaClient,
): Promise<void> {
  if (await hasProjectDocCitationCoreForeignKeys(prisma)) {
    return;
  }

  await ensureProjectDocCitationCoreColumns(prisma);
  await prisma.$executeRawUnsafe('PRAGMA foreign_keys = OFF');
  let transactionStarted = false;

  try {
    await prisma.$executeRawUnsafe('BEGIN IMMEDIATE');
    transactionStarted = true;

    await prisma.$executeRawUnsafe(
      'DROP TABLE IF EXISTS "ProjectDocCitation__rebuild"',
    );
    await prisma.$executeRawUnsafe(`
      CREATE TABLE "ProjectDocCitation__rebuild" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "projectDocVersionId" TEXT NOT NULL,
        "paperAssetId" TEXT NOT NULL,
        "readerExcerptId" TEXT,
        "targetLibraryEntryId" TEXT,
        "occurrenceKey" TEXT,
        "occurrenceLabel" TEXT,
        "locatorJson" TEXT,
        "locatorSourceType" TEXT,
        "locatorSourceId" TEXT,
        "readerAnnotationId" TEXT,
        "sourceTextArtifactId" TEXT,
        "lifecycleStatus" TEXT NOT NULL DEFAULT 'active',
        "evidenceSpan" TEXT,
        "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "ProjectDocCitation_projectDocVersionId_fkey" FOREIGN KEY ("projectDocVersionId") REFERENCES "ProjectDocVersion" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
        CONSTRAINT "ProjectDocCitation_paperAssetId_fkey" FOREIGN KEY ("paperAssetId") REFERENCES "PaperAsset" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
        CONSTRAINT "ProjectDocCitation_readerExcerptId_fkey" FOREIGN KEY ("readerExcerptId") REFERENCES "ReaderExcerpt" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
        CONSTRAINT "ProjectDocCitation_targetLibraryEntryId_fkey" FOREIGN KEY ("targetLibraryEntryId") REFERENCES "LibraryEntry" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
        CONSTRAINT "ProjectDocCitation_readerAnnotationId_fkey" FOREIGN KEY ("readerAnnotationId") REFERENCES "ReaderAnnotation" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
        CONSTRAINT "ProjectDocCitation_sourceTextArtifactId_fkey" FOREIGN KEY ("sourceTextArtifactId") REFERENCES "SourceTextArtifact" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
      )
    `);
    await prisma.$executeRawUnsafe(`
      INSERT INTO "ProjectDocCitation__rebuild" (
        "id",
        "projectDocVersionId",
        "paperAssetId",
        "readerExcerptId",
        "targetLibraryEntryId",
        "occurrenceKey",
        "occurrenceLabel",
        "locatorJson",
        "locatorSourceType",
        "locatorSourceId",
        "readerAnnotationId",
        "sourceTextArtifactId",
        "lifecycleStatus",
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
        CASE
          WHEN "ProjectDocCitation"."targetLibraryEntryId" IS NOT NULL
            AND EXISTS (
              SELECT 1
              FROM "LibraryEntry"
              WHERE "LibraryEntry"."id" = "ProjectDocCitation"."targetLibraryEntryId"
            )
          THEN "ProjectDocCitation"."targetLibraryEntryId"
          ELSE NULL
        END AS "targetLibraryEntryId",
        "ProjectDocCitation"."occurrenceKey",
        "ProjectDocCitation"."occurrenceLabel",
        "ProjectDocCitation"."locatorJson",
        "ProjectDocCitation"."locatorSourceType",
        "ProjectDocCitation"."locatorSourceId",
        CASE
          WHEN "ProjectDocCitation"."readerAnnotationId" IS NOT NULL
            AND EXISTS (
              SELECT 1
              FROM "ReaderAnnotation"
              WHERE "ReaderAnnotation"."id" = "ProjectDocCitation"."readerAnnotationId"
            )
          THEN "ProjectDocCitation"."readerAnnotationId"
          ELSE NULL
        END AS "readerAnnotationId",
        CASE
          WHEN "ProjectDocCitation"."sourceTextArtifactId" IS NOT NULL
            AND EXISTS (
              SELECT 1
              FROM "SourceTextArtifact"
              WHERE "SourceTextArtifact"."id" = "ProjectDocCitation"."sourceTextArtifactId"
            )
          THEN "ProjectDocCitation"."sourceTextArtifactId"
          ELSE NULL
        END AS "sourceTextArtifactId",
        COALESCE(NULLIF("ProjectDocCitation"."lifecycleStatus", ''), 'active') AS "lifecycleStatus",
        "ProjectDocCitation"."evidenceSpan",
        "ProjectDocCitation"."createdAt"
      FROM "ProjectDocCitation"
    `);
    await prisma.$executeRawUnsafe('DROP TABLE "ProjectDocCitation"');
    await prisma.$executeRawUnsafe(
      'ALTER TABLE "ProjectDocCitation__rebuild" RENAME TO "ProjectDocCitation"',
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
        "targetLibraryEntryId" TEXT,
        "occurrenceKey" TEXT,
        "occurrenceLabel" TEXT,
        "locatorJson" TEXT,
        "locatorSourceType" TEXT,
        "locatorSourceId" TEXT,
        "readerAnnotationId" TEXT,
        "sourceTextArtifactId" TEXT,
        "lifecycleStatus" TEXT NOT NULL DEFAULT 'active',
        "evidenceSpan" TEXT,
        "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "ProjectDocCitation_projectDocVersionId_fkey" FOREIGN KEY ("projectDocVersionId") REFERENCES "ProjectDocVersion" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
        CONSTRAINT "ProjectDocCitation_paperAssetId_fkey" FOREIGN KEY ("paperAssetId") REFERENCES "PaperAsset" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
        CONSTRAINT "ProjectDocCitation_readerExcerptId_fkey" FOREIGN KEY ("readerExcerptId") REFERENCES "ReaderExcerpt" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
        CONSTRAINT "ProjectDocCitation_targetLibraryEntryId_fkey" FOREIGN KEY ("targetLibraryEntryId") REFERENCES "LibraryEntry" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
        CONSTRAINT "ProjectDocCitation_readerAnnotationId_fkey" FOREIGN KEY ("readerAnnotationId") REFERENCES "ReaderAnnotation" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
        CONSTRAINT "ProjectDocCitation_sourceTextArtifactId_fkey" FOREIGN KEY ("sourceTextArtifactId") REFERENCES "SourceTextArtifact" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
      )
  `);
  await ensureProjectDocCitationCoreColumns(prisma);
  await prisma.$executeRawUnsafe(`
    DROP INDEX IF EXISTS "ProjectDocCitation_projectDocVersionId_paperAssetId_key"
  `);
  await rebuildProjectDocCitationCoreForeignKeys(prisma);
  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "ProjectDocCitation_projectDocVersionId_paperAssetId_idx" ON "ProjectDocCitation"("projectDocVersionId", "paperAssetId")
  `);
  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "ProjectDocCitation_readerExcerptId_idx" ON "ProjectDocCitation"("readerExcerptId")
  `);
  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "ProjectDocCitation_targetLibraryEntryId_lifecycleStatus_idx" ON "ProjectDocCitation"("targetLibraryEntryId", "lifecycleStatus")
  `);
  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "ProjectDocCitation_projectDocVersionId_occurrenceKey_idx" ON "ProjectDocCitation"("projectDocVersionId", "occurrenceKey")
  `);
  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "ProjectDocCitation_readerAnnotationId_idx" ON "ProjectDocCitation"("readerAnnotationId")
  `);
  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "ProjectDocCitation_sourceTextArtifactId_idx" ON "ProjectDocCitation"("sourceTextArtifactId")
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

        await validateCitationReferences(transaction, document, input.citations);

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
                lifecycleStatus: citation.lifecycleStatus ?? 'active',
                locatorJson: citation.locator
                  ? JSON.stringify(citation.locator)
                  : undefined,
                locatorSourceId: citation.locatorSource?.id,
                locatorSourceType: citation.locatorSource?.type,
                occurrenceKey: citation.occurrence?.key,
                occurrenceLabel: citation.occurrence?.label,
                paperAssetId: citation.paperAssetId,
                readerAnnotationId: citation.readerAnnotationId,
                readerExcerptId: citation.readerExcerptId,
                sourceTextArtifactId: citation.sourceTextArtifactId,
                targetLibraryEntryId: citation.targetLibraryEntryId ??
                  citation.target?.libraryEntryId,
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
