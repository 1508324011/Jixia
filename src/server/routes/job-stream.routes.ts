import type { JobEventRecord } from "@shared/contracts/jobs";

import {
  findAuthorizedJob,
  type JobAccessRequest,
  type JobGovernanceStore,
} from "../jobs/job-governance";
import type { JobBus } from "../jobs/job-bus";

export interface JobStreamRoutes {
  listEvents(input: JobAccessRequest): Promise<JobEventRecord[]>;
  subscribe(
    input: JobAccessRequest,
    listener: (event: JobEventRecord) => void,
  ): Promise<() => void>;
  toSse(input: JobAccessRequest): Promise<string>;
}

export interface JobStreamRouteStore extends JobGovernanceStore {
  jobBus: JobBus;
}

export function createJobStreamRoutes(
  store: JobStreamRouteStore,
): JobStreamRoutes {
  return {
    async listEvents(input: JobAccessRequest): Promise<JobEventRecord[]> {
      const job = await findAuthorizedJob(store, input);

      return store.jobBus.listEvents(job.id);
    },
    async subscribe(
      input: JobAccessRequest,
      listener: (event: JobEventRecord) => void,
    ): Promise<() => void> {
      const job = await findAuthorizedJob(store, input);

      return store.jobBus.subscribe(job.id, listener);
    },
    async toSse(input: JobAccessRequest): Promise<string> {
      const job = await findAuthorizedJob(store, input);

      return store.jobBus.toSse(job.id);
    },
  };
}
