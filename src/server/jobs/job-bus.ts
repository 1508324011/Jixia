import type { JobEventRecord } from '@shared/contracts/jobs';

export interface JobBus {
  listEvents(jobId: string): JobEventRecord[];
  publish(event: JobEventRecord): void;
  toSse(jobId: string): string;
}

export function createJobBus(
  events: JobEventRecord[],
  persist: () => void,
): JobBus {
  return {
    listEvents(jobId: string): JobEventRecord[] {
      return events.filter((event) => event.jobId === jobId);
    },
    publish(event: JobEventRecord): void {
      events.push(event);
      persist();
    },
    toSse(jobId: string): string {
      return this.listEvents(jobId)
        .map((event) => `event: job\ndata: ${JSON.stringify(event)}\n`)
        .join('\n');
    },
  };
}
