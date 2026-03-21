import type { JobEventRecord } from '@shared/contracts/jobs';

import type { JobBus } from '../jobs/job-bus';

export interface JobStreamRoutes {
  listEvents(jobId: string): JobEventRecord[];
  toSse(jobId: string): string;
}

export function createJobStreamRoutes(jobBus: JobBus): JobStreamRoutes {
  return {
    listEvents(jobId: string): JobEventRecord[] {
      return jobBus.listEvents(jobId);
    },
    toSse(jobId: string): string {
      return jobBus.toSse(jobId);
    },
  };
}
