import { describe, expect, it } from "vitest";

import { LiteratureProviderError } from "../provider-errors.js";
import { createCrossrefAdapter } from "./crossref.adapter.js";
import { createCrossrefRateGate } from "./crossref.rate-gate.js";
import { crossrefJsonResponse } from "./crossref.test-fixture.js";

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

describe("Crossref adaptive rate gate", () => {
  it("retains the local three-request-per-second ceiling when server headers are higher", async () => {
    // Given
    let nowMs = 1_000;
    const sleeps: number[] = [];
    const gate = createCrossrefRateGate({
      now: () => nowMs,
      sleep: async (delayMs) => {
        sleeps.push(delayMs);
        nowMs += delayMs;
      }
    });
    await gate.run({ operationDeadlineMs: 10_000 }, async () => undefined);
    gate.applyServerFeedback(new Headers({
      "X-Rate-Limit-Limit": "50",
      "X-Rate-Limit-Interval": "1s",
      "X-Concurrency-Limit": "3"
    }));

    // When
    await gate.run({ operationDeadlineMs: 10_000 }, async () => undefined);

    // Then
    expect(sleeps).toHaveLength(1);
    expect(sleeps[0]).toBeCloseTo(1_000 / 3);
  });

  it("waits for a lower Crossref rate window before the next request", async () => {
    // Given
    let nowMs = 1_000;
    const sleeps: number[] = [];
    const gate = createCrossrefRateGate({
      now: () => nowMs,
      sleep: async (delayMs) => {
        sleeps.push(delayMs);
        nowMs += delayMs;
      }
    });
    await gate.run({ operationDeadlineMs: 10_000 }, async () => undefined);
    gate.applyServerFeedback(new Headers({
      "X-Rate-Limit-Limit": "1",
      "X-Rate-Limit-Interval": "2s"
    }));

    // When
    await gate.run({ operationDeadlineMs: 10_000 }, async () => undefined);

    // Then
    expect(sleeps).toEqual([2_000]);
  });

  it("serializes requests when Crossref lowers concurrency to one", async () => {
    // Given
    let started = 0;
    let active = 0;
    let maximumActive = 0;
    const blockers = [deferred(), deferred()];
    const gate = createCrossrefRateGate({
      now: () => 1_000,
      sleep: async () => undefined
    });
    gate.applyServerFeedback(new Headers({ "X-Concurrency-Limit": "1" }));

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
    await flushUntil(() => started === 1);

    // Then
    expect(started).toBe(1);
    blockers[0]?.resolve();
    await flushUntil(() => started === 2);
    expect(started).toBe(2);
    blockers[1]?.resolve();
    await Promise.all(runs);
    expect(maximumActive).toBe(1);
  });

  it("applies lower rate headers through the adapter default gate", async () => {
    // Given
    let nowMs = 1_000;
    let fetchCount = 0;
    const sleeps: number[] = [];
    const sleep = async (delayMs: number) => {
      sleeps.push(delayMs);
      nowMs += delayMs;
    };
    const body = JSON.stringify({
      status: "ok",
      "message-type": "work",
      "message-version": "1.0.0",
      message: { DOI: "10.1000/alpha" }
    });
    const adapter = createCrossrefAdapter(
      { providerKey: "crossref", mailto: "crossref-test@example.com" },
      {
        rateGateDependencies: { now: () => nowMs, sleep },
        transport: {
          fetchImplementation: async () => {
            fetchCount += 1;
            return crossrefJsonResponse(body, {
              headers: {
                "X-Rate-Limit-Limit": "1",
                "X-Rate-Limit-Interval": "2s"
              }
            });
          },
          now: () => nowMs,
          random: () => 0,
          resolveAddresses: async () => ["8.8.8.8"],
          sleep
        }
      }
    );
    await adapter.lookupDoi({
      doi: "10.1000/alpha",
      operationDeadlineMs: 10_000
    });

    // When
    await adapter.lookupDoi({
      doi: "10.1000/alpha",
      operationDeadlineMs: 10_000
    });

    // Then
    expect(sleeps).toEqual([2_000]);
    expect(fetchCount).toBe(2);
  });

  it("cancels a waiter queued behind a lower Crossref concurrency limit", async () => {
    // Given
    const blocker = deferred();
    const controller = new AbortController();
    let started = 0;
    const gate = createCrossrefRateGate({
      now: () => 1_000,
      sleep: async () => undefined
    });
    gate.applyServerFeedback(new Headers({ "X-Concurrency-Limit": "1" }));
    const first = gate.run({ operationDeadlineMs: 10_000 }, async () => {
      started += 1;
      await blocker.promise;
    });
    await flushUntil(() => started === 1);
    const queued = gate.run(
      { operationDeadlineMs: 10_000, signal: controller.signal },
      async () => {
        started += 1;
      }
    ).then(
      () => null,
      (error: unknown) => error
    );

    // When
    controller.abort(new DOMException("caller stopped", "AbortError"));
    const error = await queued;
    blocker.resolve();
    await first;

    // Then
    expect(error).toBeInstanceOf(LiteratureProviderError);
    if (error instanceof LiteratureProviderError) {
      expect(error.code).toBe("cancelled");
    }
    expect(started).toBe(1);
  });

  it("rejects before a lower Crossref rate window exceeds the deadline", async () => {
    // Given
    let operationCalled = false;
    const gate = createCrossrefRateGate({
      now: () => 1_000,
      sleep: async () => undefined
    });
    await gate.run({ operationDeadlineMs: 10_000 }, async () => undefined);
    gate.applyServerFeedback(new Headers({
      "X-Rate-Limit-Limit": "1",
      "X-Rate-Limit-Interval": "2s"
    }));

    // When
    const operation = gate.run({ operationDeadlineMs: 2_000 }, async () => {
      operationCalled = true;
    });

    // Then
    await expect(operation).rejects.toMatchObject({
      action: "rate_gate",
      code: "deadline_exhausted"
    });
    expect(operationCalled).toBe(false);
  });
});
