import type { JobEventRecord } from '@shared/contracts/jobs';

import {
  findAuthorizedJob,
  type JobAccessRequest,
  type JobGovernanceStore,
} from '../jobs/job-governance';
import type { JobBus } from '../jobs/job-bus';

export interface JobStreamRoutes {
  listEvents(input: JobAccessRequest): JobEventRecord[];
  toSse(input: JobAccessRequest): string;
}

export interface JobStreamRouteStore extends JobGovernanceStore {
  jobBus: JobBus;
}

export function createJobStreamRoutes(store: JobStreamRouteStore): JobStreamRoutes {
  return {
    listEvents(input: JobAccessRequest): JobEventRecord[] {
      const job = findAuthorizedJob(store, input);

      return store.jobBus.listEvents(job.id);
    },
    toSse(input: JobAccessRequest): string {
      const job = findAuthorizedJob(store, input);

      return store.jobBus.toSse(job.id);
    },
  };
}
