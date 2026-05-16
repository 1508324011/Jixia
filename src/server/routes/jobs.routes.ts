import type {
  CreateJobRequest,
  JobRecord,
  ListJobsQuery,
} from '@shared/contracts/jobs';

import type {
  JobRepository,
  PersistedJobRecord,
  ProjectRepository,
  SpaceRepository,
} from '../../db';

import {
  assertSafeJobPayload,
  findAuthorizedJob,
  resolveAuthorizedCreateJobScopeContext,
  resolveAuthorizedListJobScopeContext,
  type JobAccessRequest,
} from '../jobs/job-governance';
import type { JobBus } from '../jobs/job-bus';
import type { JobRunner } from '../jobs/job-runner';
import type { AuditLogRecord, AuditService } from '../services/audit.service';

export interface ListJobsRequest extends ListJobsQuery {
  actorUserId: string;
}

export interface JobsRoutes {
  cancelJob(input: JobAccessRequest): Promise<JobRecord>;
  createJob(input: CreateJobRequest, actorUserId: string): Promise<JobRecord>;
  getJob(input: JobAccessRequest): Promise<JobRecord>;
  listJobs(input: ListJobsRequest): Promise<JobRecord[]>;
  listAuditRecords(input: JobAccessRequest): Promise<AuditLogRecord[]>;
  runJob(input: JobAccessRequest): Promise<JobRecord>;
}

export interface JobsRouteStore {
  auditService: AuditService;
  jobBus: JobBus;
  jobRepository: JobRepository;
  jobRunner: JobRunner;
  nextId(prefix: string): string;
  projectRepository: ProjectRepository;
  spaceRepository: SpaceRepository;
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

export function createJobsRoutes(store: JobsRouteStore): JobsRoutes {
  return {
    async cancelJob(input: JobAccessRequest): Promise<JobRecord> {
      const job = await findAuthorizedJob(store, input, 'run');

      return store.jobRunner.cancel({
        actorUserId: input.actorUserId,
        jobId: job.id,
      });
    },
    async createJob(
      input: CreateJobRequest,
      actorUserId: string,
    ): Promise<JobRecord> {
      if (input.requestedByUserId && input.requestedByUserId !== actorUserId) {
        throw new Error(
          'Request body actor does not match the server-derived actor.',
        );
      }

      const scopeContext = await resolveAuthorizedCreateJobScopeContext(store, {
        actorUserId,
        scope: input.scope,
        spaceId: input.spaceId,
      });

      const credential = await store.jobRepository.getProviderCredentialReference(
        input.credentialRef,
      );

      if (!credential) {
        throw new Error(`Credential ${input.credentialRef} does not exist.`);
      }

      if (credential.userId !== actorUserId) {
        throw new Error('Credentials may only be used by their owner.');
      }

      assertSafeJobPayload(input.payload);

      const jobId = store.nextId('job');
      const queuedEventId = store.nextId('job-event');
      const createdAuditId = store.nextId('audit');

      const persisted = await store.jobRepository.createQueuedJobWithAudit({
        audit: {
          action: 'job.created',
          actorUserId,
          detail: `Created ${input.kind} with credential ${credential.credentialRef}.`,
          id: createdAuditId,
          recordedAt: new Date().toISOString(),
        },
        event: {
          id: queuedEventId,
          message: `${input.kind} queued for execution.`,
          recordedAt: new Date().toISOString(),
          status: 'queued',
        },
        job: {
          credentialRef: input.credentialRef,
          id: jobId,
          kind: input.kind,
          payload: JSON.stringify(input.payload),
          requestedByUserId: actorUserId,
          scope: scopeContext.scope,
          spaceId: scopeContext.spaceId,
        },
      });
      store.jobBus.publish(persisted.event);

      return toJobRecord(persisted.job);
    },
    async getJob(input: JobAccessRequest): Promise<JobRecord> {
      const job = await findAuthorizedJob(store, input);

      return toJobRecord(job);
    },
    async listJobs(input: ListJobsRequest): Promise<JobRecord[]> {
      const listingContext = await resolveAuthorizedListJobScopeContext(store, input);
      const jobs = await store.jobRepository.listJobsForScope({
        scope: listingContext.scope,
        spaceId: listingContext.spaceIdFilter,
      });

      return jobs.map(toJobRecord);
    },
    async listAuditRecords(input: JobAccessRequest): Promise<AuditLogRecord[]> {
      const job = await findAuthorizedJob(store, input);

      return store.auditService.listByJob(job.id);
    },
    async runJob(input: JobAccessRequest): Promise<JobRecord> {
      const job = await findAuthorizedJob(store, input, 'run');

      return store.jobRunner.run({ actorUserId: input.actorUserId, jobId: job.id });
    },
  };
}
