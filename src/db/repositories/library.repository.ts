import {
  type LibraryEntry,
  type PaperAsset,
  type Prisma,
} from '@prisma/client';

import type { JixiaPrismaClient } from '../client';
import { initializeProjectPersistence } from './project.repository';

export type PersistedLibraryScopeType = 'user' | 'project';

export type PersistedImportSourceType = 'doi' | 'pmid' | 'arxiv' | 'upload';

export type PersistedLibraryEntryVisibility =
  | 'private'
  | 'space_shared'
  | 'published_to_project';

export interface PersistedLibraryScopeRef {
  id: string;
  type: PersistedLibraryScopeType;
}

export interface UpsertPaperAssetParams {
  abstractText?: string;
  authors?: string;
  canonicalId: string;
  checksum?: string;
  id?: string;
  importedByUserId: string;
  sourceLocator: string;
  sourceType: PersistedImportSourceType;
  storageKey?: string;
  title: string;
}

export interface UpsertLibraryEntryParams {
  addedByUserId: string;
  id?: string;
  paperAssetId: string;
  scope: PersistedLibraryScopeRef;
}

export interface ImportScopedLibraryEntryParams {
  asset: UpsertPaperAssetParams;
  entry: Omit<UpsertLibraryEntryParams, 'paperAssetId'>;
}

export interface AdoptExistingLibraryEntryParams {
  addedByUserId: string;
  paperAssetId: string;
  scope: PersistedLibraryScopeRef;
}

export interface AdoptExistingLibraryEntryResult {
  view: PersistedLibraryEntryView;
  reused: boolean;
}

export interface LegacyLibraryAssetInput {
  abstractText?: string;
  canonicalId: string;
  createdAt?: string;
  id: string;
  importedByUserId: string;
  storageKey?: string;
  title: string;
}

export interface LegacyLibraryEntryInput {
  addedAt?: string;
  id: string;
  paperAssetId: string;
  spaceId: string;
  visibility: PersistedLibraryEntryVisibility;
}

export interface BootstrapLegacyLibraryInput {
  assets: LegacyLibraryAssetInput[];
  entries: LegacyLibraryEntryInput[];
}

export interface PersistedPaperAssetRecord {
  abstractText?: string;
  authors?: string;
  canonicalId: string;
  checksum?: string;
  createdAt: string;
  id: string;
  importedByUserId: string;
  sourceLocator: string;
  sourceType: PersistedImportSourceType;
  storageKey?: string;
  title: string;
  updatedAt: string;
}

export interface PersistedLibraryEntryRecord {
  addedByUserId: string;
  createdAt: string;
  id: string;
  paperAssetId: string;
  scope: PersistedLibraryScopeRef;
  updatedAt: string;
}

export interface PersistedLibraryEntryView {
  asset: PersistedPaperAssetRecord;
  entry: PersistedLibraryEntryRecord;
}

export interface LibraryRepository {
  adoptExistingPaperAsset(
    input: AdoptExistingLibraryEntryParams,
  ): Promise<AdoptExistingLibraryEntryResult>;
  bootstrapLegacyLibrary(input: BootstrapLegacyLibraryInput): Promise<void>;
  findPaperAssetByChecksum(
    checksum: string,
  ): Promise<PersistedPaperAssetRecord | null>;
  findPaperAsset(assetId: string): Promise<PersistedPaperAssetRecord | null>;
  getLibraryEntry(entryId: string): Promise<PersistedLibraryEntryView | null>;
  importScopedEntry(
    input: ImportScopedLibraryEntryParams,
  ): Promise<PersistedLibraryEntryView>;
  listLibraryEntriesForAsset(
    paperAssetId: string,
  ): Promise<PersistedLibraryEntryView[]>;
  listLibraryEntriesForScope(
    scope: PersistedLibraryScopeRef,
  ): Promise<PersistedLibraryEntryView[]>;
}

type TransactionClient = Prisma.TransactionClient;

type LibraryClient = JixiaPrismaClient | TransactionClient;

interface SqliteTableColumnRow {
  name: string;
}

const LIBRARY_ENTRY_WITH_ASSET = {
  paperAsset: true,
} satisfies Prisma.LibraryEntryInclude;

type LibraryEntryWithAsset = Prisma.LibraryEntryGetPayload<{
  include: typeof LIBRARY_ENTRY_WITH_ASSET;
}>;

function toIsoString(value: Date): string {
  return value.toISOString();
}

function mapPaperAsset(asset: PaperAsset): PersistedPaperAssetRecord {
  return {
    abstractText: asset.abstractText ?? undefined,
    authors: asset.authors ?? undefined,
    canonicalId: asset.canonicalId,
    checksum: asset.checksum ?? undefined,
    createdAt: toIsoString(asset.createdAt),
    id: asset.id,
    importedByUserId: asset.importedByUserId,
    sourceLocator: asset.sourceLocator,
    sourceType: asset.sourceType as PersistedImportSourceType,
    storageKey: asset.storageKey ?? undefined,
    title: asset.title,
    updatedAt: toIsoString(asset.updatedAt),
  };
}

function mapLibraryEntry(
  entry: LibraryEntry,
): PersistedLibraryEntryRecord {
  return {
    addedByUserId: entry.addedByUserId,
    createdAt: toIsoString(entry.createdAt),
    id: entry.id,
    paperAssetId: entry.paperAssetId,
    scope: {
      id: entry.scopeId,
      type: entry.scopeType as PersistedLibraryScopeType,
    },
    updatedAt: toIsoString(entry.updatedAt),
  };
}

function mapLibraryEntryView(
  entry: LibraryEntryWithAsset,
): PersistedLibraryEntryView {
  return {
    asset: mapPaperAsset(entry.paperAsset),
    entry: mapLibraryEntry(entry),
  };
}

function isUniqueConstraintError(error: unknown): boolean {
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    (error as { code?: unknown }).code === 'P2002'
  );
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

async function ensureUser(
  prisma: LibraryClient,
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

function deriveSourceFields(input: {
  canonicalId: string;
  sourceLocator?: string;
  sourceType?: PersistedImportSourceType;
}): { sourceLocator: string; sourceType: PersistedImportSourceType } {
  if (input.sourceLocator && input.sourceType) {
    return {
      sourceLocator: input.sourceLocator,
      sourceType: input.sourceType,
    };
  }

  const separatorIndex = input.canonicalId.indexOf(':');
  const sourceType = input.canonicalId.slice(0, separatorIndex);
  const sourceLocator = input.canonicalId.slice(separatorIndex + 1);

  if (
    sourceType === 'doi' ||
    sourceType === 'pmid' ||
    sourceType === 'arxiv' ||
    sourceType === 'upload'
  ) {
    return {
      sourceLocator: sourceLocator || input.canonicalId,
      sourceType,
    };
  }

  return {
    sourceLocator: input.canonicalId,
    sourceType: 'doi',
  };
}

async function upsertPaperAsset(
  prisma: LibraryClient,
  input: UpsertPaperAssetParams,
): Promise<PaperAsset> {
  await ensureUser(prisma, input.importedByUserId);

  return prisma.paperAsset.upsert({
    create: {
      abstractText: input.abstractText,
      authors: input.authors,
      canonicalId: input.canonicalId,
      checksum: input.checksum,
      id: input.id,
      importedByUserId: input.importedByUserId,
      sourceLocator: input.sourceLocator,
      sourceType: input.sourceType,
      storageKey: input.storageKey,
      title: input.title,
    },
    update: {
      abstractText: input.abstractText,
      authors: input.authors,
      checksum: input.checksum,
      sourceLocator: input.sourceLocator,
      sourceType: input.sourceType,
      storageKey: input.storageKey,
      title: input.title,
      updatedAt: new Date(),
    },
    where: { canonicalId: input.canonicalId },
  });
}

async function upsertLibraryEntry(
  prisma: LibraryClient,
  input: UpsertLibraryEntryParams,
): Promise<LibraryEntry> {
  await ensureUser(prisma, input.addedByUserId);

  return prisma.libraryEntry.upsert({
    create: {
      addedByUserId: input.addedByUserId,
      id: input.id,
      paperAssetId: input.paperAssetId,
      scopeId: input.scope.id,
      scopeType: input.scope.type,
    },
    update: {
      updatedAt: new Date(),
    },
    where: {
      LibraryEntry_scope_asset_unique: {
        paperAssetId: input.paperAssetId,
        scopeId: input.scope.id,
        scopeType: input.scope.type,
      },
    },
  });
}

export async function initializeLibraryPersistence(
  prisma: JixiaPrismaClient,
): Promise<void> {
  await initializeProjectPersistence(prisma);
  await prisma.$executeRawUnsafe('PRAGMA foreign_keys = ON');
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "PaperAsset" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "canonicalId" TEXT NOT NULL,
      "title" TEXT NOT NULL,
      "abstractText" TEXT,
      "authors" TEXT,
      "sourceType" TEXT NOT NULL,
      "sourceLocator" TEXT NOT NULL,
      "storageKey" TEXT,
      "checksum" TEXT,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "importedByUserId" TEXT NOT NULL,
      CONSTRAINT "PaperAsset_importedByUserId_fkey" FOREIGN KEY ("importedByUserId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
    )
  `);
  await prisma.$executeRawUnsafe(`
    CREATE UNIQUE INDEX IF NOT EXISTS "PaperAsset_canonicalId_key" ON "PaperAsset"("canonicalId")
  `);
  await prisma.$executeRawUnsafe(`
    CREATE UNIQUE INDEX IF NOT EXISTS "PaperAsset_checksum_key" ON "PaperAsset"("checksum")
  `);
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "LibraryEntry" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "scopeType" TEXT NOT NULL,
      "scopeId" TEXT NOT NULL,
      "paperAssetId" TEXT NOT NULL,
      "addedByUserId" TEXT NOT NULL,
      -- Deprecated migration-only columns kept inert for old SQLite files.
      -- Runtime scope/space/visibility authority comes exclusively from
      -- scopeType/scopeId plus Project.spaceId resolved in services.
      "legacySpaceId" TEXT,
      "legacyVisibility" TEXT,
      "lifecycleStatus" TEXT NOT NULL DEFAULT 'active',
      "archivedAt" DATETIME,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "LibraryEntry_paperAssetId_fkey" FOREIGN KEY ("paperAssetId") REFERENCES "PaperAsset" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
      CONSTRAINT "LibraryEntry_addedByUserId_fkey" FOREIGN KEY ("addedByUserId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
    )
  `);
  await prisma.$executeRawUnsafe(`
    CREATE UNIQUE INDEX IF NOT EXISTS "LibraryEntry_scope_asset_unique" ON "LibraryEntry"("scopeType", "scopeId", "paperAssetId")
  `);
  await ensureColumnIfMissing(
    prisma,
    'LibraryEntry',
    'lifecycleStatus',
    "TEXT NOT NULL DEFAULT 'active'",
  );
  await ensureColumnIfMissing(
    prisma,
    'LibraryEntry',
    'archivedAt',
    'DATETIME',
  );
  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "LibraryEntry_scopeType_scopeId_lifecycleStatus_idx" ON "LibraryEntry"("scopeType", "scopeId", "lifecycleStatus")
  `);
}

export function createLibraryRepository(
  prisma: JixiaPrismaClient,
): LibraryRepository {
  let initialized: Promise<void> | null = null;

  async function ensureInitialized(): Promise<void> {
    initialized ??= initializeLibraryPersistence(prisma);

    await initialized;
  }

  return {
    async adoptExistingPaperAsset(
      input: AdoptExistingLibraryEntryParams,
    ): Promise<AdoptExistingLibraryEntryResult> {
      await ensureInitialized();

      const scopedAssetWhere = {
        LibraryEntry_scope_asset_unique: {
          paperAssetId: input.paperAssetId,
          scopeId: input.scope.id,
          scopeType: input.scope.type,
        },
      };

      try {
        return await prisma.$transaction(async (transaction) => {
          const paperAsset = await transaction.paperAsset.findUnique({
            where: { id: input.paperAssetId },
          });

          if (!paperAsset) {
            throw new Error(`Paper asset ${input.paperAssetId} does not exist.`);
          }

          const existingEntry = await transaction.libraryEntry.findUnique({
            include: LIBRARY_ENTRY_WITH_ASSET,
            where: scopedAssetWhere,
          });

          if (existingEntry) {
            return {
              reused: true,
              view: mapLibraryEntryView(existingEntry),
            };
          }

          await ensureUser(transaction, input.addedByUserId);

          const createdEntry = await transaction.libraryEntry.create({
            data: {
              addedByUserId: input.addedByUserId,
              paperAssetId: input.paperAssetId,
              scopeId: input.scope.id,
              scopeType: input.scope.type,
            },
            include: LIBRARY_ENTRY_WITH_ASSET,
          });

          return {
            reused: false,
            view: mapLibraryEntryView(createdEntry),
          };
        });
      } catch (error) {
        if (!isUniqueConstraintError(error)) {
          throw error;
        }

        const existingEntry = await prisma.libraryEntry.findUnique({
          include: LIBRARY_ENTRY_WITH_ASSET,
          where: scopedAssetWhere,
        });

        if (!existingEntry) {
          throw error;
        }

        return {
          reused: true,
          view: mapLibraryEntryView(existingEntry),
        };
      }
    },
    async bootstrapLegacyLibrary(
      input: BootstrapLegacyLibraryInput,
    ): Promise<void> {
      await ensureInitialized();

      if (input.assets.length === 0) {
        return;
      }

      // Legacy JSON entries only carried spaceId + visibility, so they cannot
      // identify a real Project. Backfill them conservatively as personal
      // library adoptions for the asset importer without preserving the legacy
      // ownership mirrors in normal repository DTOs or writes.

      const assetsByLegacyId = new Map(
        input.assets.map((asset) => [asset.id, asset]),
      );

      await prisma.$transaction(async (transaction) => {
        const importedAssetsByLegacyId = new Map<string, PaperAsset>();

        for (const legacyAsset of input.assets) {
          const source = deriveSourceFields({
            canonicalId: legacyAsset.canonicalId,
          });
          const importedAsset = await upsertPaperAsset(transaction, {
            abstractText: legacyAsset.abstractText,
            canonicalId: legacyAsset.canonicalId,
            id: legacyAsset.id,
            importedByUserId: legacyAsset.importedByUserId,
            sourceLocator: source.sourceLocator,
            sourceType: source.sourceType,
            storageKey: legacyAsset.storageKey,
            title: legacyAsset.title,
          });

          importedAssetsByLegacyId.set(legacyAsset.id, importedAsset);
        }

        for (const legacyEntry of input.entries) {
          const legacyAsset = assetsByLegacyId.get(legacyEntry.paperAssetId);
          const importedAsset = importedAssetsByLegacyId.get(
            legacyEntry.paperAssetId,
          );

          if (!legacyAsset || !importedAsset) {
            continue;
          }

          await upsertLibraryEntry(transaction, {
            addedByUserId: legacyAsset.importedByUserId,
            id: legacyEntry.id,
            paperAssetId: importedAsset.id,
            scope: {
              id: legacyAsset.importedByUserId,
              type: 'user',
            },
          });
        }
      });
    },
    async findPaperAsset(
      assetId: string,
    ): Promise<PersistedPaperAssetRecord | null> {
      await ensureInitialized();

      const asset = await prisma.paperAsset.findUnique({ where: { id: assetId } });

      return asset ? mapPaperAsset(asset) : null;
    },
    async findPaperAssetByChecksum(
      checksum: string,
    ): Promise<PersistedPaperAssetRecord | null> {
      await ensureInitialized();

      const normalizedChecksum = checksum.trim();

      if (!normalizedChecksum) {
        return null;
      }

      const asset = await prisma.paperAsset.findFirst({
        orderBy: { createdAt: 'asc' },
        where: {
          checksum: normalizedChecksum,
          storageKey: { not: null },
        },
      });

      return asset ? mapPaperAsset(asset) : null;
    },
    async getLibraryEntry(
      entryId: string,
    ): Promise<PersistedLibraryEntryView | null> {
      await ensureInitialized();

      const entry = await prisma.libraryEntry.findUnique({
        include: LIBRARY_ENTRY_WITH_ASSET,
        where: { id: entryId },
      });

      return entry ? mapLibraryEntryView(entry) : null;
    },
    async importScopedEntry(
      input: ImportScopedLibraryEntryParams,
    ): Promise<PersistedLibraryEntryView> {
      await ensureInitialized();

      return prisma.$transaction(async (transaction) => {
        const paperAsset = await upsertPaperAsset(transaction, input.asset);
        const entry = await upsertLibraryEntry(transaction, {
          ...input.entry,
          paperAssetId: paperAsset.id,
        });
        const created = await transaction.libraryEntry.findUnique({
          include: LIBRARY_ENTRY_WITH_ASSET,
          where: { id: entry.id },
        });

        if (!created) {
          throw new Error('Scoped library entry was not persisted.');
        }

        return mapLibraryEntryView(created);
      });
    },
    async listLibraryEntriesForAsset(
      paperAssetId: string,
    ): Promise<PersistedLibraryEntryView[]> {
      await ensureInitialized();

      const entries = await prisma.libraryEntry.findMany({
        include: LIBRARY_ENTRY_WITH_ASSET,
        orderBy: { createdAt: 'desc' },
        where: { paperAssetId },
      });

      return entries.map(mapLibraryEntryView);
    },
    async listLibraryEntriesForScope(
      scope: PersistedLibraryScopeRef,
    ): Promise<PersistedLibraryEntryView[]> {
      await ensureInitialized();

      const entries = await prisma.libraryEntry.findMany({
        include: LIBRARY_ENTRY_WITH_ASSET,
        orderBy: { createdAt: 'desc' },
        where: {
          scopeId: scope.id,
          scopeType: scope.type,
        },
      });

      return entries.map(mapLibraryEntryView);
    },
  };
}
