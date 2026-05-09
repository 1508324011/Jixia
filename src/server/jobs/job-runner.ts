import type { JobRecord } from '@shared/contracts/jobs';

import type { JobRepository } from '../../db';

import type { JobBus } from './job-bus';
import type { AuditService } from '../services/audit.service';

export interface JobRunnerStore {
  auditService: AuditService;
  jobBus: JobBus;
  jobRepository: JobRepository;
  nextId(prefix: string): string;
}

export interface JobRunner {
  run(jobId: string): Promise<JobRecord>;
}

export function createJobRunner(store: JobRunnerStore): JobRunner {
  return {
    async run(jobId: string): Promise<JobRecord> {
      const job = await store.jobRepository.getJob({ jobId });

      if (!job) {
        throw new Error(`Job ${jobId} does not exist.`);
      }

      const credential = await store.jobRepository.getProviderCredentialReference(
        job.credentialRef,
      );

      if (!credential) {
        throw new Error(`Credential ${job.credentialRef} does not exist.`);
      }

      const runningEventId = store.nextId('job-event');
      const completedEventId = store.nextId('job-event');
      const completedAuditId = store.nextId('audit');

      await store.jobRepository.updateJobStatus(job.id, 'running');
      const runningEvent = await store.jobRepository.appendJobEvent({
        id: runningEventId,
        jobId: job.id,
        message: `Running ${job.kind} with ${credential.provider}.`,
        recordedAt: new Date().toISOString(),
        status: 'running',
      });
      store.jobBus.publish(runningEvent);

      const completedJob = await store.jobRepository.updateJobStatus(
        job.id,
        'succeeded',
      );
      const completedEvent = await store.jobRepository.appendJobEvent({
        id: completedEventId,
        jobId: job.id,
        message: `${job.kind} completed successfully.`,
        recordedAt: new Date().toISOString(),
        status: 'succeeded',
      });
      store.jobBus.publish(completedEvent);
      await store.auditService.createRecord({
        action: 'job.completed',
        actorUserId: job.requestedByUserId,
        detail: `Completed ${job.kind} with credential ${job.credentialRef}.`,
        id: completedAuditId,
        jobId: job.id,
        spaceId: job.spaceId,
      });

      return {
        createdAt: job.createdAt,
        credentialRef: job.credentialRef,
        id: job.id,
        kind: job.kind,
        status: completedJob.status,
      };
    },
  };
}
