import type { JobRecord } from '@shared/contracts/jobs';

import type { JobBus } from './job-bus';
import type { AuditService } from '../services/audit.service';
import type { StoredCredential } from '../services/credentials.service';

export interface StoredJob extends JobRecord {
  payload: string;
  requestedByUserId: string;
  spaceId: string;
}

export interface JobRunnerStore {
  auditService: AuditService;
  credentials: StoredCredential[];
  jobBus: JobBus;
  jobs: StoredJob[];
  nextId(prefix: string): string;
  persist(): void;
}

export interface JobRunner {
  run(jobId: string): Promise<JobRecord>;
}

function findJob(store: JobRunnerStore, jobId: string): StoredJob {
  const job = store.jobs.find((candidate) => candidate.id === jobId);

  if (!job) {
    throw new Error(`Job ${jobId} does not exist.`);
  }

  return job;
}

export function createJobRunner(store: JobRunnerStore): JobRunner {
  return {
    async run(jobId: string): Promise<JobRecord> {
      const job = findJob(store, jobId);
      const credential = store.credentials.find(
        (candidate) => candidate.credentialRef === job.credentialRef,
      );

      if (!credential) {
        throw new Error(`Credential ${job.credentialRef} does not exist.`);
      }

      job.status = 'running';
      store.persist();
      store.jobBus.publish({
        id: store.nextId('job-event'),
        jobId: job.id,
        message: `Running ${job.kind} with ${credential.provider}.`,
        recordedAt: new Date().toISOString(),
        status: 'running',
      });

      job.status = 'succeeded';
      store.persist();
      store.jobBus.publish({
        id: store.nextId('job-event'),
        jobId: job.id,
        message: `${job.kind} completed successfully.`,
        recordedAt: new Date().toISOString(),
        status: 'succeeded',
      });
      store.auditService.createRecord({
        action: 'job.completed',
        actorUserId: job.requestedByUserId,
        detail: `Completed ${job.kind} with credential ${job.credentialRef}.`,
        jobId: job.id,
        spaceId: job.spaceId,
      });

      return {
        createdAt: job.createdAt,
        credentialRef: job.credentialRef,
        id: job.id,
        kind: job.kind,
        status: job.status,
      };
    },
  };
}
