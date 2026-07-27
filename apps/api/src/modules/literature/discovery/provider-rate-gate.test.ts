import { describe, expect, it } from "vitest";

import { LiteratureProviderError } from "./provider-errors.js";
import {
  createDefaultLiteratureRateGates,
  createLiteratureProviderRateGate,
  literatureRateGateDefaults
} from "./provider-rate-gate.js";

function deferred(): { readonly promise: Promise<void>; readonly resolve: () => void } {
  let resolve: () => void = () => {};
  const promise = new Promise<void>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

async function flushUntil(condition: () => boolean): Promise<void> {
  for (let attempt = 0; attempt < 50 && !condition(); attempt += 1) {
    await Promise.resolve();
  }
}

describe("literature provider rate gates", () => {
  it("uses the conservative provider defaults and one shared NCBI gate", () => {
    // Given
    const dependencies = { now: () => 1_000, sleep: async () => undefined };

    // When
    const gates = createDefaultLiteratureRateGates(dependencies);

    // Then
    expect(literatureRateGateDefaults).toEqual({
      openalex: { providerKey: "openalex", requestsPerSecond: 5, maxConcurrency: 2 },
      crossref: { providerKey: "crossref", requestsPerSecond: 3, maxConcurrency: 2 },
      ncbi: { providerKey: "pubmed", requestsPerSecond: 10, maxConcurrency: 2 },
      unpaywall: { providerKey: "unpaywall", requestsPerSecond: 5, maxConcurrency: 2 }
    });
    expect(gates.pubmed).toBe(gates.pmc);
  });

  it("spaces token reservations according to requests per second", async () => {
    // Given
    let nowMs = 1_000;
    const sleeps: number[] = [];
    const gate = createLiteratureProviderRateGate(
      { providerKey: "openalex", requestsPerSecond: 5, maxConcurrency: 2 },
      {
        now: () => nowMs,
        sleep: async (delayMs) => {
          sleeps.push(delayMs);
          nowMs += delayMs;
        }
      }
    );

    // When
    await gate.run({ operationDeadlineMs: 5_000 }, async () => "first");
    await gate.run({ operationDeadlineMs: 5_000 }, async () => "second");

    // Then
    expect(sleeps).toEqual([200]);
  });

  it("never runs more than the configured concurrency", async () => {
    // Given
    let nowMs = 1_000;
    let active = 0;
    let maximumActive = 0;
    let started = 0;
    const blockers = [deferred(), deferred(), deferred()];
    const gate = createLiteratureProviderRateGate(
      { providerKey: "openalex", requestsPerSecond: 1_000, maxConcurrency: 2 },
      {
        now: () => nowMs,
        sleep: async (delayMs) => {
          nowMs += delayMs;
        }
      }
    );

    // When
    const runs = blockers.map((blocker) => gate.run(
      { operationDeadlineMs: 10_000 },
      async () => {
        started += 1;
        active += 1;
        maximumActive = Math.max(maximumActive, active);
        await blocker.promise;
        active -= 1;
      }
    ));
    await flushUntil(() => started === 2);

    // Then
    expect(started).toBe(2);
    expect(maximumActive).toBe(2);
    blockers[0]?.resolve();
    await flushUntil(() => started === 3);
    expect(started).toBe(3);
    blockers[1]?.resolve();
    blockers[2]?.resolve();
    await Promise.all(runs);
    expect(maximumActive).toBe(2);
  });

  it("rejects a cancelled concurrency waiter before a slot is released", async () => {
    // Given
    const blocker = deferred();
    const controller = new AbortController();
    let started = 0;
    const gate = createLiteratureProviderRateGate(
      { providerKey: "openalex", requestsPerSecond: 1_000, maxConcurrency: 1 },
      { now: () => 1_000, sleep: async () => undefined }
    );
    const first = gate.run({ operationDeadlineMs: 10_000 }, async () => {
      started += 1;
      await blocker.promise;
    });
    await flushUntil(() => started === 1);
    let settled = false;
    const queued = gate.run(
      { operationDeadlineMs: 10_000, signal: controller.signal },
      async () => {
        started += 1;
      }
    ).then(
      () => null,
      (error: unknown) => error
    );
    void queued.then(() => {
      settled = true;
    });

    // When
    controller.abort(new DOMException("caller stopped", "AbortError"));
    await flushUntil(() => settled);
    const settledBeforeRelease = settled;
    blocker.resolve();
    await first;
    const error = await queued;

    // Then
    expect(settledBeforeRelease).toBe(true);
    expect(error).toBeInstanceOf(LiteratureProviderError);
    if (error instanceof LiteratureProviderError) {
      expect(error.code).toBe("cancelled");
    }
    expect(started).toBe(1);
  });

  it("rejects a concurrency waiter when its operation deadline expires", async () => {
    // Given
    const blocker = deferred();
    const deadlineController = new AbortController();
    let started = 0;
    const gate = createLiteratureProviderRateGate(
      { providerKey: "openalex", requestsPerSecond: 1_000, maxConcurrency: 1 },
      {
        now: () => 1_000,
        sleep: async () => undefined,
        createSignal: () => deadlineController.signal
      }
    );
    const first = gate.run({ operationDeadlineMs: 10_000 }, async () => {
      started += 1;
      await blocker.promise;
    });
    await flushUntil(() => started === 1);
    let settled = false;
    const queued = gate.run({ operationDeadlineMs: 1_100 }, async () => {
      started += 1;
    }).then(
      () => null,
      (error: unknown) => error
    );
    void queued.then(() => {
      settled = true;
    });

    // When
    deadlineController.abort(new DOMException("deadline elapsed", "TimeoutError"));
    await flushUntil(() => settled);
    const settledAtDeadline = settled;
    blocker.resolve();
    await first;
    const error = await queued;

    // Then
    expect(settledAtDeadline).toBe(true);
    expect(error).toBeInstanceOf(LiteratureProviderError);
    if (error instanceof LiteratureProviderError) {
      expect(error.code).toBe("deadline_exhausted");
    }
    expect(started).toBe(1);
  });

  it("turns Retry-After feedback into a bounded gate cooldown", async () => {
    // Given
    let nowMs = 1_000;
    const sleeps: number[] = [];
    const gate = createLiteratureProviderRateGate(
      { providerKey: "crossref", requestsPerSecond: 3, maxConcurrency: 2 },
      {
        now: () => nowMs,
        sleep: async (delayMs) => {
          sleeps.push(delayMs);
          nowMs += delayMs;
        }
      }
    );
    gate.applyServerFeedback(new Headers({ "Retry-After": "60" }));

    // When
    await gate.run({ operationDeadlineMs: 10_000 }, async () => undefined);

    // Then
    expect(sleeps).toEqual([2_000]);
  });

  it("fails before waiting when the absolute operation deadline cannot cover the cooldown", async () => {
    // Given
    const gate = createLiteratureProviderRateGate(
      { providerKey: "crossref", requestsPerSecond: 3, maxConcurrency: 2 },
      { now: () => 1_000, sleep: async () => undefined }
    );
    gate.applyServerFeedback(new Headers({ "Retry-After": "2" }));
    let called = false;

    // When
    let captured: unknown;
    try {
      await gate.run({ operationDeadlineMs: 1_500 }, async () => {
        called = true;
      });
    } catch (error) {
      if (error instanceof LiteratureProviderError) {
        captured = error;
      } else {
        throw error;
      }
    }

    // Then
    expect(captured).toBeInstanceOf(LiteratureProviderError);
    if (captured instanceof LiteratureProviderError) {
      expect(captured.code).toBe("deadline_exhausted");
    }
    expect(called).toBe(false);
  });

  it("preserves reservation spacing after malformed Retry-After feedback", async () => {
    // Given
    let nowMs = 1_000;
    const sleeps: number[] = [];
    const gate = createLiteratureProviderRateGate(
      { providerKey: "openalex", requestsPerSecond: 5, maxConcurrency: 2 },
      {
        now: () => nowMs,
        sleep: async (delayMs) => {
          sleeps.push(delayMs);
          nowMs += delayMs;
        }
      }
    );
    gate.applyServerFeedback(new Headers({ "Retry-After": "not-a-delay" }));

    // When
    await gate.run({ operationDeadlineMs: 5_000 }, async () => "first");
    await gate.run({ operationDeadlineMs: 5_000 }, async () => "second");

    // Then
    expect(sleeps).toEqual([200]);
  });
});
