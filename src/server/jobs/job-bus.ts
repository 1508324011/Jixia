import type { JobEventRecord } from "@shared/contracts/jobs";

export type JobEventListener = (event: JobEventRecord) => void;

export interface JobBus {
  listEvents(jobId: string): JobEventRecord[];
  publish(event: JobEventRecord): void;
  subscribe(jobId: string, listener: JobEventListener): () => void;
  toSse(jobId: string): string;
}

function formatSseEvent(event: JobEventRecord): string {
  return `event: job\ndata: ${JSON.stringify(event)}\n\n`;
}

export function createJobBus(
  events: JobEventRecord[],
  persist: () => void,
): JobBus {
  const listeners = new Map<string, Set<JobEventListener>>();

  return {
    listEvents(jobId: string): JobEventRecord[] {
      return events.filter((event) => event.jobId === jobId);
    },
    publish(event: JobEventRecord): void {
      events.push(event);
      persist();
      listeners.get(event.jobId)?.forEach((listener) => listener(event));
    },
    subscribe(jobId: string, listener: JobEventListener): () => void {
      const nextListeners = listeners.get(jobId) ?? new Set<JobEventListener>();
      nextListeners.add(listener);
      listeners.set(jobId, nextListeners);

      return () => {
        const jobListeners = listeners.get(jobId);
        if (!jobListeners) {
          return;
        }

        jobListeners.delete(listener);
        if (jobListeners.size === 0) {
          listeners.delete(jobId);
        }
      };
    },
    toSse(jobId: string): string {
      return this.listEvents(jobId)
        .map((event) => formatSseEvent(event))
        .join("");
    },
  };
}
