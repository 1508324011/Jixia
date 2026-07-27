import { describe, expect, it } from "vitest";

import { loadLiteratureProviderConfig } from "../provider-config.js";
import { LiteratureProviderError } from "../provider-errors.js";
import {
  createUnpaywallTestAdapter,
  readUnpaywallFixture,
  unpaywallJsonResponse
} from "./unpaywall.test-fixture.js";

describe("Unpaywall adapter safety", () => {
  it("maps a missing DOI to a terminal typed not-found error", async () => {
    const fixture = createUnpaywallTestAdapter([
      () => unpaywallJsonResponse("not found", { status: 404 })
    ]);

    const operation = fixture.adapter.enrichDoi({
      doi: "10.1000/missing",
      operationDeadlineMs: fixture.operationDeadlineMs
    });

    await expect(operation).rejects.toMatchObject({
      providerKey: "unpaywall",
      action: "doi_enrichment",
      code: "not_found",
      attempt: 1,
      statusClass: "4xx"
    });
    expect(fixture.fetchImplementation).toHaveBeenCalledTimes(1);
  });

  it("forwards and retries each rate-limited response through the shared gate", async () => {
    const rateLimited = () => unpaywallJsonResponse("limited", {
      status: 429,
      headers: { "Retry-After": "1" }
    });
    const fixture = createUnpaywallTestAdapter([rateLimited, rateLimited, rateLimited]);

    const operation = fixture.adapter.enrichDoi({
      doi: "10.1000/alpha",
      operationDeadlineMs: fixture.operationDeadlineMs
    });

    await expect(operation).rejects.toMatchObject({ code: "rate_limited", attempt: 3 });
    expect(fixture.fetchImplementation).toHaveBeenCalledTimes(3);
    expect(fixture.applyServerFeedback).toHaveBeenCalledTimes(3);
  });

  it("rejects redirects without requesting their location", async () => {
    const fixture = createUnpaywallTestAdapter([
      () => unpaywallJsonResponse("redirect", {
        status: 302,
        headers: { Location: "http://127.0.0.1/private" }
      })
    ]);

    const operation = fixture.adapter.enrichDoi({
      doi: "10.1000/alpha",
      operationDeadlineMs: fixture.operationDeadlineMs
    });

    await expect(operation).rejects.toMatchObject({ code: "redirect_rejected", attempt: 1 });
    expect(fixture.fetchImplementation).toHaveBeenCalledTimes(1);
  });

  it("rejects a response larger than the shared one MiB boundary", async () => {
    const oversizedBody = JSON.stringify({ padding: "x".repeat(1024 * 1024) });
    const fixture = createUnpaywallTestAdapter([
      () => unpaywallJsonResponse(oversizedBody)
    ]);

    const operation = fixture.adapter.enrichDoi({
      doi: "10.1000/alpha",
      operationDeadlineMs: fixture.operationDeadlineMs
    });

    await expect(operation).rejects.toMatchObject({
      code: "response_too_large",
      statusClass: "2xx"
    });
  });

  it("honors cancellation before DOI transport", async () => {
    const fixture = createUnpaywallTestAdapter([]);
    const controller = new AbortController();
    controller.abort();

    const operation = fixture.adapter.enrichDoi({
      doi: "10.1000/alpha",
      operationDeadlineMs: fixture.operationDeadlineMs,
      signal: controller.signal
    });

    await expect(operation).rejects.toMatchObject({ code: "cancelled", attempt: 0 });
    expect(fixture.fetchImplementation).not.toHaveBeenCalled();
  });

  it("keeps missing-email configuration disabled without network access", async () => {
    const configState = loadLiteratureProviderConfig({}).providers.unpaywall;
    const fixture = createUnpaywallTestAdapter([], { configState });

    const operation = fixture.adapter.enrichDoi({
      doi: "10.1000/alpha",
      operationDeadlineMs: fixture.operationDeadlineMs
    });

    await expect(operation).rejects.toMatchObject({
      providerKey: "unpaywall",
      action: "doi_enrichment",
      code: "provider_unconfigured",
      attempt: 0
    });
    expect(fixture.fetchImplementation).not.toHaveBeenCalled();
  });

  it("sanitizes malformed response errors and telemetry without DOI or URL data", async () => {
    const body = await readUnpaywallFixture("malformed-location-url.json");
    const fixture = createUnpaywallTestAdapter([() => unpaywallJsonResponse(body)]);
    let captured: unknown;

    try {
      await fixture.adapter.enrichDoi({
        doi: "10.1000/alpha",
        operationDeadlineMs: fixture.operationDeadlineMs
      });
    } catch (error) {
      if (error instanceof LiteratureProviderError) {
        captured = error;
      } else {
        throw error;
      }
    }

    expect(captured).toMatchObject({
      providerKey: "unpaywall",
      action: "doi_enrichment",
      code: "invalid_response"
    });
    expect(JSON.stringify({ error: captured, events: fixture.events })).not.toMatch(
      /10\.1000|https?:|javascript|publisher\.example|unpaywall-test@example/i
    );
  });
});
