import type { SpaceMembership } from "@shared/contracts/spaces";

import type { JobRecord, ListJobsQuery } from "@shared/contracts/jobs";

import {
  assertSafeJobPayload,
  findAuthorizedJob,
  type JobAccessRequest,
} from "../jobs/job-governance";
import type { JobRunner, StoredJob } from "../jobs/job-runner";
import type { JobBus } from "../jobs/job-bus";
import type { AuditLogRecord, AuditService } from "../services/audit.service";
import type { StoredCredential } from "../services/credentials.service";
import type { StoredSpace } from "../services/spaces.service";

export interface CreateJobRequest {
  credentialRef: string;
  kind: string;
  payload: Record<string, unknown>;
  requestedByUserId: string;
  spaceId: string;
}

export interface JobsRoutes {
  createJob(input: CreateJobRequest): Promise<JobRecord>;
  getJob(input: JobAccessRequest): Promise<JobRecord>;
  listJobs(input: ListJobsQuery): Promise<JobRecord[]>;
  listAuditRecords(input: JobAccessRequest): Promise<AuditLogRecord[]>;
  runJob(input: JobAccessRequest): Promise<JobRecord>;
}

export interface JobsRouteStore {
  auditService: AuditService;
  credentials: StoredCredential[];
  jobBus: JobBus;
  jobRunner: JobRunner;
  jobs: StoredJob[];
  memberships: SpaceMembership[];
  nextId(prefix: string): string;
  persist(): void;
  spaces: StoredSpace[];
}

export function createJobsRoutes(store: JobsRouteStore): JobsRoutes {
  return {
    async createJob(input: CreateJobRequest): Promise<JobRecord> {
      const space = store.spaces.find(
        (candidate) => candidate.id === input.spaceId,
      );

      if (!space) {
        throw new Error(`Space ${input.spaceId} does not exist.`);
      }

      const credential = store.credentials.find(
        (candidate) => candidate.credentialRef === input.credentialRef,
      );

      if (!credential) {
        throw new Error(`Credential ${input.credentialRef} does not exist.`);
      }

      if (credential.userId !== input.requestedByUserId) {
        throw new Error("Credentials may only be used by their owner.");
      }

      const actorHasMembership = store.memberships.some(
        (membership) =>
          membership.spaceId === input.spaceId &&
          membership.userId === input.requestedByUserId,
      );

      if (!actorHasMembership) {
        throw new Error("Access denied for the requested space resource.");
      }

      assertSafeJobPayload(input.payload);

      const job: StoredJob = {
        createdAt: new Date().toISOString(),
        credentialRef: input.credentialRef,
        id: store.nextId("job"),
        kind: input.kind,
        payload: JSON.stringify(input.payload),
        requestedByUserId: input.requestedByUserId,
        spaceId: input.spaceId,
        status: "queued",
      };

      store.jobs.push(job);
      store.persist();
      store.jobBus.publish({
        id: store.nextId("job-event"),
        jobId: job.id,
        message: `${job.kind} queued for execution.`,
        recordedAt: new Date().toISOString(),
        status: "queued",
      });
      store.auditService.createRecord({
        action: "job.created",
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
    async getJob(input: JobAccessRequest): Promise<JobRecord> {
      const job = findAuthorizedJob(store, input);

      return {
        createdAt: job.createdAt,
        credentialRef: job.credentialRef,
        id: job.id,
        kind: job.kind,
        status: job.status,
      };
    },
    async listJobs(input: ListJobsQuery): Promise<JobRecord[]> {
      return store.jobs
        .filter(
          (job) =>
            job.spaceId === input.actorSpaceId &&
            job.requestedByUserId === input.actorUserId,
        )
        .map((job) => ({
          createdAt: job.createdAt,
          credentialRef: job.credentialRef,
          id: job.id,
          kind: job.kind,
          status: job.status,
        }));
    },
    async listAuditRecords(input: JobAccessRequest): Promise<AuditLogRecord[]> {
      const job = findAuthorizedJob(store, input);

      return store.auditService.listByJob(job.id);
    },
    async runJob(input: JobAccessRequest): Promise<JobRecord> {
      const job = findAuthorizedJob(store, input);

      return store.jobRunner.run(job.id);
    },
  };
}
