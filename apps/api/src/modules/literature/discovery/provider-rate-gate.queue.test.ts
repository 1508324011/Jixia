import { describe, expect, it } from "vitest";

import { LiteratureProviderError } from "./provider-errors.js";
import {
  createLiteratureProviderRateGate,
  type LiteratureRateGateDependencies
} from "./provider-rate-gate.js";
import type { LiteratureProviderRateGate } from "./provider-types.js";

type Deferred = {
  readonly promise: Promise<void>;
  readonly resolve: () => void;
};

type QueueFixture = {
  readonly gate: LiteratureProviderRateGate;
  readonly sleepStarted: Promise<void>;
  readonly releaseSleep: () => void;
};

function deferred(): Deferred {
  let resolve = () => {};
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

function createQueueFixture(
  createSignal?: LiteratureRateGateDependencies["createSignal"]
): QueueFixture {
  let nowMs = 1_000;
  let shouldBlockSleep = true;
  const sleepStarted = deferred();
  const releaseSleep = deferred();
  const gate = createLiteratureProviderRateGate(
    { providerKey: "openalex", requestsPerSecond: 5, maxConcurrency: 3 },
    {
      now: () => nowMs,
      sleep: async (delayMs) => {
        if (shouldBlockSleep) {
          shouldBlockSleep = false;
          sleepStarted.resolve();
          await releaseSleep.promise;
        }
        nowMs += delayMs;
      },
      ...(createSignal === undefined ? {} : { createSignal })
    }
  );
  return {
    gate,
    sleepStarted: sleepStarted.promise,
    releaseSleep: releaseSleep.resolve
  };
}

async function startBlockedReservation(
  fixture: QueueFixture
): Promise<{ readonly operation: Promise<void> }> {
  await fixture.gate.run({ operationDeadlineMs: 10_000 }, async () => undefined);
  const operation = fixture.gate.run(
    { operationDeadlineMs: 10_000 },
    async () => undefined
  );
  await fixture.sleepStarted;
  return { operation };
}

async function flushUntil(condition: () => boolean): Promise<void> {
  for (let attempt = 0; attempt < 50 && !condition(); attempt += 1) {
    await Promise.resolve();
  }
}

describe("literature provider queued rate reservations", () => {
  it("settles an absolute deadline before the reservation ahead releases", async () => {
    // Given
    const deadlineController = new AbortController();
    const fixture = createQueueFixture((_timeoutMs, externalSignal) => (
      externalSignal ?? deadlineController.signal
    ));
    const blocker = await startBlockedReservation(fixture);
    let operationCalled = false;
    let settled = false;
    const queued = fixture.gate.run(
      { operationDeadlineMs: 1_050 },
      async () => {
        operationCalled = true;
      }
    ).then(
      () => null,
      (error: unknown) => error
    );
    void queued.then(() => {
      settled = true;
    });
    await Promise.resolve();

    // When
    deadlineController.abort(new DOMException("deadline elapsed", "TimeoutError"));
    await flushUntil(() => settled);
    const settledBeforeRelease = settled;
    fixture.releaseSleep();
    await blocker.operation;
    const error = await queued;

    // Then
    expect(settledBeforeRelease).toBe(true);
    expect(operationCalled).toBe(false);
    expect(error).toBeInstanceOf(LiteratureProviderError);
    if (error instanceof LiteratureProviderError) {
      expect(error.code).toBe("deadline_exhausted");
    }
  });

  it("settles caller cancellation promptly without bypassing or poisoning the tail", async () => {
    // Given
    const fixture = createQueueFixture();
    const blocker = await startBlockedReservation(fixture);
    const controller = new AbortController();
    let cancelledOperationCalled = false;
    let cancelledSettled = false;
    const cancelled = fixture.gate.run(
      { operationDeadlineMs: 10_000, signal: controller.signal },
      async () => {
        cancelledOperationCalled = true;
      }
    ).then(
      () => null,
      (error: unknown) => error
    );
    void cancelled.then(() => {
      cancelledSettled = true;
    });
    await Promise.resolve();

    // When
    controller.abort(new DOMException("caller stopped", "AbortError"));
    await flushUntil(() => cancelledSettled);
    const settledBeforeRelease = cancelledSettled;
    let followerCalled = false;
    const follower = fixture.gate.run({ operationDeadlineMs: 10_000 }, async () => {
      followerCalled = true;
    });
    await flushUntil(() => followerCalled);
    const followerBypassedBlocker = followerCalled;
    fixture.releaseSleep();
    await blocker.operation;
    const error = await cancelled;
    await follower;

    // Then
    expect(settledBeforeRelease).toBe(true);
    expect(cancelledOperationCalled).toBe(false);
    expect(followerBypassedBlocker).toBe(false);
    expect(followerCalled).toBe(true);
    expect(error).toBeInstanceOf(LiteratureProviderError);
    if (error instanceof LiteratureProviderError) {
      expect(error.code).toBe("cancelled");
    }
  });
});
