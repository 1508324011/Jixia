import {
  type AuditLog,
  type Job,
  type JobEvent,
  type JobStatus,
  type Prisma,
  type ProviderCredential,
} from '@prisma/client';

import type { JixiaPrismaClient } from '../client';
import { initializeSpacePersistence } from './space.repository';

export type PersistedJobStatus =
  | 'queued'
  | 'running'
  | 'succeeded'
  | 'failed'
  | 'cancelled';

export type PersistedJobScopeType = 'user' | 'project';

export interface PersistedJobScopeRef {
  id: string;
  type: PersistedJobScopeType;
}

export interface JobLookup {
  jobId: string;
}

export interface CreateProviderCredentialReferenceParams {
  createdAt?: string;
  credentialRef: string;
  provider: string;
  secretRef: string;
  userId: string;
}

export interface PersistedProviderCredentialReferenceRecord {
  createdAt: string;
  credentialRef: string;
  provider: string;
  secretRef: string;
  updatedAt: string;
  userId: string;
}

export interface CreateJobParams {
  credentialRef: string;
  id?: string;
  kind: string;
  payload: string;
  requestedByUserId: string;
  scope: PersistedJobScopeRef;
  spaceId: string;
}

export interface AppendJobEventParams {
  id?: string;
  jobId: string;
  message: string;
  recordedAt?: string;
  status: PersistedJobStatus;
}

export interface CreateAuditRecordParams {
  action: string;
  actorUserId: string;
  detail: string;
  id?: string;
  jobId?: string;
  recordedAt?: string;
  spaceId: string;
}

export interface CreateQueuedJobWithAuditParams {
  audit: Omit<CreateAuditRecordParams, 'jobId' | 'spaceId'> & {
    id?: string;
  };
  event: Omit<AppendJobEventParams, 'jobId'> & {
    id?: string;
  };
  job: CreateJobParams;
}

export interface PersistedJobRecord {
  createdAt: string;
  credentialRef: string;
  id: string;
  kind: string;
  payload: string;
  requestedByUserId: string;
  scope: PersistedJobScopeRef;
  spaceId: string;
  status: PersistedJobStatus;
  updatedAt: string;
}

export interface PersistedJobEventRecord {
  id: string;
  jobId: string;
  message: string;
  recordedAt: string;
  status: PersistedJobStatus;
}

export interface PersistedAuditLogRecord {
  action: string;
  actorUserId: string;
  detail: string;
  id: string;
  jobId?: string;
  recordedAt: string;
  spaceId: string;
}

export interface PersistedQueuedJobWithAudit {
  audit: PersistedAuditLogRecord;
  event: PersistedJobEventRecord;
  job: PersistedJobRecord;
}

export interface ListJobsForScopeQuery {
  scope: PersistedJobScopeRef;
  spaceId?: string;
}

export interface JobRepository {
  appendJobEvent(
    input: AppendJobEventParams,
  ): Promise<PersistedJobEventRecord>;
  createAuditRecord(
    input: CreateAuditRecordParams,
  ): Promise<PersistedAuditLogRecord>;
  createProviderCredentialReference(
    input: CreateProviderCredentialReferenceParams,
  ): Promise<PersistedProviderCredentialReferenceRecord>;
  createQueuedJobWithAudit(
    input: CreateQueuedJobWithAuditParams,
  ): Promise<PersistedQueuedJobWithAudit>;
  getJob(query: JobLookup): Promise<PersistedJobRecord | null>;
  getProviderCredentialReference(
    credentialRef: string,
  ): Promise<PersistedProviderCredentialReferenceRecord | null>;
  listAuditRecordsByJob(jobId: string): Promise<PersistedAuditLogRecord[]>;
  listJobEvents(jobId: string): Promise<PersistedJobEventRecord[]>;
  listJobsForScope(
    query: ListJobsForScopeQuery,
  ): Promise<PersistedJobRecord[]>;
  updateJobStatus(
    jobId: string,
    status: PersistedJobStatus,
  ): Promise<PersistedJobRecord>;
}

type TransactionClient = Prisma.TransactionClient;

type JobClient = JixiaPrismaClient | TransactionClient;

async function readTableColumns(
  prisma: JixiaPrismaClient,
  tableName: string,
): Promise<Set<string>> {
  const columns = await prisma.$queryRawUnsafe<Array<{ name: string }>>(
    `PRAGMA table_info("${tableName}")`,
  );

  return new Set(columns.map((column) => column.name));
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
        `Job persistence requires ${tableName}.${requiredColumn}. Existing SQLite schema is too old and must be migrated before serving governed jobs.`,
      );
    }
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

async function ensureJobScopeColumns(
  prisma: JixiaPrismaClient,
): Promise<void> {
  await ensureColumnIfMissing(
    prisma,
    'Job',
    'scopeType',
    "TEXT NOT NULL DEFAULT 'user'",
  );
  await ensureColumnIfMissing(
    prisma,
    'Job',
    'scopeId',
    "TEXT NOT NULL DEFAULT ''",
  );
  await prisma.$executeRawUnsafe(`
    UPDATE "Job"
    SET
      "scopeType" = COALESCE(NULLIF("scopeType", ''), 'user'),
      "scopeId" = COALESCE(NULLIF("scopeId", ''), "requestedByUserId")
    WHERE
      "scopeType" IS NULL OR
      "scopeType" = '' OR
      "scopeId" IS NULL OR
      "scopeId" = ''
  `);
}

function toIsoString(value: Date): string {
  return value.toISOString();
}

function optionalDate(value: string | undefined): Date | undefined {
  return value ? new Date(value) : undefined;
}

function normalizeScopeType(rawScopeType: string): PersistedJobScopeType {
  if (rawScopeType === 'user' || rawScopeType === 'project') {
    return rawScopeType;
  }

  throw new Error(
    `Persisted job scope type ${rawScopeType} is not supported. Jobs must be migrated to canonical user/project scope before serving requests.`,
  );
}

function mapJob(job: Job): PersistedJobRecord {
  return {
    createdAt: toIsoString(job.createdAt),
    credentialRef: job.credentialRef,
    id: job.id,
    kind: job.kind,
    payload: job.payload,
    requestedByUserId: job.requestedByUserId,
    scope: {
      id: job.scopeId,
      type: normalizeScopeType(job.scopeType),
    },
    spaceId: job.spaceId,
    status: job.status,
    updatedAt: toIsoString(job.updatedAt),
  };
}

function mapJobEvent(event: JobEvent): PersistedJobEventRecord {
  return {
    id: event.id,
    jobId: event.jobId,
    message: event.message,
    recordedAt: toIsoString(event.recordedAt),
    status: event.status,
  };
}

function mapAuditLog(record: AuditLog): PersistedAuditLogRecord {
  return {
    action: record.action,
    actorUserId: record.actorUserId,
    detail: record.detail,
    id: record.id,
    jobId: record.jobId ?? undefined,
    recordedAt: toIsoString(record.recordedAt),
    spaceId: record.spaceId,
  };
}

function mapProviderCredential(
  credential: ProviderCredential,
): PersistedProviderCredentialReferenceRecord {
  return {
    createdAt: toIsoString(credential.createdAt),
    credentialRef: credential.id,
    provider: credential.provider,
    secretRef: credential.secretRef,
    updatedAt: toIsoString(credential.updatedAt),
    userId: credential.userId,
  };
}

async function ensureUser(prisma: JobClient, userId: string): Promise<void> {
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

async function insertJobEvent(
  prisma: JobClient,
  input: AppendJobEventParams,
): Promise<PersistedJobEventRecord> {
  const event = await prisma.jobEvent.create({
    data: {
      id: input.id,
      jobId: input.jobId,
      message: input.message,
      recordedAt: optionalDate(input.recordedAt),
      status: input.status as JobStatus,
    },
  });

  return mapJobEvent(event);
}

async function insertAuditRecord(
  prisma: JobClient,
  input: CreateAuditRecordParams,
): Promise<PersistedAuditLogRecord> {
  await ensureUser(prisma, input.actorUserId);

  const record = await prisma.auditLog.create({
    data: {
      action: input.action,
      actorUserId: input.actorUserId,
      detail: input.detail,
      id: input.id,
      jobId: input.jobId,
      recordedAt: optionalDate(input.recordedAt),
      spaceId: input.spaceId,
    },
  });

  return mapAuditLog(record);
}

export async function initializeJobPersistence(
  prisma: JixiaPrismaClient,
): Promise<void> {
  await initializeSpacePersistence(prisma);
  await prisma.$executeRawUnsafe('PRAGMA foreign_keys = ON');
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "ProviderCredential" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "userId" TEXT NOT NULL,
      "provider" TEXT NOT NULL,
      "secretRef" TEXT NOT NULL,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "ProviderCredential_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
    )
  `);
  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "ProviderCredential_userId_provider_idx" ON "ProviderCredential"("userId", "provider")
  `);
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "Job" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "spaceId" TEXT NOT NULL,
      "scopeType" TEXT NOT NULL DEFAULT 'user',
      "scopeId" TEXT NOT NULL,
      "requestedByUserId" TEXT NOT NULL,
      "credentialRef" TEXT NOT NULL,
      "kind" TEXT NOT NULL,
      "status" TEXT NOT NULL,
      "payload" TEXT NOT NULL,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "Job_spaceId_fkey" FOREIGN KEY ("spaceId") REFERENCES "Space" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
      CONSTRAINT "Job_requestedByUserId_fkey" FOREIGN KEY ("requestedByUserId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
      CONSTRAINT "Job_credentialRef_fkey" FOREIGN KEY ("credentialRef") REFERENCES "ProviderCredential" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
    )
  `);
  await ensureJobScopeColumns(prisma);
  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "Job_spaceId_requestedByUserId_idx" ON "Job"("spaceId", "requestedByUserId")
  `);
  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "Job_requestedByUserId_idx" ON "Job"("requestedByUserId")
  `);
  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "Job_scopeType_scopeId_idx" ON "Job"("scopeType", "scopeId")
  `);
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "JobEvent" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "jobId" TEXT NOT NULL,
      "status" TEXT NOT NULL,
      "message" TEXT NOT NULL,
      "recordedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "JobEvent_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job" ("id") ON DELETE CASCADE ON UPDATE CASCADE
    )
  `);
  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "JobEvent_jobId_idx" ON "JobEvent"("jobId")
  `);
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "AuditLog" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "spaceId" TEXT NOT NULL,
      "actorUserId" TEXT NOT NULL,
      "jobId" TEXT,
      "action" TEXT NOT NULL,
      "detail" TEXT NOT NULL,
      "recordedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "AuditLog_spaceId_fkey" FOREIGN KEY ("spaceId") REFERENCES "Space" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
      CONSTRAINT "AuditLog_actorUserId_fkey" FOREIGN KEY ("actorUserId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
      CONSTRAINT "AuditLog_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job" ("id") ON DELETE SET NULL ON UPDATE CASCADE
    )
  `);
  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "AuditLog_jobId_idx" ON "AuditLog"("jobId")
  `);
  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "AuditLog_spaceId_actorUserId_idx" ON "AuditLog"("spaceId", "actorUserId")
  `);

  await assertRequiredColumns(prisma, 'ProviderCredential', [
    'id',
    'userId',
    'provider',
    'secretRef',
  ]);
  await assertRequiredColumns(prisma, 'Job', [
    'id',
    'spaceId',
    'scopeType',
    'scopeId',
    'requestedByUserId',
    'credentialRef',
    'kind',
    'status',
    'payload',
  ]);
  await assertRequiredColumns(prisma, 'JobEvent', [
    'id',
    'jobId',
    'status',
    'message',
    'recordedAt',
  ]);
  await assertRequiredColumns(prisma, 'AuditLog', [
    'id',
    'spaceId',
    'actorUserId',
    'action',
    'detail',
    'recordedAt',
  ]);
}

export function createJobRepository(
  prisma: JixiaPrismaClient,
): JobRepository {
  let initialized: Promise<void> | null = null;

  async function ensureInitialized(): Promise<void> {
    initialized ??= initializeJobPersistence(prisma);

    await initialized;
  }

  return {
    async appendJobEvent(
      input: AppendJobEventParams,
    ): Promise<PersistedJobEventRecord> {
      await ensureInitialized();

      return insertJobEvent(prisma, input);
    },
    async createAuditRecord(
      input: CreateAuditRecordParams,
    ): Promise<PersistedAuditLogRecord> {
      await ensureInitialized();

      return insertAuditRecord(prisma, input);
    },
    async createProviderCredentialReference(
      input: CreateProviderCredentialReferenceParams,
    ): Promise<PersistedProviderCredentialReferenceRecord> {
      await ensureInitialized();
      await ensureUser(prisma, input.userId);

      const existingCredential = await prisma.providerCredential.findUnique({
        where: { id: input.credentialRef },
      });

      if (existingCredential && existingCredential.userId !== input.userId) {
        throw new Error(
          `Credential ${input.credentialRef} already belongs to another user.`,
        );
      }

      const credential = existingCredential
        ? await prisma.providerCredential.update({
            data: {
              provider: input.provider,
              secretRef: input.secretRef,
              updatedAt: new Date(),
            },
            where: { id: input.credentialRef },
          })
        : await prisma.providerCredential.create({
            data: {
              createdAt: optionalDate(input.createdAt),
              id: input.credentialRef,
              provider: input.provider,
              secretRef: input.secretRef,
              userId: input.userId,
            },
          });

      return mapProviderCredential(credential);
    },
    async createQueuedJobWithAudit(
      input: CreateQueuedJobWithAuditParams,
    ): Promise<PersistedQueuedJobWithAudit> {
      await ensureInitialized();

      return prisma.$transaction(async (transaction) => {
        await ensureUser(transaction, input.job.requestedByUserId);

        const job = await transaction.job.create({
          data: {
            credentialRef: input.job.credentialRef,
            id: input.job.id,
            kind: input.job.kind,
            payload: input.job.payload,
            requestedByUserId: input.job.requestedByUserId,
            scopeId: input.job.scope.id,
            scopeType: input.job.scope.type,
            spaceId: input.job.spaceId,
            status: 'queued',
          },
        });
        const event = await insertJobEvent(transaction, {
          ...input.event,
          jobId: job.id,
          status: 'queued',
        });
        const audit = await insertAuditRecord(transaction, {
          ...input.audit,
          jobId: job.id,
          spaceId: job.spaceId,
        });

        return {
          audit,
          event,
          job: mapJob(job),
        };
      });
    },
    async getJob(query: JobLookup): Promise<PersistedJobRecord | null> {
      await ensureInitialized();

      const job = await prisma.job.findUnique({ where: { id: query.jobId } });

      return job ? mapJob(job) : null;
    },
    async getProviderCredentialReference(
      credentialRef: string,
    ): Promise<PersistedProviderCredentialReferenceRecord | null> {
      await ensureInitialized();

      const credential = await prisma.providerCredential.findUnique({
        where: { id: credentialRef },
      });

      return credential ? mapProviderCredential(credential) : null;
    },
    async listAuditRecordsByJob(
      jobId: string,
    ): Promise<PersistedAuditLogRecord[]> {
      await ensureInitialized();

      const records = await prisma.auditLog.findMany({
        orderBy: { recordedAt: 'asc' },
        where: { jobId },
      });

      return records.map(mapAuditLog);
    },
    async listJobEvents(jobId: string): Promise<PersistedJobEventRecord[]> {
      await ensureInitialized();

      const events = await prisma.jobEvent.findMany({
        orderBy: { recordedAt: 'asc' },
        where: { jobId },
      });

      return events.map(mapJobEvent);
    },
    async listJobsForScope(
      query: ListJobsForScopeQuery,
    ): Promise<PersistedJobRecord[]> {
      await ensureInitialized();

      const jobs = await prisma.job.findMany({
        orderBy: { createdAt: 'asc' },
        where: {
          scopeId: query.scope.id,
          scopeType: query.scope.type,
          ...(query.spaceId ? { spaceId: query.spaceId } : {}),
        },
      });

      return jobs.map(mapJob);
    },
    async updateJobStatus(
      jobId: string,
      status: PersistedJobStatus,
    ): Promise<PersistedJobRecord> {
      await ensureInitialized();

      const job = await prisma.job.update({
        data: {
          status: status as JobStatus,
          updatedAt: new Date(),
        },
        where: { id: jobId },
      });

      return mapJob(job);
    },
  };
}
