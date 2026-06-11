import {
  type AiResultArtifact,
  type Prisma,
} from '@prisma/client';

import type { JixiaPrismaClient } from '../client';
import { initializeJobPersistence } from './job.repository';

export type PersistedAiResultScopeType = 'user' | 'project';

export interface PersistedAiResultScopeRef {
  id: string;
  type: PersistedAiResultScopeType;
}

export type PersistedAiResultArtifactStatus = 'draft' | 'applied' | 'discarded';

export interface PersistedAiResultDocumentContent {
  blocks: unknown[];
  schemaVersion: number;
}

export interface PersistedAiResultProvenance {
  contextItemIds?: string[];
  contextPackId?: string;
  generatedInsightIds?: string[];
  paperAssetIds?: string[];
  projectDocCitationIds?: string[];
  projectDocIds?: string[];
  projectDocVersionIds?: string[];
  projectLibraryEntryIds?: string[];
  readerExcerptIds?: string[];
}

export type PersistedAiResultAppliedTarget =
  | {
      notebookDocumentId: string;
      notebookVersionId: string;
      notebookVersionNumber: number;
      type: 'notebookDocument';
    }
  | {
      projectDocId: string;
      projectDocVersionId: string;
      projectDocVersionNumber: number;
      projectId: string;
      type: 'projectDoc';
    };

export interface CreateAiResultArtifactParams {
  createdAt?: string;
  createdByUserId: string;
  documentContent?: PersistedAiResultDocumentContent;
  id?: string;
  jobId: string;
  kind: string;
  plainTextPreview?: string;
  projectId?: string;
  provenance: PersistedAiResultProvenance;
  scope: PersistedAiResultScopeRef;
  summary?: string;
  title?: string;
}

export interface MarkAiResultArtifactAppliedParams {
  appliedAt?: string;
  appliedTarget: PersistedAiResultAppliedTarget;
  resultId: string;
}

export interface PersistedAiResultArtifactRecord {
  appliedAt?: string;
  appliedTarget?: PersistedAiResultAppliedTarget;
  createdAt: string;
  createdByUserId: string;
  documentContent?: PersistedAiResultDocumentContent;
  id: string;
  jobId: string;
  kind: string;
  plainTextPreview?: string;
  projectId?: string;
  provenance: PersistedAiResultProvenance;
  scope: PersistedAiResultScopeRef;
  status: PersistedAiResultArtifactStatus;
  summary?: string;
  title?: string;
  updatedAt: string;
}

export interface AiResultArtifactRepository {
  createArtifact(
    input: CreateAiResultArtifactParams,
  ): Promise<PersistedAiResultArtifactRecord>;
  getArtifact(resultId: string): Promise<PersistedAiResultArtifactRecord | null>;
  listArtifactsForScope(
    scope: PersistedAiResultScopeRef,
  ): Promise<PersistedAiResultArtifactRecord[]>;
  markArtifactApplied(
    input: MarkAiResultArtifactAppliedParams,
  ): Promise<PersistedAiResultArtifactRecord>;
  markArtifactDiscarded(resultId: string): Promise<PersistedAiResultArtifactRecord>;
}

type TransactionClient = Prisma.TransactionClient;

type AiResultArtifactClient = JixiaPrismaClient | TransactionClient;

const PROVENANCE_ARRAY_KEYS = [
  'contextItemIds',
  'generatedInsightIds',
  'paperAssetIds',
  'projectDocCitationIds',
  'projectDocIds',
  'projectDocVersionIds',
  'projectLibraryEntryIds',
  'readerExcerptIds',
] as const;

function toIsoString(value: Date): string {
  return value.toISOString();
}

function optionalDate(value: string | undefined): Date | undefined {
  return value ? new Date(value) : undefined;
}

function optionalIsoString(value: Date | null): string | undefined {
  return value ? toIsoString(value) : undefined;
}

function normalizeScopeType(rawScopeType: string): PersistedAiResultScopeType {
  if (rawScopeType === 'user' || rawScopeType === 'project') {
    return rawScopeType;
  }

  throw new Error(`AI result scope type ${rawScopeType} is not supported.`);
}

function normalizeStatus(rawStatus: string): PersistedAiResultArtifactStatus {
  if (rawStatus === 'draft' || rawStatus === 'applied' || rawStatus === 'discarded') {
    return rawStatus;
  }

  throw new Error(`AI result status ${rawStatus} is not supported.`);
}

function parseJsonObject(value: string | null, path: string): Record<string, unknown> | undefined {
  if (!value) {
    return undefined;
  }

  const parsed = JSON.parse(value) as unknown;

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    throw new Error(`${path} must be a JSON object.`);
  }

  return parsed as Record<string, unknown>;
}

function normalizeIdArray(value: unknown, path: string): string[] | undefined {
  if (typeof value === 'undefined') {
    return undefined;
  }

  if (!Array.isArray(value)) {
    throw new Error(`${path} must be an array when provided.`);
  }

  const ids = value
    .map((item) => {
      if (typeof item !== 'string') {
        throw new Error(`${path} must contain strings only.`);
      }

      return item.trim();
    })
    .filter((item) => item.length > 0);

  return ids.length > 0 ? [...new Set(ids)] : undefined;
}

function normalizeProvenance(value: unknown): PersistedAiResultProvenance {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return {};
  }

  const record = value as Record<string, unknown>;
  const provenance: PersistedAiResultProvenance = {};
  const contextPackId = typeof record.contextPackId === 'string'
    ? record.contextPackId.trim()
    : '';

  if (contextPackId) {
    provenance.contextPackId = contextPackId;
  }

  for (const key of PROVENANCE_ARRAY_KEYS) {
    const normalized = normalizeIdArray(record[key], `provenance.${key}`);

    if (normalized) {
      provenance[key] = normalized;
    }
  }

  return provenance;
}

function normalizeAppliedTarget(
  value: Record<string, unknown> | undefined,
): PersistedAiResultAppliedTarget | undefined {
  if (!value) {
    return undefined;
  }

  if (value.type === 'notebookDocument') {
    if (
      typeof value.notebookDocumentId !== 'string' ||
      typeof value.notebookVersionId !== 'string' ||
      typeof value.notebookVersionNumber !== 'number'
    ) {
      throw new Error('Applied Notebook target is not valid.');
    }

    return {
      notebookDocumentId: value.notebookDocumentId,
      notebookVersionId: value.notebookVersionId,
      notebookVersionNumber: value.notebookVersionNumber,
      type: 'notebookDocument',
    };
  }

  if (value.type === 'projectDoc') {
    if (
      typeof value.projectDocId !== 'string' ||
      typeof value.projectDocVersionId !== 'string' ||
      typeof value.projectDocVersionNumber !== 'number' ||
      typeof value.projectId !== 'string'
    ) {
      throw new Error('Applied Project Doc target is not valid.');
    }

    return {
      projectDocId: value.projectDocId,
      projectDocVersionId: value.projectDocVersionId,
      projectDocVersionNumber: value.projectDocVersionNumber,
      projectId: value.projectId,
      type: 'projectDoc',
    };
  }

  throw new Error('Applied AI result target type is not supported.');
}

function mapArtifact(artifact: AiResultArtifact): PersistedAiResultArtifactRecord {
  return {
    appliedAt: optionalIsoString(artifact.appliedAt),
    appliedTarget: normalizeAppliedTarget(
      parseJsonObject(artifact.appliedTargetJson, 'appliedTarget'),
    ),
    createdAt: toIsoString(artifact.createdAt),
    createdByUserId: artifact.createdByUserId,
    documentContent: parseJsonObject(
      artifact.documentContent,
      'documentContent',
    ) as PersistedAiResultDocumentContent | undefined,
    id: artifact.id,
    jobId: artifact.jobId,
    kind: artifact.kind,
    plainTextPreview: artifact.plainTextPreview ?? undefined,
    projectId: artifact.projectId ?? undefined,
    provenance: normalizeProvenance(
      parseJsonObject(artifact.provenanceJson, 'provenance') ?? {},
    ),
    scope: {
      id: artifact.scopeId,
      type: normalizeScopeType(artifact.scopeType),
    },
    status: normalizeStatus(artifact.status),
    summary: artifact.summary ?? undefined,
    title: artifact.title ?? undefined,
    updatedAt: toIsoString(artifact.updatedAt),
  };
}

async function ensureUser(
  prisma: AiResultArtifactClient,
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

export async function initializeAiResultArtifactPersistence(
  prisma: JixiaPrismaClient,
): Promise<void> {
  await initializeJobPersistence(prisma);
  await prisma.$executeRawUnsafe('PRAGMA foreign_keys = ON');
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "AiResultArtifact" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "jobId" TEXT NOT NULL,
      "kind" TEXT NOT NULL,
      "scopeType" TEXT NOT NULL,
      "scopeId" TEXT NOT NULL,
      "projectId" TEXT,
      "createdByUserId" TEXT NOT NULL,
      "status" TEXT NOT NULL,
      "title" TEXT,
      "summary" TEXT,
      "documentContent" TEXT,
      "plainTextPreview" TEXT,
      "provenanceJson" TEXT NOT NULL,
      "appliedTargetJson" TEXT,
      "appliedAt" DATETIME,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "AiResultArtifact_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
      CONSTRAINT "AiResultArtifact_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
    )
  `);
  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "AiResultArtifact_jobId_idx" ON "AiResultArtifact"("jobId")
  `);
  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "AiResultArtifact_createdByUserId_createdAt_idx" ON "AiResultArtifact"("createdByUserId", "createdAt")
  `);
  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "AiResultArtifact_scopeType_scopeId_createdAt_idx" ON "AiResultArtifact"("scopeType", "scopeId", "createdAt")
  `);
  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "AiResultArtifact_projectId_createdAt_idx" ON "AiResultArtifact"("projectId", "createdAt")
  `);
  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "AiResultArtifact_status_createdAt_idx" ON "AiResultArtifact"("status", "createdAt")
  `);
}

export function createAiResultArtifactRepository(
  prisma: JixiaPrismaClient,
): AiResultArtifactRepository {
  let initialized: Promise<void> | null = null;

  async function ensureInitialized(): Promise<void> {
    initialized ??= initializeAiResultArtifactPersistence(prisma);

    await initialized;
  }

  return {
    async createArtifact(
      input: CreateAiResultArtifactParams,
    ): Promise<PersistedAiResultArtifactRecord> {
      await ensureInitialized();
      await ensureUser(prisma, input.createdByUserId);

      const artifact = await prisma.aiResultArtifact.create({
        data: {
          createdAt: optionalDate(input.createdAt),
          createdByUserId: input.createdByUserId,
          documentContent: input.documentContent
            ? JSON.stringify(input.documentContent)
            : undefined,
          id: input.id,
          jobId: input.jobId,
          kind: input.kind,
          plainTextPreview: input.plainTextPreview,
          projectId: input.projectId,
          provenanceJson: JSON.stringify(input.provenance),
          scopeId: input.scope.id,
          scopeType: input.scope.type,
          status: 'draft',
          summary: input.summary,
          title: input.title,
        },
      });

      return mapArtifact(artifact);
    },
    async getArtifact(resultId: string): Promise<PersistedAiResultArtifactRecord | null> {
      await ensureInitialized();

      const artifact = await prisma.aiResultArtifact.findUnique({
        where: { id: resultId },
      });

      return artifact ? mapArtifact(artifact) : null;
    },
    async listArtifactsForScope(
      scope: PersistedAiResultScopeRef,
    ): Promise<PersistedAiResultArtifactRecord[]> {
      await ensureInitialized();

      const artifacts = await prisma.aiResultArtifact.findMany({
        orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
        where: {
          scopeId: scope.id,
          scopeType: scope.type,
        },
      });

      return artifacts.map(mapArtifact);
    },
    async markArtifactApplied(
      input: MarkAiResultArtifactAppliedParams,
    ): Promise<PersistedAiResultArtifactRecord> {
      await ensureInitialized();

      const artifact = await prisma.aiResultArtifact.update({
        data: {
          appliedAt: optionalDate(input.appliedAt) ?? new Date(),
          appliedTargetJson: JSON.stringify(input.appliedTarget),
          status: 'applied',
        },
        where: { id: input.resultId },
      });

      return mapArtifact(artifact);
    },
    async markArtifactDiscarded(resultId: string): Promise<PersistedAiResultArtifactRecord> {
      await ensureInitialized();

      const updateResult = await prisma.aiResultArtifact.updateMany({
        data: { status: 'discarded' },
        where: { id: resultId, status: 'draft' },
      });

      const artifact = await prisma.aiResultArtifact.findUnique({
        where: { id: resultId },
      });

      if (!artifact) {
        throw new Error(`AI result artifact ${resultId} does not exist.`);
      }

      if (updateResult.count !== 1) {
        throw new Error(`AI result artifact ${resultId} is already ${artifact.status}.`);
      }

      return mapArtifact(artifact);
    },
  };
}
