import type { JobRecord } from '@shared/contracts/jobs';

import type {
  JobRepository,
  PersistedJobRecord,
  PersistedProviderCredentialReferenceRecord,
} from '../../db';

import type { JobBus } from './job-bus';

export interface RunJobRequest {
  actorUserId: string;
  jobId: string;
}

export interface CancelJobRequest {
  actorUserId: string;
  jobId: string;
}

export interface JobExecutionContext {
  credential: PersistedProviderCredentialReferenceRecord;
  job: PersistedJobRecord;
}

export type JobExecutor = (context: JobExecutionContext) => Promise<void> | void;

export interface JobRunnerStore {
  executor?: JobExecutor;
  jobBus: JobBus;
  jobRepository: JobRepository;
  nextId(prefix: string): string;
}

export interface JobRunner {
  cancel(input: CancelJobRequest): Promise<JobRecord>;
  run(input: RunJobRequest): Promise<JobRecord>;
}

function toJobRecord(job: PersistedJobRecord): JobRecord {
  return {
    createdAt: job.createdAt,
    credentialRef: job.credentialRef,
    id: job.id,
    kind: job.kind,
    scope: job.scope,
    scopeId: job.scope.id,
    scopeType: job.scope.type,
    spaceId: job.spaceId,
    status: job.status,
  };
}

async function requireOwnedCredential(
  store: JobRunnerStore,
  job: PersistedJobRecord,
  actorUserId: string,
): Promise<PersistedProviderCredentialReferenceRecord> {
  const credential = await store.jobRepository.getProviderCredentialReference(
    job.credentialRef,
  );

  if (!credential) {
    throw new Error(`Credential ${job.credentialRef} does not exist.`);
  }

  if (credential.userId !== actorUserId) {
    throw new Error('Credentials may only be used by their owner.');
  }

  return credential;
}

async function recordLifecycleTransition(
  store: JobRunnerStore,
  input: {
    action: string;
    actorUserId: string;
    detail: string;
    jobId: string;
    message: string;
    status: PersistedJobRecord['status'];
  },
): Promise<PersistedJobRecord> {
  const persisted = await store.jobRepository.recordJobLifecycleTransition({
    audit: {
      action: input.action,
      actorUserId: input.actorUserId,
      detail: input.detail,
      id: store.nextId('audit'),
      recordedAt: new Date().toISOString(),
    },
    event: {
      id: store.nextId('job-event'),
      message: input.message,
      recordedAt: new Date().toISOString(),
    },
    jobId: input.jobId,
    status: input.status,
  });

  store.jobBus.publish(persisted.event);

  return persisted.job;
}

async function getCancelledJobAfterCompetingTransition(
  store: JobRunnerStore,
  jobId: string,
  transitionError: unknown,
): Promise<PersistedJobRecord> {
  const currentJob = await store.jobRepository.getJob({ jobId });

  if (currentJob?.status === 'cancelled') {
    return currentJob;
  }

  throw transitionError;
}

export function createJobRunner(store: JobRunnerStore): JobRunner {
  const executor = store.executor ?? (() => undefined);

  return {
    async cancel(input: CancelJobRequest): Promise<JobRecord> {
      const job = await store.jobRepository.getJob({ jobId: input.jobId });

      if (!job) {
        throw new Error(`Job ${input.jobId} does not exist.`);
      }

      await requireOwnedCredential(store, job, input.actorUserId);

      const cancelledJob = await recordLifecycleTransition(store, {
        action: 'job.cancelled',
        actorUserId: input.actorUserId,
        detail: `Cancelled ${job.kind} with server-owned provider configuration.`,
        jobId: job.id,
        message: `${job.kind} cancelled before completion.`,
        status: 'cancelled',
      });

      return toJobRecord(cancelledJob);
    },
    async run(input: RunJobRequest): Promise<JobRecord> {
      const job = await store.jobRepository.getJob({ jobId: input.jobId });

      if (!job) {
        throw new Error(`Job ${input.jobId} does not exist.`);
      }

      const credential = await requireOwnedCredential(
        store,
        job,
        input.actorUserId,
      );

      const runningJob = await recordLifecycleTransition(store, {
        action: 'job.started',
        actorUserId: input.actorUserId,
        detail: `Started ${job.kind} with server-owned provider configuration.`,
        jobId: job.id,
        message: `Running ${job.kind} with ${credential.provider}.`,
        status: 'running',
      });

      try {
        await executor({ credential, job: runningJob });
      } catch {
        const failedJob = await recordLifecycleTransition(store, {
          action: 'job.failed',
          actorUserId: input.actorUserId,
          detail: `Failed ${job.kind} with server-owned provider configuration.`,
          jobId: job.id,
          message: `${job.kind} failed during execution.`,
          status: 'failed',
        }).catch((transitionError: unknown) =>
          getCancelledJobAfterCompetingTransition(
            store,
            job.id,
            transitionError,
          )
        );

        return toJobRecord(failedJob);
      }

      const completedJob = await recordLifecycleTransition(store, {
        action: 'job.completed',
        actorUserId: input.actorUserId,
        detail: `Completed ${job.kind} with server-owned provider configuration.`,
        jobId: job.id,
        message: `${job.kind} completed successfully.`,
        status: 'succeeded',
      }).catch((transitionError: unknown) =>
        getCancelledJobAfterCompetingTransition(
          store,
          job.id,
          transitionError,
        )
      );

      return toJobRecord(completedJob);
    },
  };
}
