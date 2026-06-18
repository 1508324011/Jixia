import { pathToFileURL } from "node:url";

import { createCleanupAIUsageJob, PrismaCleanupAIUsageRepository } from "./jobs/cleanup-ai-usage.js";
import {
  createCleanupUploadIntentMetadataJob,
  PrismaCleanupUploadIntentMetadataRepository
} from "./jobs/cleanup-upload-intent-metadata.js";
import { createCleanupUploadIntentsJob, PrismaCleanupUploadIntentRepository } from "./jobs/cleanup-upload-intents.js";
import { getDefaultCleanupObjectStorage } from "./object-storage.js";

export type WorkerJob = {
  readonly name: string;
  readonly intervalMs: number;
  readonly run: () => Promise<unknown>;
};

export type WorkerLogger = {
  readonly info: (message: string, metadata?: Record<string, unknown>) => void;
  readonly warn: (message: string, metadata?: Record<string, unknown>) => void;
  readonly error: (message: string, metadata?: Record<string, unknown>) => void;
};

export type WorkerTimers = {
  readonly setInterval: (callback: () => void, intervalMs: number) => unknown;
  readonly clearInterval: (handle: unknown) => void;
};

export type IntervalWorker = {
  readonly runNow: (jobName: string) => Promise<void>;
  readonly stop: () => Promise<void>;
};

export type IntervalWorkerOptions = {
  readonly jobs: readonly WorkerJob[];
  readonly timers?: WorkerTimers;
  readonly logger?: WorkerLogger;
  readonly runOnStart?: boolean;
  readonly now?: () => number;
};

export type WorkerProcess = {
  readonly on: (signal: NodeJS.Signals, listener: (signal: NodeJS.Signals) => void | Promise<void>) => unknown;
  readonly off?: (signal: NodeJS.Signals, listener: (signal: NodeJS.Signals) => void | Promise<void>) => unknown;
  readonly removeListener?: (
    signal: NodeJS.Signals,
    listener: (signal: NodeJS.Signals) => void | Promise<void>
  ) => unknown;
  readonly exit?: (code?: number) => never | void;
};

export type ShutdownHandlerOptions = {
  readonly worker: IntervalWorker;
  readonly logger?: WorkerLogger;
  readonly processRef?: WorkerProcess;
  readonly signals?: readonly NodeJS.Signals[];
  readonly exitAfterShutdown?: boolean;
};

type WorkerJobState = {
  intervalHandle: unknown;
  currentRun: Promise<void> | undefined;
  running: boolean;
};

const defaultLogger: WorkerLogger = console;
const defaultTimers: WorkerTimers = {
  setInterval: (callback, intervalMs) => setInterval(callback, intervalMs),
  clearInterval: (handle) => clearInterval(handle as ReturnType<typeof setInterval>)
};

const oneDayMs = 24 * 60 * 60 * 1_000;

export const workerJobIntervalsMs = {
  cleanupUploadIntents: 5 * 60 * 1_000,
  cleanupUploadIntentMetadata: oneDayMs,
  cleanupAIUsage: oneDayMs
} as const;

function summarizeJobResult(result: unknown): Record<string, number | string> {
  if (!result || typeof result !== "object") {
    return {};
  }

  const summary: Record<string, number | string> = {};

  for (const [key, value] of Object.entries(result)) {
    if (typeof value === "number" && Number.isFinite(value)) {
      summary[key] = value;
      continue;
    }

    if (key === "cutoff") {
      if (value instanceof Date) {
        summary.cutoff = value.toISOString();
      } else if (typeof value === "string") {
        summary.cutoff = value;
      }
    }
  }

  return summary;
}

export function createIntervalWorker(options: IntervalWorkerOptions): IntervalWorker {
  const timers = options.timers ?? defaultTimers;
  const logger = options.logger ?? defaultLogger;
  const getNow = options.now ?? Date.now;
  const runOnStart = options.runOnStart ?? true;
  const states = new Map<string, WorkerJobState>();
  let stopped = false;

  async function runJob(job: WorkerJob, trigger: "interval" | "startup" | "manual"): Promise<void> {
    const state = states.get(job.name);

    if (!state || stopped) {
      return;
    }

    if (state.running) {
      logger.warn("worker job skipped because previous run is still active", { job: job.name, trigger });
      return;
    }

    state.running = true;
    const startedAt = getNow();
    const execution = (async () => {
      try {
        const result = await job.run();
        logger.info("worker job completed", {
          job: job.name,
          trigger,
          durationMs: Math.max(0, getNow() - startedAt),
          result: summarizeJobResult(result)
        });
      } catch {
        logger.error("worker job failed", { job: job.name, trigger });
      } finally {
        state.running = false;
        state.currentRun = undefined;
      }
    })();

    state.currentRun = execution;
    await execution;
  }

  for (const job of options.jobs) {
    const state: WorkerJobState = {
      intervalHandle: undefined,
      currentRun: undefined,
      running: false
    };
    state.intervalHandle = timers.setInterval(() => {
      void runJob(job, "interval");
    }, job.intervalMs);
    states.set(job.name, state);

    if (runOnStart) {
      void runJob(job, "startup");
    }
  }

  return {
    async runNow(jobName: string): Promise<void> {
      const job = options.jobs.find((candidate) => candidate.name === jobName);

      if (!job) {
        logger.warn("worker job not found", { job: jobName });
        return;
      }

      await runJob(job, "manual");
    },
    async stop(): Promise<void> {
      if (stopped) {
        return;
      }

      stopped = true;

      for (const state of states.values()) {
        timers.clearInterval(state.intervalHandle);
      }

      await Promise.all(Array.from(states.values(), (state) => state.currentRun).filter(Boolean));
    }
  };
}

export async function createDefaultWorkerJobs(): Promise<readonly WorkerJob[]> {
  const { prisma } = await import("@jixia/db");
  const cleanupUploadIntents = createCleanupUploadIntentsJob(
    new PrismaCleanupUploadIntentRepository(prisma),
    getDefaultCleanupObjectStorage()
  );
  const cleanupUploadIntentMetadata = createCleanupUploadIntentMetadataJob(
    new PrismaCleanupUploadIntentMetadataRepository(prisma)
  );
  const cleanupAIUsage = createCleanupAIUsageJob(new PrismaCleanupAIUsageRepository(prisma));

  return [
    {
      name: "cleanupUploadIntents",
      intervalMs: workerJobIntervalsMs.cleanupUploadIntents,
      run: () => cleanupUploadIntents.run()
    },
    {
      name: "cleanupUploadIntentMetadata",
      intervalMs: workerJobIntervalsMs.cleanupUploadIntentMetadata,
      run: () => cleanupUploadIntentMetadata.run()
    },
    {
      name: "cleanupAIUsage",
      intervalMs: workerJobIntervalsMs.cleanupAIUsage,
      run: () => cleanupAIUsage.run()
    }
  ];
}

export function registerWorkerShutdownHandlers(options: ShutdownHandlerOptions): () => void {
  const processRef = options.processRef ?? process;
  const logger = options.logger ?? defaultLogger;
  const signals = options.signals ?? (["SIGINT", "SIGTERM"] as const);
  const exitAfterShutdown = options.exitAfterShutdown ?? true;
  let shutdownStarted = false;

  const handler = async (signal: NodeJS.Signals): Promise<void> => {
    if (shutdownStarted) {
      return;
    }

    shutdownStarted = true;
    logger.info("worker shutdown requested", { signal });

    try {
      await options.worker.stop();
      logger.info("worker shutdown complete", { signal });
      if (exitAfterShutdown) {
        processRef.exit?.(0);
      }
    } catch {
      logger.error("worker shutdown failed", { signal });
      if (exitAfterShutdown) {
        processRef.exit?.(1);
      }
    }
  };

  for (const signal of signals) {
    processRef.on(signal, handler);
  }

  return () => {
    for (const signal of signals) {
      if (processRef.off) {
        processRef.off(signal, handler);
      } else {
        processRef.removeListener?.(signal, handler);
      }
    }
  };
}

export async function main(): Promise<IntervalWorker> {
  const jobs = await createDefaultWorkerJobs();
  const worker = createIntervalWorker({ jobs });
  registerWorkerShutdownHandlers({ worker });
  defaultLogger.info("worker started", {
    jobs: jobs.map((job) => ({ name: job.name, intervalMs: job.intervalMs }))
  });
  return worker;
}

function isMainModule(): boolean {
  const entrypoint = process.argv[1];
  return Boolean(entrypoint && import.meta.url === pathToFileURL(entrypoint).href);
}

if (isMainModule()) {
  main().catch(() => {
    defaultLogger.error("worker failed to start");
    process.exitCode = 1;
  });
}
