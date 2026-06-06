import type { JobAuditRecord } from '@shared/contracts/jobs';
import type { GovernanceAuditRecord } from '@shared/contracts/audit';

import {
  sanitizePersistedAuditDetail,
  sanitizePersistedAuditMetadata,
} from '../../db';
import type {
  AuditRepository,
  CreatePersistedAuditRecordParams,
  ListProjectAuditRecordsQuery,
  PersistedAuditMetadata,
  PersistedGovernanceAuditRecord,
} from '../../db';

export type AuditLogRecord = JobAuditRecord;

export interface CreateAuditRecordRequest {
  action: string;
  actorUserId: string;
  detail: string;
  id?: string;
  jobId?: string;
  metadata?: Record<string, unknown>;
  object?: { id: string; type: string };
  projectId?: string;
  recordedAt?: string;
  scope?: { id: string; type: 'project' | 'user' };
  spaceId: string;
}

export interface ListProjectAuditRecordsRequest {
  objectId?: string;
  objectType?: string;
  projectId: string;
}

export interface AuditStore {
  auditRepository: AuditRepository;
  nextId(prefix: string): string;
}

export interface AuditService {
  createRecord(input: CreateAuditRecordRequest): Promise<GovernanceAuditRecord>;
  listByJob(jobId: string): Promise<AuditLogRecord[]>;
  listByProject(
    input: ListProjectAuditRecordsRequest,
  ): Promise<GovernanceAuditRecord[]>;
}

export function sanitizeAuditDetail(detail: string): string {
  return sanitizePersistedAuditDetail(detail);
}

export function sanitizeAuditMetadata(
  metadata: Record<string, unknown> | undefined,
): PersistedAuditMetadata | undefined {
  return sanitizePersistedAuditMetadata(metadata);
}

function toGovernanceAuditRecord(
  record: PersistedGovernanceAuditRecord,
): GovernanceAuditRecord {
  return {
    action: record.action,
    actorUserId: record.actorUserId,
    detail: sanitizeAuditDetail(record.detail),
    id: record.id,
    jobId: record.jobId,
    metadata: sanitizeAuditMetadata(record.metadata),
    object: record.object,
    projectId: record.projectId,
    recordedAt: record.recordedAt,
    scope: record.scope,
    spaceId: record.spaceId,
  };
}

function toJobAuditRecord(record: PersistedGovernanceAuditRecord): JobAuditRecord {
  return {
    action: record.action,
    actorUserId: record.actorUserId,
    detail: sanitizeAuditDetail(record.detail),
    id: record.id,
    jobId: record.jobId,
    recordedAt: record.recordedAt,
    spaceId: record.spaceId,
  };
}

function normalizeProjectAuditQuery(
  input: ListProjectAuditRecordsRequest,
): ListProjectAuditRecordsQuery {
  return {
    objectId: input.objectId,
    objectType: input.objectType,
    projectId: input.projectId,
  };
}

export function createAuditService(store: AuditStore): AuditService {
  return {
    async createRecord(
      input: CreateAuditRecordRequest,
    ): Promise<GovernanceAuditRecord> {
      const record: CreatePersistedAuditRecordParams = {
        action: input.action,
        actorUserId: input.actorUserId,
        detail: sanitizeAuditDetail(input.detail),
        id: input.id ?? store.nextId('audit'),
        jobId: input.jobId,
        metadata: sanitizeAuditMetadata(input.metadata),
        object: input.object ?? {
          id: input.jobId ?? input.id ?? input.action,
          type: input.jobId ? 'job' : 'audit_log',
        },
        projectId: input.projectId,
        recordedAt: input.recordedAt ?? new Date().toISOString(),
        scope: input.scope ?? {
          id: input.actorUserId,
          type: 'user',
        },
        spaceId: input.spaceId,
      };

      return toGovernanceAuditRecord(
        await store.auditRepository.createAuditRecord(record),
      );
    },
    async listByJob(jobId: string): Promise<AuditLogRecord[]> {
      const records = await store.auditRepository.listAuditRecordsByJob(jobId);

      return records.map(toJobAuditRecord);
    },
    async listByProject(
      input: ListProjectAuditRecordsRequest,
    ): Promise<GovernanceAuditRecord[]> {
      const records = await store.auditRepository.listAuditRecordsByProject(
        normalizeProjectAuditQuery(input),
      );

      return records.map(toGovernanceAuditRecord);
    },
  };
}
