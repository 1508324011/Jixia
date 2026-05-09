import type { JobEventRecord } from "@shared/contracts/jobs";

export type JobEventListener = (event: JobEventRecord) => void;

export interface JobBus {
  publish(event: JobEventRecord): void;
  subscribe(jobId: string, listener: JobEventListener): () => void;
}

function formatSseEvent(event: JobEventRecord): string {
  return `event: job\ndata: ${JSON.stringify(event)}\n\n`;
}

export function createJobBus(
  onPublish?: (event: JobEventRecord) => void,
): JobBus {
  const listeners = new Map<string, Set<JobEventListener>>();

  return {
    publish(event: JobEventRecord): void {
      onPublish?.(event);
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
  };
}

export function toSseEventStream(events: JobEventRecord[]): string {
  return events.map((event) => formatSseEvent(event)).join("");
}
