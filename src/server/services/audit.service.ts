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
  jobId?: string;
  spaceId: string;
}

export interface AuditStore {
  auditLogs: AuditLogRecord[];
  nextId(prefix: string): string;
  persist(): void;
}

export interface AuditService {
  createRecord(input: CreateAuditRecordRequest): AuditLogRecord;
  listByJob(jobId: string): AuditLogRecord[];
}

export function createAuditService(store: AuditStore): AuditService {
  return {
    createRecord(input: CreateAuditRecordRequest): AuditLogRecord {
      const record: AuditLogRecord = {
        action: input.action,
        actorUserId: input.actorUserId,
        detail: input.detail,
        id: store.nextId('audit'),
        jobId: input.jobId,
        recordedAt: new Date().toISOString(),
        spaceId: input.spaceId,
      };

      store.auditLogs.push(record);
      store.persist();

      return record;
    },
    listByJob(jobId: string): AuditLogRecord[] {
      return store.auditLogs.filter((record) => record.jobId === jobId);
    },
  };
}
