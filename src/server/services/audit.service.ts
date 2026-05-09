import type {
  CreateAuditRecordParams,
  JobRepository,
} from '../../db';

export interface AuditLogRecord {
  action: string;
  actorUserId: string;
  detail: string;
  id: string;
  jobId?: string;
  recordedAt: string;
  spaceId: string;
}

export interface CreateAuditRecordRequest {
  action: string;
  actorUserId: string;
  detail: string;
  id?: string;
  jobId?: string;
  spaceId: string;
}

export interface AuditStore {
  jobRepository: JobRepository;
  nextId(prefix: string): string;
}

export interface AuditService {
  createRecord(input: CreateAuditRecordRequest): Promise<AuditLogRecord>;
  listByJob(jobId: string): Promise<AuditLogRecord[]>;
}

export function createAuditService(store: AuditStore): AuditService {
  return {
    async createRecord(input: CreateAuditRecordRequest): Promise<AuditLogRecord> {
      const record: CreateAuditRecordParams = {
        action: input.action,
        actorUserId: input.actorUserId,
        detail: input.detail,
        id: input.id ?? store.nextId('audit'),
        jobId: input.jobId,
        recordedAt: new Date().toISOString(),
        spaceId: input.spaceId,
      };

      return store.jobRepository.createAuditRecord(record);
    },
    listByJob(jobId: string): Promise<AuditLogRecord[]> {
      return store.jobRepository.listAuditRecordsByJob(jobId);
    },
  };
}
