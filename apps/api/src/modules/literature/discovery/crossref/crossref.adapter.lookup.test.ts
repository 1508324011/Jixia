import { describe, expect, it } from "vitest";

import {
  createCrossrefTestAdapter,
  crossrefJsonResponse,
  readCrossrefFixture
} from "./crossref.test-fixture.js";

describe("Crossref adapter exact DOI lookup", () => {
  it("canonicalizes a seed DOI and safely encodes its exact work path", async () => {
    // Given
    const body = await readCrossrefFixture("work-rich.json");
    const fixture = createCrossrefTestAdapter([() => crossrefJsonResponse(body)]);

    // When
    const result = await fixture.adapter.fetchSeed({
      recordKey: " DOI:10.1000/ALPHA(2024)/PART ",
      operationDeadlineMs: fixture.operationDeadlineMs
    });

    // Then
    const url = new URL(fixture.fetchImplementation.mock.calls[0]?.[0] ?? "https://invalid.example");
    expect(decodeURIComponent(url.pathname)).toBe("/works/10.1000/alpha(2024)/part");
    expect(url.searchParams.get("mailto")).toBe("crossref-test@example.com");
    expect(result).toMatchObject({
      source: { providerKey: "crossref", recordKey: "10.1000/alpha(2024)/part" },
      title: "Exact DOI work",
      abstract: "First ordered paragraph. Second paragraph.",
      publicationYear: 2020,
      publicationDate: "2020",
      doi: "10.1000/alpha(2024)/part",
      authors: [{ displayName: "Exact Consortium" }]
    });
  });

  it("rejects a conflicting DOI returned by an exact lookup", async () => {
    // Given
    const body = await readCrossrefFixture("work-conflicting-doi.json");
    const fixture = createCrossrefTestAdapter([() => crossrefJsonResponse(body)]);

    // When
    const operation = fixture.adapter.lookupDoi({
      doi: "10.1000/alpha",
      operationDeadlineMs: fixture.operationDeadlineMs
    });

    // Then
    await expect(operation).rejects.toMatchObject({
      name: "LiteratureProviderIdentityConflictError",
      providerKey: "crossref",
      action: "doi_lookup",
      code: "invalid_response",
      statusClass: "2xx"
    });
    await expect(operation).rejects.not.toHaveProperty("expectedDoi");
    await expect(operation).rejects.not.toHaveProperty("actualDoi");
    await expect(operation).rejects.not.toHaveProperty("body");
  });

  it("rejects a malformed input DOI before transport", async () => {
    // Given
    const fixture = createCrossrefTestAdapter([]);

    // When
    const operation = fixture.adapter.lookupDoi({
      doi: "https://attacker.example/not-a-doi",
      operationDeadlineMs: fixture.operationDeadlineMs
    });

    // Then
    await expect(operation).rejects.toMatchObject({
      providerKey: "crossref",
      action: "doi_lookup",
      code: "provider_rejected",
      attempt: 0
    });
    expect(fixture.fetchImplementation).not.toHaveBeenCalled();
  });

  it("forwards every rate-limited response to the gate", async () => {
    // Given
    const rateLimited = () => crossrefJsonResponse("limited", {
      status: 429,
      headers: { "Retry-After": "1", "X-Rate-Limit-Limit": "50" }
    });
    const fixture = createCrossrefTestAdapter([rateLimited, rateLimited, rateLimited]);

    // When
    const operation = fixture.adapter.lookupDoi({
      doi: "10.1000/alpha",
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

  it("honors cancellation before exact lookup transport", async () => {
    // Given
    const fixture = createCrossrefTestAdapter([]);
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
