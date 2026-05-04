import type { JobEventRecord } from "@shared/contracts/jobs";

import {
  findAuthorizedJob,
  type JobAccessRequest,
  type JobGovernanceStore,
} from "../jobs/job-governance";
import type { JobBus } from "../jobs/job-bus";

export interface JobStreamRoutes {
  listEvents(input: JobAccessRequest): JobEventRecord[];
  subscribe(
    input: JobAccessRequest,
    listener: (event: JobEventRecord) => void,
  ): () => void;
  toSse(input: JobAccessRequest): string;
}

export interface JobStreamRouteStore extends JobGovernanceStore {
  jobBus: JobBus;
}

export function createJobStreamRoutes(
  store: JobStreamRouteStore,
): JobStreamRoutes {
  return {
    listEvents(input: JobAccessRequest): JobEventRecord[] {
      const job = findAuthorizedJob(store, input);

      return store.jobBus.listEvents(job.id);
    },
    subscribe(
      input: JobAccessRequest,
      listener: (event: JobEventRecord) => void,
    ): () => void {
      const job = findAuthorizedJob(store, input);

      return store.jobBus.subscribe(job.id, listener);
    },
    toSse(input: JobAccessRequest): string {
      const job = findAuthorizedJob(store, input);

      return store.jobBus.toSse(job.id);
    },
  };
}
