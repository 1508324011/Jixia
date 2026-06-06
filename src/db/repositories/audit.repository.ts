import {
  type AuditLog,
  type Prisma,
} from '@prisma/client';

import type { JixiaPrismaClient } from '../client';
import { initializeSpacePersistence } from './space.repository';

export type PersistedAuditScopeType = 'user' | 'project';

export interface PersistedAuditScopeRef {
  id: string;
  type: PersistedAuditScopeType;
}

export interface PersistedAuditObjectRef {
  id: string;
  type: string;
}

export type PersistedAuditMetadataValue = string | number | boolean | null;

export type PersistedAuditMetadata = Record<string, PersistedAuditMetadataValue>;

export interface CreatePersistedAuditRecordParams {
  action: string;
  actorUserId: string;
  detail: string;
  id?: string;
  jobId?: string;
  metadata?: PersistedAuditMetadata;
  object: PersistedAuditObjectRef;
  projectId?: string;
  recordedAt?: string;
  scope: PersistedAuditScopeRef;
  spaceId: string;
}

export interface PersistedGovernanceAuditRecord {
  action: string;
  actorUserId: string;
  detail: string;
  id: string;
  jobId?: string;
  metadata?: PersistedAuditMetadata;
  object: PersistedAuditObjectRef;
  projectId?: string;
  recordedAt: string;
  scope: PersistedAuditScopeRef;
  spaceId: string;
}

export interface ListProjectAuditRecordsQuery {
  objectId?: string;
  objectType?: string;
  projectId: string;
}

export interface AuditRepository {
  createAuditRecord(
    input: CreatePersistedAuditRecordParams,
  ): Promise<PersistedGovernanceAuditRecord>;
  listAuditRecordsByJob(jobId: string): Promise<PersistedGovernanceAuditRecord[]>;
  listAuditRecordsByProject(
    query: ListProjectAuditRecordsQuery,
  ): Promise<PersistedGovernanceAuditRecord[]>;
}

type TransactionClient = Prisma.TransactionClient;

type AuditClient = JixiaPrismaClient | TransactionClient;

interface SqliteForeignKeyRow {
  from: string;
  on_delete: string;
  on_update: string;
  table: string;
  to: string;
}

interface SqliteForeignKeyViolationRow {
  fkid: number;
  parent: string;
  rowid: number;
  table: string;
}

interface SqliteRowCount {
  count: bigint | number;
}

const SAFE_METADATA_KEYS = new Set([
  'citationCount',
  'itemCount',
  'jobKind',
  'jobStatus',
  'objectLabel',
  'provider',
  'publishState',
  'resultCount',
  'sourceCount',
  'sourceType',
  'versionNumber',
]);

const FORBIDDEN_METADATA_KEYS = new Set([
  'actoruserid',
  'apikey',
  'authoruserid',
  'body',
  'checksum',
  'content',
  'createdbyuserid',
  'credentialref',
  'encryptedsecret',
  'filesystempath',
  'filepath',
  'ownerid',
  'payload',
  'projectid',
  'rawsecret',
  'scope',
  'scopeid',
  'scopetype',
  'secret',
  'spaceid',
  'snapshot',
  'storagekey',
  'token',
  'visibility',
]);

function normalizeMetadataKey(key: string): string {
  return key.replace(/[^a-z0-9]/gi, '').toLowerCase();
}

function isPrimitiveMetadataValue(
  value: unknown,
): value is PersistedAuditMetadataValue {
  return (
    value === null ||
    typeof value === 'string' ||
    typeof value === 'number' ||
    typeof value === 'boolean'
  );
}

export function sanitizePersistedAuditDetail(detail: string): string {
  const trimmed = detail.trim();

  if (!trimmed) {
    throw new Error('Audit detail is required.');
  }

  return trimmed
    .replace(/\bcredential\s+[^\s.;,)]+/gi, 'credential reference redacted')
    .replace(/\bcred-[a-z0-9_-]+\b/gi, '[redacted-credential-ref]')
    .replace(/\bsk-[a-z0-9_-]+\b/gi, '[redacted-secret]')
    .replace(/\bpapers\/[^\s.;,)]+/gi, '[redacted-storage-key]')
    .replace(/\b(?:rawSecret|apiKey|token|encryptedSecret|storageKey|checksum|payload|snapshot|content|body)\b\s*[:=]?\s*[^\s.;,)]+/gi, '[redacted-audit-detail]')
    .replace(/(?:\/home|\/tmp|\/var|\/mnt|\/opt)\/[^\s.;,)]+/gi, '[redacted-path]');
}

export function sanitizePersistedAuditMetadata(
  metadata: Record<string, unknown> | undefined,
): PersistedAuditMetadata | undefined {
  if (!metadata) {
    return undefined;
  }

  const sanitized: PersistedAuditMetadata = {};

  for (const [key, value] of Object.entries(metadata)) {
    const normalizedKey = normalizeMetadataKey(key);

    if (FORBIDDEN_METADATA_KEYS.has(normalizedKey)) {
      throw new Error(`${key} is not accepted for audit metadata.`);
    }

    if (!SAFE_METADATA_KEYS.has(key)) {
      throw new Error(`${key} is not allowlisted for audit metadata.`);
    }

    if (!isPrimitiveMetadataValue(value)) {
      throw new Error(`${key} must be a primitive audit metadata value.`);
    }

    sanitized[key] = typeof value === 'string'
      ? sanitizePersistedAuditDetail(value)
      : value;
  }

  return Object.keys(sanitized).length > 0 ? sanitized : undefined;
}

async function readTableColumns(
  prisma: JixiaPrismaClient,
  tableName: string,
): Promise<Set<string>> {
  const columns = await prisma.$queryRawUnsafe<Array<{ name: string }>>(
    `PRAGMA table_info("${tableName}")`,
  );

  return new Set(columns.map((column) => column.name));
}

async function tableExists(
  prisma: JixiaPrismaClient,
  tableName: string,
): Promise<boolean> {
  const rows = await prisma.$queryRawUnsafe<Array<{ name: string }>>(
    `SELECT name FROM sqlite_master WHERE type = 'table' AND name = '${tableName}'`,
  );

  return rows.length > 0;
}

async function hasAuditLogJobForeignKey(
  prisma: JixiaPrismaClient,
): Promise<boolean> {
  const foreignKeys = await prisma.$queryRawUnsafe<SqliteForeignKeyRow[]>(
    'PRAGMA foreign_key_list("AuditLog")',
  );

  return foreignKeys.some(
    (foreignKey) =>
      foreignKey.from === 'jobId' &&
      foreignKey.table === 'Job' &&
      foreignKey.to === 'id' &&
      foreignKey.on_delete === 'SET NULL' &&
      foreignKey.on_update === 'CASCADE',
  );
}

async function readTableRowCount(
  prisma: JixiaPrismaClient,
  tableName: string,
): Promise<number> {
  const rows = await prisma.$queryRawUnsafe<SqliteRowCount[]>(
    `SELECT COUNT(*) AS "count" FROM "${tableName}"`,
  );

  return Number(rows[0]?.count ?? 0);
}

async function assertNoForeignKeyViolations(
  prisma: JixiaPrismaClient,
  tableName: string,
): Promise<void> {
  const violations = await prisma.$queryRawUnsafe<SqliteForeignKeyViolationRow[]>(
    `PRAGMA foreign_key_check("${tableName}")`,
  );

  if (violations.length > 0) {
    throw new Error(
      `AuditLog rebuild would create ${violations.length} foreign key violation(s). Existing SQLite governance audit rows must be repaired before serving audit records.`,
    );
  }
}

async function rebuildAuditLogJobForeignKey(
  prisma: JixiaPrismaClient,
): Promise<void> {
  if (
    !(await tableExists(prisma, 'AuditLog')) ||
    !(await tableExists(prisma, 'Job')) ||
    (await hasAuditLogJobForeignKey(prisma))
  ) {
    return;
  }

  await prisma.$executeRawUnsafe('PRAGMA foreign_keys = OFF');
  let transactionStarted = false;

  try {
    await prisma.$executeRawUnsafe('BEGIN IMMEDIATE');
    transactionStarted = true;

    const sourceRowCount = await readTableRowCount(prisma, 'AuditLog');

    await prisma.$executeRawUnsafe('DROP TABLE IF EXISTS "AuditLog__rebuild"');
    await prisma.$executeRawUnsafe(`
      CREATE TABLE "AuditLog__rebuild" (
        "id" TEXT NOT NULL PRIMARY KEY,
        "spaceId" TEXT NOT NULL,
        "scopeType" TEXT NOT NULL DEFAULT 'user',
        "scopeId" TEXT NOT NULL,
        "objectType" TEXT NOT NULL,
        "objectId" TEXT NOT NULL,
        "projectId" TEXT,
        "actorUserId" TEXT NOT NULL,
        "jobId" TEXT,
        "action" TEXT NOT NULL,
        "detail" TEXT NOT NULL,
        "metadataJson" TEXT,
        "recordedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
        CONSTRAINT "AuditLog_spaceId_fkey" FOREIGN KEY ("spaceId") REFERENCES "Space" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
        CONSTRAINT "AuditLog_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
        CONSTRAINT "AuditLog_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job" ("id") ON DELETE SET NULL ON UPDATE CASCADE
      )
    `);
    await prisma.$executeRawUnsafe(`
      INSERT INTO "AuditLog__rebuild" (
        "id",
        "spaceId",
        "scopeType",
        "scopeId",
        "objectType",
        "objectId",
        "projectId",
        "actorUserId",
        "jobId",
        "action",
        "detail",
        "metadataJson",
        "recordedAt"
      )
      SELECT
        "AuditLog"."id",
        "AuditLog"."spaceId",
        "AuditLog"."scopeType",
        "AuditLog"."scopeId",
        "AuditLog"."objectType",
        "AuditLog"."objectId",
        "AuditLog"."projectId",
        "AuditLog"."actorUserId",
        CASE
          WHEN "AuditLog"."jobId" IS NOT NULL
            AND EXISTS (
              SELECT 1
              FROM "Job"
              WHERE "Job"."id" = "AuditLog"."jobId"
            )
          THEN "AuditLog"."jobId"
          ELSE NULL
        END AS "jobId",
        "AuditLog"."action",
        "AuditLog"."detail",
        "AuditLog"."metadataJson",
        "AuditLog"."recordedAt"
      FROM "AuditLog"
    `);

    const rebuiltRowCount = await readTableRowCount(prisma, 'AuditLog__rebuild');

    if (rebuiltRowCount !== sourceRowCount) {
      throw new Error(
        `AuditLog rebuild copied ${rebuiltRowCount} row(s), expected ${sourceRowCount}.`,
      );
    }

    await assertNoForeignKeyViolations(prisma, 'AuditLog__rebuild');
    await prisma.$executeRawUnsafe('DROP TABLE "AuditLog"');
    await prisma.$executeRawUnsafe(
      'ALTER TABLE "AuditLog__rebuild" RENAME TO "AuditLog"',
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

async function assertRequiredColumns(
  prisma: JixiaPrismaClient,
  tableName: string,
  requiredColumns: string[],
): Promise<void> {
  const availableColumns = await readTableColumns(prisma, tableName);

  for (const requiredColumn of requiredColumns) {
    if (!availableColumns.has(requiredColumn)) {
      throw new Error(
        `Audit persistence requires ${tableName}.${requiredColumn}. Existing SQLite schema is too old and must be migrated before serving governance audit records.`,
      );
    }
  }
}

async function ensureUser(prisma: AuditClient, userId: string): Promise<void> {
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

function toIsoString(value: Date): string {
  return value.toISOString();
}

function optionalDate(value: string | undefined): Date | undefined {
  return value ? new Date(value) : undefined;
}

function normalizeScopeType(rawScopeType: string): PersistedAuditScopeType {
  if (rawScopeType === 'user' || rawScopeType === 'project') {
    return rawScopeType;
  }

  throw new Error(
    `Persisted audit scope type ${rawScopeType} is not supported. Audit records must use canonical user/project scope before serving requests.`,
  );
}

function parseMetadataJson(
  metadataJson: string | null,
): PersistedAuditMetadata | undefined {
  if (!metadataJson) {
    return undefined;
  }

  try {
    const parsed = JSON.parse(metadataJson) as unknown;

    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      return undefined;
    }

    const metadata: PersistedAuditMetadata = {};

    for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (
        value === null ||
        typeof value === 'string' ||
        typeof value === 'number' ||
        typeof value === 'boolean'
      ) {
        metadata[key] = value;
      }
    }

    return Object.keys(metadata).length > 0 ? metadata : undefined;
  } catch {
    return undefined;
  }
}

export function mapGovernanceAuditRecord(
  record: AuditLog,
): PersistedGovernanceAuditRecord {
  return {
    action: record.action,
    actorUserId: record.actorUserId,
    detail: record.detail,
    id: record.id,
    jobId: record.jobId ?? undefined,
    metadata: parseMetadataJson(record.metadataJson),
    object: {
      id: record.objectId,
      type: record.objectType,
    },
    projectId: record.projectId ?? undefined,
    recordedAt: toIsoString(record.recordedAt),
    scope: {
      id: record.scopeId,
      type: normalizeScopeType(record.scopeType),
    },
    spaceId: record.spaceId,
  };
}

export async function insertGovernanceAuditRecord(
  prisma: AuditClient,
  input: CreatePersistedAuditRecordParams,
): Promise<PersistedGovernanceAuditRecord> {
  await ensureUser(prisma, input.actorUserId);
  const metadata = sanitizePersistedAuditMetadata(input.metadata);

  const record = await prisma.auditLog.create({
    data: {
      action: input.action,
      actorUserId: input.actorUserId,
      detail: sanitizePersistedAuditDetail(input.detail),
      id: input.id,
      jobId: input.jobId,
      metadataJson: metadata ? JSON.stringify(metadata) : undefined,
      objectId: input.object.id,
      objectType: input.object.type,
      projectId: input.projectId ?? (input.scope.type === 'project' ? input.scope.id : undefined),
      recordedAt: optionalDate(input.recordedAt),
      scopeId: input.scope.id,
      scopeType: input.scope.type,
      spaceId: input.spaceId,
    },
  });

  return mapGovernanceAuditRecord(record);
}

async function backfillGenericAuditColumns(
  prisma: JixiaPrismaClient,
): Promise<void> {
  if (await tableExists(prisma, 'Job')) {
    await prisma.$executeRawUnsafe(`
      UPDATE "AuditLog"
      SET
        "objectType" = 'job',
        "objectId" = "jobId"
      WHERE
        "jobId" IS NOT NULL AND
        (
          "objectType" IS NULL OR
          "objectType" = '' OR
          "objectType" = 'unknown' OR
          "objectId" IS NULL OR
          "objectId" = ''
        )
    `);
    await prisma.$executeRawUnsafe(`
      UPDATE "AuditLog"
      SET
        "scopeType" = COALESCE(
          NULLIF((SELECT "Job"."scopeType" FROM "Job" WHERE "Job"."id" = "AuditLog"."jobId"), ''),
          NULLIF("AuditLog"."scopeType", ''),
          'user'
        ),
        "scopeId" = COALESCE(
          NULLIF((SELECT "Job"."scopeId" FROM "Job" WHERE "Job"."id" = "AuditLog"."jobId"), ''),
          NULLIF("AuditLog"."scopeId", ''),
          "AuditLog"."actorUserId"
        ),
        "projectId" = CASE
          WHEN (SELECT "Job"."scopeType" FROM "Job" WHERE "Job"."id" = "AuditLog"."jobId") = 'project'
            THEN (SELECT "Job"."scopeId" FROM "Job" WHERE "Job"."id" = "AuditLog"."jobId")
          ELSE "AuditLog"."projectId"
        END
      WHERE
        "jobId" IS NOT NULL AND
        EXISTS (SELECT 1 FROM "Job" WHERE "Job"."id" = "AuditLog"."jobId")
    `);
  }

  await prisma.$executeRawUnsafe(`
    UPDATE "AuditLog"
    SET
      "scopeType" = COALESCE(NULLIF("scopeType", ''), 'user'),
      "scopeId" = COALESCE(NULLIF("scopeId", ''), "actorUserId"),
      "objectType" = COALESCE(NULLIF("objectType", ''), CASE WHEN "jobId" IS NOT NULL THEN 'job' ELSE 'audit_log' END),
      "objectId" = COALESCE(NULLIF("objectId", ''), COALESCE("jobId", "id"))
    WHERE
      "scopeType" IS NULL OR
      "scopeType" = '' OR
      "scopeId" IS NULL OR
      "scopeId" = '' OR
      "objectType" IS NULL OR
      "objectType" = '' OR
      "objectType" = 'unknown' OR
      "objectId" IS NULL OR
      "objectId" = ''
  `);
}

export async function initializeAuditPersistence(
  prisma: JixiaPrismaClient,
): Promise<void> {
  await initializeSpacePersistence(prisma);
  await prisma.$executeRawUnsafe('PRAGMA foreign_keys = ON');
  const hasJobTable = await tableExists(prisma, 'Job');
  const jobForeignKeyConstraint = hasJobTable
    ? ',\n      CONSTRAINT "AuditLog_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job" ("id") ON DELETE SET NULL ON UPDATE CASCADE'
    : '';

  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "AuditLog" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "spaceId" TEXT NOT NULL,
      "scopeType" TEXT NOT NULL DEFAULT 'user',
      "scopeId" TEXT NOT NULL,
      "objectType" TEXT NOT NULL,
      "objectId" TEXT NOT NULL,
      "projectId" TEXT,
      "actorUserId" TEXT NOT NULL,
      "jobId" TEXT,
      "action" TEXT NOT NULL,
      "detail" TEXT NOT NULL,
      "metadataJson" TEXT,
      "recordedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "AuditLog_spaceId_fkey" FOREIGN KEY ("spaceId") REFERENCES "Space" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
      CONSTRAINT "AuditLog_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE${jobForeignKeyConstraint}
    )
  `);
  await ensureColumnIfMissing(
    prisma,
    'AuditLog',
    'scopeType',
    "TEXT NOT NULL DEFAULT 'user'",
  );
  await ensureColumnIfMissing(
    prisma,
    'AuditLog',
    'scopeId',
    "TEXT NOT NULL DEFAULT ''",
  );
  await ensureColumnIfMissing(
    prisma,
    'AuditLog',
    'objectType',
    "TEXT NOT NULL DEFAULT 'unknown'",
  );
  await ensureColumnIfMissing(
    prisma,
    'AuditLog',
    'objectId',
    "TEXT NOT NULL DEFAULT ''",
  );
  await ensureColumnIfMissing(prisma, 'AuditLog', 'projectId', 'TEXT');
  await ensureColumnIfMissing(prisma, 'AuditLog', 'metadataJson', 'TEXT');

  await backfillGenericAuditColumns(prisma);
  await rebuildAuditLogJobForeignKey(prisma);
  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "AuditLog_jobId_idx" ON "AuditLog"("jobId")
  `);
  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "AuditLog_spaceId_actorUserId_idx" ON "AuditLog"("spaceId", "actorUserId")
  `);
  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "AuditLog_scopeType_scopeId_recordedAt_idx" ON "AuditLog"("scopeType", "scopeId", "recordedAt")
  `);
  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "AuditLog_objectType_objectId_recordedAt_idx" ON "AuditLog"("objectType", "objectId", "recordedAt")
  `);
  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "AuditLog_projectId_recordedAt_idx" ON "AuditLog"("projectId", "recordedAt")
  `);
  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "AuditLog_projectId_objectType_objectId_recordedAt_idx" ON "AuditLog"("projectId", "objectType", "objectId", "recordedAt")
  `);
  await assertRequiredColumns(prisma, 'AuditLog', [
    'id',
    'spaceId',
    'scopeType',
    'scopeId',
    'objectType',
    'objectId',
    'actorUserId',
    'action',
    'detail',
    'recordedAt',
  ]);
}

export function createAuditRepository(
  prisma: JixiaPrismaClient,
): AuditRepository {
  let initialized: Promise<void> | null = null;

  async function ensureInitialized(): Promise<void> {
    initialized ??= initializeAuditPersistence(prisma);

    await initialized;
  }

  return {
    async createAuditRecord(
      input: CreatePersistedAuditRecordParams,
    ): Promise<PersistedGovernanceAuditRecord> {
      await ensureInitialized();

      return insertGovernanceAuditRecord(prisma, input);
    },
    async listAuditRecordsByJob(
      jobId: string,
    ): Promise<PersistedGovernanceAuditRecord[]> {
      await ensureInitialized();

      const records = await prisma.auditLog.findMany({
        orderBy: [{ recordedAt: 'asc' }, { id: 'asc' }],
        where: { jobId },
      });

      return records.map(mapGovernanceAuditRecord);
    },
    async listAuditRecordsByProject(
      query: ListProjectAuditRecordsQuery,
    ): Promise<PersistedGovernanceAuditRecord[]> {
      await ensureInitialized();

      const records = await prisma.auditLog.findMany({
        orderBy: [{ recordedAt: 'asc' }, { id: 'asc' }],
        where: {
          projectId: query.projectId,
          ...(query.objectType ? { objectType: query.objectType } : {}),
          ...(query.objectId ? { objectId: query.objectId } : {}),
        },
      });

      return records.map(mapGovernanceAuditRecord);
    },
  };
}
