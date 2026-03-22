import type { JobEventRecord } from '@shared/contracts/jobs';

import {
  findLatestAuthorizedJob,
  findAuthorizedJob,
  type JobAccessRequest,
  type JobGovernanceStore,
  type SpaceJobAccessRequest,
} from '../jobs/job-governance';
import type { JobBus } from '../jobs/job-bus';

export interface JobStreamRoutes {
  listEvents(input: JobAccessRequest): JobEventRecord[];
  listLatestEvents(input: SpaceJobAccessRequest): JobEventRecord[];
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
    listLatestEvents(input: SpaceJobAccessRequest): JobEventRecord[] {
      const job = findLatestAuthorizedJob(store, input);

      return job ? store.jobBus.listEvents(job.id) : [];
    },
    toSse(input: JobAccessRequest): string {
      const job = findAuthorizedJob(store, input);

      return store.jobBus.toSse(job.id);
    },
  };
}
