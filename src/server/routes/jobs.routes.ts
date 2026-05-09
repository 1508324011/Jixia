import type { JobRepository, PersistedJobRecord, SpaceRepository } from "../../db";

import type { JobRecord } from "@shared/contracts/jobs";

import {
  assertSafeJobPayload,
  findAuthorizedJob,
  type JobAccessRequest,
} from "../jobs/job-governance";
import type { JobRunner } from "../jobs/job-runner";
import type { JobBus } from "../jobs/job-bus";
import type { AuditLogRecord, AuditService } from "../services/audit.service";

export interface CreateJobRequest {
  credentialRef: string;
  kind: string;
  payload: Record<string, unknown>;
  requestedByUserId?: string;
  spaceId: string;
}

export interface ListJobsRequest {
  actorSpaceId?: string;
  actorUserId: string;
  spaceId?: string;
}

function assertSpaceContext(
  resourceSpaceId: string | undefined,
  actorSpaceId: string | undefined,
): void {
  if (actorSpaceId && actorSpaceId !== resourceSpaceId) {
    throw new Error(
      'Request space context does not match the requested resource space.',
    );
  }
}

export interface JobsRoutes {
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
  spaceRepository: SpaceRepository;
}

function toJobRecord(job: PersistedJobRecord): JobRecord {
  return {
    createdAt: job.createdAt,
    credentialRef: job.credentialRef,
    id: job.id,
    kind: job.kind,
    status: job.status,
  };
}

export function createJobsRoutes(store: JobsRouteStore): JobsRoutes {
  return {
    async createJob(
      input: CreateJobRequest,
      actorUserId: string,
    ): Promise<JobRecord> {
      if (input.requestedByUserId && input.requestedByUserId !== actorUserId) {
        throw new Error(
          "Request body actor does not match the server-derived actor.",
        );
      }

      const space = await store.spaceRepository.findSpace(input.spaceId);

      if (!space) {
        throw new Error(`Space ${input.spaceId} does not exist.`);
      }

      await store.spaceRepository.denyNonMember(input.spaceId, actorUserId);

      const credential = await store.jobRepository.getProviderCredentialReference(
        input.credentialRef,
      );

      if (!credential) {
        throw new Error(`Credential ${input.credentialRef} does not exist.`);
      }

      if (credential.userId !== actorUserId) {
        throw new Error("Credentials may only be used by their owner.");
      }

      assertSafeJobPayload(input.payload);

      const jobId = store.nextId("job");
      const queuedEventId = store.nextId("job-event");
      const createdAuditId = store.nextId("audit");

      const persisted = await store.jobRepository.createQueuedJobWithAudit({
        audit: {
          action: "job.created",
          actorUserId,
          detail: `Created ${input.kind} with credential ${credential.credentialRef}.`,
          id: createdAuditId,
          recordedAt: new Date().toISOString(),
        },
        event: {
          id: queuedEventId,
          message: `${input.kind} queued for execution.`,
          recordedAt: new Date().toISOString(),
          status: "queued",
        },
        job: {
          credentialRef: input.credentialRef,
          id: jobId,
          kind: input.kind,
          payload: JSON.stringify(input.payload),
          requestedByUserId: actorUserId,
          spaceId: input.spaceId,
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
      const targetSpaceId = input.spaceId;

      assertSpaceContext(input.spaceId, input.actorSpaceId);

      if (targetSpaceId) {
        await store.spaceRepository.denyNonMember(targetSpaceId, input.actorUserId);
      }

      const jobs = await store.jobRepository.listJobsForActor({
        actorUserId: input.actorUserId,
        spaceId: targetSpaceId,
      });

      if (!targetSpaceId) {
        const allowedJobs: PersistedJobRecord[] = [];

        for (const job of jobs) {
          try {
            await store.spaceRepository.denyNonMember(job.spaceId, input.actorUserId);
            allowedJobs.push(job);
          } catch {
            // Ignore spaces where the actor has no persisted membership.
          }
        }

        return allowedJobs.map(toJobRecord);
      }

      return jobs.map(toJobRecord);
    },
    async listAuditRecords(input: JobAccessRequest): Promise<AuditLogRecord[]> {
      const job = await findAuthorizedJob(store, input);

      return store.auditService.listByJob(job.id);
    },
    async runJob(input: JobAccessRequest): Promise<JobRecord> {
      const job = await findAuthorizedJob(store, input);

      return store.jobRunner.run(job.id);
    },
  };
}
