import type { SpaceRepository } from "../../db";

import type { JobRecord } from "@shared/contracts/jobs";

import {
  assertSafeJobPayload,
  findAuthorizedJob,
  type JobAccessRequest,
} from "../jobs/job-governance";
import type { JobRunner, StoredJob } from "../jobs/job-runner";
import type { JobBus } from "../jobs/job-bus";
import type { AuditLogRecord, AuditService } from "../services/audit.service";
import type { StoredCredential } from "../services/credentials.service";

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

export interface JobsRoutes {
  createJob(input: CreateJobRequest, actorUserId: string): Promise<JobRecord>;
  getJob(input: JobAccessRequest): Promise<JobRecord>;
  listJobs(input: ListJobsRequest): Promise<JobRecord[]>;
  listAuditRecords(input: JobAccessRequest): Promise<AuditLogRecord[]>;
  runJob(input: JobAccessRequest): Promise<JobRecord>;
}

export interface JobsRouteStore {
  auditService: AuditService;
  credentials: StoredCredential[];
  jobBus: JobBus;
  jobRunner: JobRunner;
  jobs: StoredJob[];
  nextId(prefix: string): string;
  persist(): void;
  spaceRepository: SpaceRepository;
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

      const credential = store.credentials.find(
        (candidate) => candidate.credentialRef === input.credentialRef,
      );

      if (!credential) {
        throw new Error(`Credential ${input.credentialRef} does not exist.`);
      }

      if (credential.userId !== actorUserId) {
        throw new Error("Credentials may only be used by their owner.");
      }

      await store.spaceRepository.denyNonMember(input.spaceId, actorUserId);

      assertSafeJobPayload(input.payload);

      const job: StoredJob = {
        createdAt: new Date().toISOString(),
        credentialRef: input.credentialRef,
        id: store.nextId("job"),
        kind: input.kind,
        payload: JSON.stringify(input.payload),
        requestedByUserId: actorUserId,
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
        actorUserId,
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
      const job = await findAuthorizedJob(store, input);

      return {
        createdAt: job.createdAt,
        credentialRef: job.credentialRef,
        id: job.id,
        kind: job.kind,
        status: job.status,
      };
    },
    async listJobs(input: ListJobsRequest): Promise<JobRecord[]> {
      const targetSpaceId = input.spaceId;
      const allowedSpaceIds = new Set<string>();

      if (input.actorSpaceId && input.actorSpaceId !== input.spaceId) {
        throw new Error(
          'Request space context does not match the requested resource space.',
        );
      }

      if (targetSpaceId) {
        await store.spaceRepository.denyNonMember(targetSpaceId, input.actorUserId);
        allowedSpaceIds.add(targetSpaceId);
      }

      if (!targetSpaceId) {
        const uniqueSpaceIds = [...new Set(store.jobs.map((job) => job.spaceId))];

        await Promise.all(
          uniqueSpaceIds.map(async (spaceId) => {
            try {
              await store.spaceRepository.denyNonMember(spaceId, input.actorUserId);
              allowedSpaceIds.add(spaceId);
            } catch {
              // Ignore spaces where the actor has no persisted membership.
            }
          }),
        );
      }

      return store.jobs
        .filter(
          (job) =>
            job.requestedByUserId === input.actorUserId &&
            allowedSpaceIds.has(job.spaceId),
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
      const job = await findAuthorizedJob(store, input);

      return store.auditService.listByJob(job.id);
    },
    async runJob(input: JobAccessRequest): Promise<JobRecord> {
      const job = await findAuthorizedJob(store, input);

      return store.jobRunner.run(job.id);
    },
  };
}
