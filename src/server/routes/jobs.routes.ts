import type { JobRecord } from '@shared/contracts/jobs';

import type { JobRunner, StoredJob } from '../jobs/job-runner';
import type { JobBus } from '../jobs/job-bus';
import type {
  AuditLogRecord,
  AuditService,
} from '../services/audit.service';
import type { StoredCredential } from '../services/credentials.service';

export interface CreateJobRequest {
  credentialRef: string;
  kind: string;
  payload: Record<string, unknown>;
  requestedByUserId: string;
  spaceId: string;
}

export interface JobsRoutes {
  createJob(input: CreateJobRequest): Promise<JobRecord>;
  listAuditRecords(jobId: string): Promise<AuditLogRecord[]>;
  runJob(jobId: string): Promise<JobRecord>;
}

export interface JobsRouteStore {
  auditService: AuditService;
  credentials: StoredCredential[];
  jobBus: JobBus;
  jobRunner: JobRunner;
  jobs: StoredJob[];
  nextId(prefix: string): string;
}

export function createJobsRoutes(store: JobsRouteStore): JobsRoutes {
  return {
    async createJob(input: CreateJobRequest): Promise<JobRecord> {
      const credential = store.credentials.find(
        (candidate) => candidate.credentialRef === input.credentialRef,
      );

      if (!credential) {
        throw new Error(`Credential ${input.credentialRef} does not exist.`);
      }

      const job: StoredJob = {
        createdAt: new Date().toISOString(),
        credentialRef: input.credentialRef,
        id: store.nextId('job'),
        kind: input.kind,
        payload: JSON.stringify(input.payload),
        requestedByUserId: input.requestedByUserId,
        spaceId: input.spaceId,
        status: 'queued',
      };

      store.jobs.push(job);
      store.jobBus.publish({
        id: store.nextId('job-event'),
        jobId: job.id,
        message: `${job.kind} queued for execution.`,
        recordedAt: new Date().toISOString(),
        status: 'queued',
      });
      store.auditService.createRecord({
        action: 'job.created',
        actorUserId: input.requestedByUserId,
        detail: `Created ${job.kind} with credential ${credential.credentialRef}.`,
        jobId: job.id,
        spaceId: input.spaceId,
      });

      return {
        createdAt: job.createdAt,
        credentialRef: job.credentialRef,
        id: job.id,
        kind: job.kind,
        status: job.status,
      };
    },
    async listAuditRecords(jobId: string): Promise<AuditLogRecord[]> {
      return store.auditService.listByJob(jobId);
    },
    runJob(jobId: string): Promise<JobRecord> {
      return store.jobRunner.run(jobId);
    },
  };
}
