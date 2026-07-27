import { describe, expect, it, vi } from "vitest";

import type { LiteratureProviderFetch } from "./provider-types.js";
import {
  createTransportFixture,
  expectProviderError
} from "./provider-transport.test-fixture.js";

describe("literature provider transport safety", () => {
  it("performs only a fixed-origin GET with manual redirects and returns a bounded body", async () => {
    // Given
    const fetchImplementation = vi.fn<LiteratureProviderFetch>().mockResolvedValue(
      new Response('{"ok":true}', {
        status: 200,
        headers: { "Content-Type": "application/json; charset=utf-8" }
      })
    );
    const fixture = createTransportFixture(fetchImplementation);

    // When
    const result = await fixture.transport.get({
      request: { pathname: "/works", queryValue: "private query" },
      operationDeadlineMs: fixture.operationDeadlineMs
    });

    // Then
    expect(result).toMatchObject({ body: '{"ok":true}', attempts: 1 });
    expect(fetchImplementation).toHaveBeenCalledWith(
      "https://api.openalex.org/works?query=private+query",
      expect.objectContaining({ method: "GET", redirect: "manual" })
    );
    expect(fetchImplementation.mock.calls[0]?.[1].signal).toBeInstanceOf(AbortSignal);
  });

  it("rejects redirects without following their location", async () => {
    // Given
    const fetchImplementation = vi.fn<LiteratureProviderFetch>().mockResolvedValue(
      new Response("redirect", {
        status: 302,
        headers: { Location: "http://127.0.0.1/private" }
      })
    );
    const fixture = createTransportFixture(fetchImplementation);

    // When
    const error = await expectProviderError(
      fixture.transport.get({
        request: { pathname: "/works" },
        operationDeadlineMs: fixture.operationDeadlineMs
      }),
      "redirect_rejected"
    );

    // Then
    expect(error.attempt).toBe(1);
    expect(fetchImplementation).toHaveBeenCalledTimes(1);
  });

  it("rejects every private or reserved DNS answer before fetch", async () => {
    // Given
    const fetchImplementation = vi.fn<LiteratureProviderFetch>();
    const privateAnswers = [
      "127.0.0.1",
      "10.0.0.1",
      "169.254.169.254",
      "192.168.1.1",
      "::1",
      "::ffff:127.0.0.1",
      "fc00::1",
      "fe80::1"
    ];

    // When
    for (const address of privateAnswers) {
      const fixture = createTransportFixture(fetchImplementation, {
        resolveAddresses: async () => [address]
      });
      await expectProviderError(
        fixture.transport.get({
          request: { pathname: "/works" },
          operationDeadlineMs: fixture.operationDeadlineMs
        }),
        "unsafe_destination"
      );
    }

    // Then
    expect(fetchImplementation).not.toHaveBeenCalled();
  });

  it("rejects an unexpected or missing success content type", async () => {
    // Given
    const responses = [
      new Response("<html></html>", {
        status: 200,
        headers: { "Content-Type": "text/html" }
      }),
      new Response("{}", { status: 200 })
    ];

    // When
    for (const response of responses) {
      const fetchImplementation = vi.fn<LiteratureProviderFetch>().mockResolvedValue(response);
      const fixture = createTransportFixture(fetchImplementation);
      await expectProviderError(
        fixture.transport.get({
          request: { pathname: "/works" },
          operationDeadlineMs: fixture.operationDeadlineMs
        }),
        "unexpected_content_type"
      );
    }

    // Then
    expect(responses).toHaveLength(2);
  });

  it("cancels a streamed body after the 1 MiB boundary", async () => {
    // Given
    let cancelled = false;
    const body = new ReadableStream<Uint8Array>({
      start(controller) {
        controller.enqueue(new Uint8Array(1024 * 1024));
        controller.enqueue(new Uint8Array([1]));
      },
      cancel() {
        cancelled = true;
      }
    });
    const fetchImplementation = vi.fn<LiteratureProviderFetch>().mockResolvedValue(
      new Response(body, {
        status: 200,
        headers: { "Content-Type": "application/json" }
      })
    );
    const fixture = createTransportFixture(fetchImplementation);

    // When
    await expectProviderError(
      fixture.transport.get({
        request: { pathname: "/works" },
        operationDeadlineMs: fixture.operationDeadlineMs
      }),
      "response_too_large"
    );

    // Then
    expect(cancelled).toBe(true);
  });

  it.each(["application/json", "application/xml"])(
    "rejects malformed UTF-8 for %s as a typed invalid response",
    async (contentType) => {
      // Given
      const fetchImplementation = vi.fn<LiteratureProviderFetch>().mockResolvedValue(
        new Response(new Uint8Array([0x22, 0xff, 0x22]), {
          status: 200,
          headers: { "Content-Type": contentType }
        })
      );
      const fixture = createTransportFixture(fetchImplementation);

      // When
      const error = await expectProviderError(
        fixture.transport.get({
          request: {
            pathname: "/works",
            expectedContentTypes: [contentType]
          },
          operationDeadlineMs: fixture.operationDeadlineMs
        }),
        "invalid_response"
      );

      // Then
      expect(error.statusClass).toBe("2xx");
      expect(fetchImplementation).toHaveBeenCalledTimes(1);
    }
  );

  it("rejects an adapter request that escapes its fixed origin", async () => {
    // Given
    const fetchImplementation = vi.fn<LiteratureProviderFetch>();
    const fixture = createTransportFixture(fetchImplementation);

    // When
    await expectProviderError(
      fixture.transport.get({
        request: { pathname: "//private.example/works" },
        operationDeadlineMs: fixture.operationDeadlineMs
      }),
      "unsafe_destination"
    );

    // Then
    expect(fetchImplementation).not.toHaveBeenCalled();
  });

  it("emits only the fixed sanitized telemetry shape", async () => {
    // Given
    const fetchImplementation = vi.fn<LiteratureProviderFetch>().mockResolvedValue(
      new Response('{"query":"private query","doi":"10.1000/hidden"}', {
        status: 200,
        headers: { "Content-Type": "application/json", "X-Secret": "response-secret" }
      })
    );
    const fixture = createTransportFixture(fetchImplementation);

    // When
    await fixture.transport.get({
      request: { pathname: "/works", queryValue: "private query" },
      operationDeadlineMs: fixture.operationDeadlineMs
    });

    // Then
    expect(fixture.events).toEqual([
      {
        providerKey: "openalex",
        action: "search",
        attempt: 1,
        statusClass: "2xx",
        latencyMs: 0,
        code: "ok"
      }
    ]);
    expect(JSON.stringify(fixture.events)).not.toMatch(
      /private query|10\.1000|works|api\.openalex|secret|authorization/i
    );
  });
});
