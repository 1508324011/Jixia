import { describe, expect, it } from "vitest";

import { LiteratureProviderError } from "../provider-errors.js";
import {
  createOpenAlexTestAdapter,
  openAlexJsonResponse,
  readOpenAlexFixture
} from "./openalex.test-fixture.js";

describe("OpenAlex adapter canonical lookup", () => {
  it("fetches a canonical work-ID seed", async () => {
    // Given
    const body = await readOpenAlexFixture("work-rich.json");
    const fixture = createOpenAlexTestAdapter([() => openAlexJsonResponse(body)]);

    // When
    const result = await fixture.adapter.fetchSeed({
      recordKey: "W1",
      operationDeadlineMs: fixture.operationDeadlineMs
    });

    // Then
    const url = new URL(fixture.fetchImplementation.mock.calls[0]?.[0] ?? "https://invalid.example");
    expect(url.pathname).toBe("/works/W1");
    expect(url.searchParams.get("api_key")).toBe("openalex-test-key");
    expect(result.source).toEqual({ providerKey: "openalex", recordKey: "W1" });
    expect(result.doi).toBe("10.1000/alpha");
  });

  it("looks up one exact canonical DOI through a singleton URN", async () => {
    // Given
    const body = await readOpenAlexFixture("work-rich.json");
    const fixture = createOpenAlexTestAdapter([() => openAlexJsonResponse(body)]);

    // When
    const result = await fixture.adapter.lookupDoi({
      doi: "10.1000/alpha",
      operationDeadlineMs: fixture.operationDeadlineMs
    });

    // Then
    const url = new URL(fixture.fetchImplementation.mock.calls[0]?.[0] ?? "https://invalid.example");
    expect(decodeURIComponent(url.pathname)).toBe("/works/doi:10.1000/alpha");
    expect(result.doi).toBe("10.1000/alpha");
  });

  it("rejects a conflicting DOI from an exact lookup with a sanitized identity signal", async () => {
    // Given
    const body = await readOpenAlexFixture("work-rich.json");
    const fixture = createOpenAlexTestAdapter([() => openAlexJsonResponse(body)]);

    // When
    const operation = fixture.adapter.lookupDoi({
      doi: "10.1000/other",
      operationDeadlineMs: fixture.operationDeadlineMs
    });

    // Then
    await expect(operation).rejects.toMatchObject({
      name: "LiteratureProviderIdentityConflictError",
      providerKey: "openalex",
      action: "doi_lookup",
      code: "invalid_response",
      statusClass: "2xx"
    });
    await expect(operation).rejects.not.toHaveProperty("expectedDoi");
    await expect(operation).rejects.not.toHaveProperty("actualDoi");
    await expect(operation).rejects.not.toHaveProperty("body");
  });

  it("rejects a noncanonical seed before transport", async () => {
    // Given
    const fixture = createOpenAlexTestAdapter([]);

    // When
    const operation = fixture.adapter.fetchSeed({
      recordKey: "https://attacker.example/W1",
      operationDeadlineMs: fixture.operationDeadlineMs
    });

    // Then
    await expect(operation).rejects.toMatchObject({
      providerKey: "openalex",
      action: "fetch_seed",
      code: "provider_rejected"
    });
    expect(fixture.fetchImplementation).not.toHaveBeenCalled();
  });

  it("rejects an overlong canonical-looking seed before transport", async () => {
    // Given
    const fixture = createOpenAlexTestAdapter([]);

    // When
    const operation = fixture.adapter.fetchSeed({
      recordKey: `W${"1".repeat(512)}`,
      operationDeadlineMs: fixture.operationDeadlineMs
    });

    // Then
    await expect(operation).rejects.toMatchObject({
      providerKey: "openalex",
      action: "fetch_seed",
      code: "provider_rejected"
    });
    expect(fixture.fetchImplementation).not.toHaveBeenCalled();
  });

  it("rejects conflicting provider identities as a sanitized invalid response", async () => {
    // Given
    const body = await readOpenAlexFixture("work-malformed-identity.json");
    const fixture = createOpenAlexTestAdapter([() => openAlexJsonResponse(body)]);

    // When
    const operation = fixture.adapter.fetchSeed({
      recordKey: "W9",
      operationDeadlineMs: fixture.operationDeadlineMs
    });

    // Then
    await expect(operation).rejects.toEqual(expect.objectContaining({
      name: "LiteratureProviderError",
      providerKey: "openalex",
      action: "fetch_seed",
      code: "invalid_response",
      statusClass: "2xx"
    }));
    await expect(operation).rejects.toBeInstanceOf(LiteratureProviderError);
    await expect(operation).rejects.not.toHaveProperty("body");
  });

  it("rejects duplicate abstract positions", async () => {
    // Given
    const body = await readOpenAlexFixture("work-malformed-abstract.json");
    const fixture = createOpenAlexTestAdapter([() => openAlexJsonResponse(body)]);

    // When
    const operation = fixture.adapter.fetchSeed({
      recordKey: "W10",
      operationDeadlineMs: fixture.operationDeadlineMs
    });

    // Then
    await expect(operation).rejects.toMatchObject({
      name: "LiteratureProviderError",
      code: "invalid_response"
    });
  });

  it("forwards every rate-limited response to the gate and never reaches the network", async () => {
    // Given
    const rateLimited = () => openAlexJsonResponse("limited", {
      status: 429,
      headers: { "Retry-After": "1" }
    });
    const fixture = createOpenAlexTestAdapter([rateLimited, rateLimited, rateLimited]);

    // When
    const operation = fixture.adapter.search({
      query: "glioblastoma",
      limit: 1,
      operationDeadlineMs: fixture.operationDeadlineMs
    });

    // Then
    await expect(operation).rejects.toMatchObject({
      name: "LiteratureProviderError",
      code: "rate_limited",
      attempt: 3
    });
    expect(fixture.fetchImplementation).toHaveBeenCalledTimes(3);
    expect(fixture.applyServerFeedback).toHaveBeenCalledTimes(3);
  });

  it("honors cancellation before lookup transport", async () => {
    // Given
    const fixture = createOpenAlexTestAdapter([]);
    const controller = new AbortController();
    controller.abort();

    // When
    const operation = fixture.adapter.lookupDoi({
      doi: "10.1000/alpha",
      operationDeadlineMs: fixture.operationDeadlineMs,
      signal: controller.signal
    });

    // Then
    await expect(operation).rejects.toMatchObject({ code: "cancelled", attempt: 0 });
    expect(fixture.fetchImplementation).not.toHaveBeenCalled();
  });
});
