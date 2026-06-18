import { describe, expect, it, vi } from "vitest";

import {
  createIntervalWorker,
  registerWorkerShutdownHandlers,
  workerJobIntervalsMs,
  type WorkerJob,
  type WorkerLogger,
  type WorkerProcess,
  type WorkerTimers
} from "./index.js";

class FakeTimers implements WorkerTimers {
  readonly intervals: { readonly callback: () => void; readonly intervalMs: number; cleared: boolean }[] = [];

  setInterval(callback: () => void, intervalMs: number): unknown {
    this.intervals.push({ callback, intervalMs, cleared: false });
    return this.intervals.length - 1;
  }

  clearInterval(handle: unknown): void {
    this.intervals[handle as number]!.cleared = true;
  }
}

class FakeProcess implements WorkerProcess {
  readonly listeners = new Map<NodeJS.Signals, ((signal: NodeJS.Signals) => void | Promise<void>)[]>();
  exitCode: number | undefined;

  on(signal: NodeJS.Signals, listener: (signal: NodeJS.Signals) => void | Promise<void>): unknown {
    this.listeners.set(signal, [...(this.listeners.get(signal) ?? []), listener]);
    return this;
  }

  off(signal: NodeJS.Signals, listener: (signal: NodeJS.Signals) => void | Promise<void>): unknown {
    this.listeners.set(
      signal,
      (this.listeners.get(signal) ?? []).filter((candidate) => candidate !== listener)
    );
    return this;
  }

  exit(code?: number): never {
    this.exitCode = code;
    throw new Error("fake process exit");
  }

  async emitSignal(signal: NodeJS.Signals): Promise<void> {
    await Promise.all((this.listeners.get(signal) ?? []).map((listener) => listener(signal)));
  }
}

function createLogger(): WorkerLogger {
  return {
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  };
}

describe("worker scheduler", () => {
  it("defines the MVP cleanup intervals", () => {
    expect(workerJobIntervalsMs).toEqual({
      cleanupUploadIntents: 5 * 60 * 1_000,
      cleanupUploadIntentMetadata: 24 * 60 * 60 * 1_000,
      cleanupAIUsage: 24 * 60 * 60 * 1_000
    });
  });

  it("schedules jobs with injectable timers", async () => {
    const timers = new FakeTimers();
    const logger = createLogger();
    const runs: string[] = [];
    const jobs: WorkerJob[] = [
      { name: "cleanupUploadIntents", intervalMs: workerJobIntervalsMs.cleanupUploadIntents, run: async () => ({ claimed: 0 }) },
      {
        name: "cleanupUploadIntentMetadata",
        intervalMs: workerJobIntervalsMs.cleanupUploadIntentMetadata,
        run: async () => ({ deleted: 0 })
      },
      { name: "cleanupAIUsage", intervalMs: workerJobIntervalsMs.cleanupAIUsage, run: async () => ({ deleted: 0 }) }
    ].map((job) => ({
      ...job,
      run: async () => {
        runs.push(job.name);
        return job.run();
      }
    }));

    const worker = createIntervalWorker({ jobs, timers, logger, runOnStart: false });

    expect(timers.intervals.map((interval) => interval.intervalMs)).toEqual([
      workerJobIntervalsMs.cleanupUploadIntents,
      workerJobIntervalsMs.cleanupUploadIntentMetadata,
      workerJobIntervalsMs.cleanupAIUsage
    ]);

    timers.intervals[0]!.callback();
    await Promise.resolve();

    expect(runs).toEqual(["cleanupUploadIntents"]);
    await worker.stop();
    expect(timers.intervals.every((interval) => interval.cleared)).toBe(true);
  });

  it("does not overlap a job with itself", async () => {
    const timers = new FakeTimers();
    const logger = createLogger();
    let resolveRun: (() => void) | undefined;
    let starts = 0;
    const job: WorkerJob = {
      name: "slowCleanup",
      intervalMs: 1,
      run: async () => {
        starts += 1;
        await new Promise<void>((resolve) => {
          resolveRun = resolve;
        });
        return { deleted: 1 };
      }
    };
    const worker = createIntervalWorker({ jobs: [job], timers, logger, runOnStart: false });

    const firstRun = worker.runNow("slowCleanup");
    await Promise.resolve();
    await worker.runNow("slowCleanup");

    expect(starts).toBe(1);
    expect(logger.warn).toHaveBeenCalledWith("worker job skipped because previous run is still active", {
      job: "slowCleanup",
      trigger: "manual"
    });
    resolveRun?.();
    await firstRun;
    await worker.stop();
  });

  it("shuts down cleanly from process signals", async () => {
    const timers = new FakeTimers();
    const logger = createLogger();
    const processRef = new FakeProcess();
    const worker = createIntervalWorker({
      jobs: [{ name: "cleanup", intervalMs: 1, run: async () => ({ deleted: 0 }) }],
      timers,
      logger,
      runOnStart: false
    });

    const unregister = registerWorkerShutdownHandlers({
      worker,
      logger,
      processRef,
      signals: ["SIGTERM"],
      exitAfterShutdown: false
    });

    await processRef.emitSignal("SIGTERM");

    expect(timers.intervals[0]?.cleared).toBe(true);
    expect(logger.info).toHaveBeenCalledWith("worker shutdown complete", { signal: "SIGTERM" });
    unregister();
    expect(processRef.listeners.get("SIGTERM")).toEqual([]);
  });
});
