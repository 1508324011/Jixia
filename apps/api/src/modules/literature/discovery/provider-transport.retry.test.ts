import { describe, expect, it, vi } from "vitest";

import type { LiteratureProviderFetch } from "./provider-types.js";
import {
  createTransportFixture,
  expectProviderError
} from "./provider-transport.test-fixture.js";

const jsonResponse = () => new Response("{}", {
  status: 200,
  headers: { "Content-Type": "application/json" }
});

describe("literature provider transport retries", () => {
  it("retries a timeout once and then returns the successful response", async () => {
    // Given
    const fetchImplementation = vi.fn<LiteratureProviderFetch>()
      .mockRejectedValueOnce(new DOMException("sensitive timeout detail", "TimeoutError"))
      .mockResolvedValueOnce(jsonResponse());
    const resolver = vi.fn(async () => ["8.8.8.8"]);
    const fixture = createTransportFixture(fetchImplementation, { resolveAddresses: resolver });

    // When
    const result = await fixture.transport.get({
      request: { pathname: "/works", queryValue: "private query" },
      operationDeadlineMs: fixture.operationDeadlineMs
    });

    // Then
    expect(result.attempts).toBe(2);
    expect(fetchImplementation).toHaveBeenCalledTimes(2);
    expect(resolver).toHaveBeenCalledTimes(2);
    expect(JSON.stringify(fixture.events)).not.toContain("sensitive timeout detail");
  });

  it("retries a timeout raised while consuming the response body", async () => {
    // Given
    const timedOutBody = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.error(new DOMException("sensitive streamed timeout", "TimeoutError"));
      }
    });
    const fetchImplementation = vi.fn<LiteratureProviderFetch>()
      .mockResolvedValueOnce(new Response(timedOutBody, {
        status: 200,
        headers: { "Content-Type": "application/json" }
      }))
      .mockResolvedValueOnce(jsonResponse());
    const fixture = createTransportFixture(fetchImplementation);

    // When
    const result = await fixture.transport.get({
      request: { pathname: "/works" },
      operationDeadlineMs: fixture.operationDeadlineMs
    });

    // Then
    expect(result.attempts).toBe(2);
    expect(fetchImplementation).toHaveBeenCalledTimes(2);
    expect(JSON.stringify(fixture.events)).not.toContain("sensitive streamed timeout");
  });

  it("bounds Retry-After before a 429 retry", async () => {
    // Given
    const sleeps: number[] = [];
    const fetchImplementation = vi.fn<LiteratureProviderFetch>()
      .mockResolvedValueOnce(new Response("limited", {
        status: 429,
        headers: { "Retry-After": "60" }
      }))
      .mockResolvedValueOnce(jsonResponse());
    const fixture = createTransportFixture(fetchImplementation, {
      sleep: async (delayMs) => {
        sleeps.push(delayMs);
      }
    });

    // When
    const result = await fixture.transport.get({
      request: { pathname: "/works" },
      operationDeadlineMs: fixture.operationDeadlineMs
    });

    // Then
    expect(result.attempts).toBe(2);
    expect(sleeps).toEqual([2_000]);
  });

  it.each([
    { label: "missing", headers: new Headers() },
    { label: "malformed", headers: new Headers({ "Retry-After": "not-a-delay" }) }
  ])("uses bounded jitter when Retry-After is $label", async ({ headers }) => {
    // Given
    const sleeps: number[] = [];
    const fetchImplementation = vi.fn<LiteratureProviderFetch>()
      .mockResolvedValueOnce(new Response("limited", { status: 429, headers }))
      .mockResolvedValueOnce(jsonResponse());
    const fixture = createTransportFixture(fetchImplementation, {
      random: () => 0.5,
      sleep: async (delayMs) => {
        sleeps.push(delayMs);
      }
    });

    // When
    const result = await fixture.transport.get({
      request: { pathname: "/works" },
      operationDeadlineMs: fixture.operationDeadlineMs
    });

    // Then
    expect(result.attempts).toBe(2);
    expect(sleeps).toEqual([125]);
  });

  it("uses deterministic injected random samples for concurrent retry jitter", async () => {
    // Given
    const delays: number[] = [];
    const samples = [0.2, 0.8];
    let fetchCalls = 0;
    let releaseSleeps = () => {};
    const bothSleepsStarted = new Promise<void>((resolve) => {
      releaseSleeps = resolve;
    });
    const fetchImplementation = vi.fn<LiteratureProviderFetch>(async () => {
      fetchCalls += 1;
      return fetchCalls <= 2
        ? new Response("unavailable", { status: 503 })
        : jsonResponse();
    });
    const fixture = createTransportFixture(fetchImplementation, {
      random: () => samples.shift() ?? 0,
      sleep: async (delayMs) => {
        delays.push(delayMs);
        if (delays.length === 2) {
          releaseSleeps();
        }
        await bothSleepsStarted;
      }
    });

    // When
    const results = await Promise.all([
      fixture.transport.get({
        request: { pathname: "/works/first" },
        operationDeadlineMs: fixture.operationDeadlineMs
      }),
      fixture.transport.get({
        request: { pathname: "/works/second" },
        operationDeadlineMs: fixture.operationDeadlineMs
      })
    ]);

    // Then
    expect(results.map((result) => result.attempts)).toEqual([2, 2]);
    expect([...delays].sort((left, right) => left - right)).toEqual([50, 200]);
  });

  it("uses bounded Math.random jitter when no random source is injected", async () => {
    // Given
    const random = vi.spyOn(Math, "random").mockReturnValue(0.5);
    const delays: number[] = [];
    const fetchImplementation = vi.fn<LiteratureProviderFetch>()
      .mockResolvedValueOnce(new Response("unavailable", { status: 503 }))
      .mockResolvedValueOnce(jsonResponse());

    try {
      const fixture = createTransportFixture(fetchImplementation, {
        sleep: async (delayMs) => {
          delays.push(delayMs);
        }
      });

      // When
      const result = await fixture.transport.get({
        request: { pathname: "/works" },
        operationDeadlineMs: fixture.operationDeadlineMs
      });

      // Then
      expect(result.attempts).toBe(2);
      expect(random).toHaveBeenCalledTimes(1);
      expect(delays).toEqual([125]);
    } finally {
      random.mockRestore();
    }
  });

  it("makes one initial attempt plus at most two retries for 5xx", async () => {
    // Given
    const fetchImplementation = vi.fn<LiteratureProviderFetch>().mockResolvedValue(
      new Response("upstream detail", { status: 503 })
    );
    const fixture = createTransportFixture(fetchImplementation);

    // When
    const error = await expectProviderError(
      fixture.transport.get({
        request: { pathname: "/works", queryValue: "private query" },
        operationDeadlineMs: fixture.operationDeadlineMs
      }),
      "provider_unavailable"
    );

    // Then
    expect(error.attempt).toBe(3);
    expect(error.statusClass).toBe("5xx");
    expect(fetchImplementation).toHaveBeenCalledTimes(3);
    expect(JSON.stringify(error)).not.toMatch(/upstream detail|private query|works/i);
  });

  it("does not retry ordinary 4xx or not-found responses", async () => {
    // Given
    const cases = [
      { status: 400, code: "provider_rejected" as const },
      { status: 404, code: "not_found" as const }
    ];

    // When
    for (const testCase of cases) {
      const fetchImplementation = vi.fn<LiteratureProviderFetch>().mockResolvedValue(
        new Response("forbidden detail", { status: testCase.status })
      );
      const fixture = createTransportFixture(fetchImplementation);
      await expectProviderError(
        fixture.transport.get({
          request: { pathname: "/works" },
          operationDeadlineMs: fixture.operationDeadlineMs
        }),
        testCase.code
      );
      expect(fetchImplementation).toHaveBeenCalledTimes(1);
    }

    // Then
    expect(cases).toHaveLength(2);
  });

  it("does not begin a retry whose delay exhausts the operation deadline", async () => {
    // Given
    const fetchImplementation = vi.fn<LiteratureProviderFetch>().mockResolvedValue(
      new Response("unavailable", { status: 503 })
    );
    const fixture = createTransportFixture(fetchImplementation, {
      now: () => 1_000,
      random: () => 1
    });

    // When
    const error = await expectProviderError(
      fixture.transport.get({
        request: { pathname: "/works" },
        operationDeadlineMs: 1_200
      }),
      "provider_unavailable"
    );

    // Then
    expect(error.attempt).toBe(1);
    expect(fetchImplementation).toHaveBeenCalledTimes(1);
  });

  it("honors caller cancellation without starting a connection", async () => {
    // Given
    const fetchImplementation = vi.fn<LiteratureProviderFetch>();
    const resolver = vi.fn(async () => ["8.8.8.8"]);
    const fixture = createTransportFixture(fetchImplementation, { resolveAddresses: resolver });
    const controller = new AbortController();
    controller.abort(new DOMException("caller stopped", "AbortError"));

    // When
    const error = await expectProviderError(
      fixture.transport.get({
        request: { pathname: "/works" },
        operationDeadlineMs: fixture.operationDeadlineMs,
        signal: controller.signal
      }),
      "cancelled"
    );

    // Then
    expect(error.attempt).toBe(0);
    expect(resolver).not.toHaveBeenCalled();
    expect(fetchImplementation).not.toHaveBeenCalled();
  });
});
