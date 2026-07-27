import { describe, expect, it } from "vitest";

import { createLiteratureDiscoveryService } from "./discovery.service.js";
import {
  createDiscoveryTestCodec,
  createRecordingDiscoveryAdapters,
  crossrefRecord,
  discoveryTestNowMs,
  failedStep,
  openAlexRecord,
  pubMedRecord,
  successfulStep
} from "./discovery.test-fixture.js";
import { LiteratureDiscoveryError } from "./discovery.types.js";

async function captureDiscoveryError(
  operation: Promise<unknown>
): Promise<LiteratureDiscoveryError> {
  try {
    await operation;
  } catch (error) {
    expect(error).toBeInstanceOf(LiteratureDiscoveryError);
    if (error instanceof LiteratureDiscoveryError) {
      return error;
    }
    throw error;
  }
  throw new LiteratureDiscoveryError("discovery_unavailable", 503);
}

describe("literature discovery provider composition", () => {
  it("calls all providers exactly once with deterministic quotas on a new search", async () => {
    // Given
    const alpha = "10.1000/alpha";
    const fixture = createRecordingDiscoveryAdapters({
      openalex: [successfulStep([openAlexRecord("W1", { title: "OpenAlex", doi: alpha })])],
      crossref: [successfulStep([crossrefRecord(alpha, { title: "Crossref", doi: alpha })])],
      pubmed: [successfulStep([pubMedRecord("1", { title: "PubMed", doi: alpha })])]
    });
    const service = createLiteratureDiscoveryService({
      adapters: fixture.adapters,
      cursorCodec: createDiscoveryTestCodec(),
      now: () => discoveryTestNowMs
    });

    // When
    const response = await service.search({ query: "glioblastoma", limit: 20 });

    // Then
    expect(fixture.openalex.calls).toEqual([{
      query: "glioblastoma",
      limit: 7,
      operationDeadlineMs: discoveryTestNowMs + 8_000
    }]);
    expect(fixture.crossref.calls).toEqual([{
      query: "glioblastoma",
      limit: 7,
      operationDeadlineMs: discoveryTestNowMs + 8_000
    }]);
    expect(fixture.pubmed.calls).toEqual([{
      query: "glioblastoma",
      limit: 6,
      operationDeadlineMs: discoveryTestNowMs + 8_000
    }]);
    expect(response.candidates).toHaveLength(1);
    expect(response.candidates[0]?.doi).toBe(alpha);
    expect(response.providerStatuses).toEqual([
      { providerKey: "openalex", status: "succeeded", resultCount: 1 },
      { providerKey: "crossref", status: "succeeded", resultCount: 1 },
      { providerKey: "pubmed", status: "succeeded", resultCount: 1 }
    ]);
  });

  it("returns every provider status when one provider times out", async () => {
    // Given
    const fixture = createRecordingDiscoveryAdapters({
      openalex: [successfulStep([openAlexRecord("W1", { doi: "10.1000/alpha" })], "oa-2")],
      crossref: [failedStep("crossref", "timeout")],
      pubmed: [successfulStep([pubMedRecord("1", { doi: "10.1000/alpha" })], "2")]
    });
    const service = createLiteratureDiscoveryService({
      adapters: fixture.adapters,
      cursorCodec: createDiscoveryTestCodec(),
      now: () => discoveryTestNowMs
    });

    // When
    const response = await service.search({ query: "glioblastoma", limit: 20 });

    // Then
    expect(response.providerStatuses).toEqual([
      { providerKey: "openalex", status: "succeeded", resultCount: 1 },
      { providerKey: "crossref", status: "unavailable", failureCode: "timeout" },
      { providerKey: "pubmed", status: "succeeded", resultCount: 1 }
    ]);
    expect(response.nextCursor).not.toBeNull();
  });

  it("maps an all-rate-limited search to 429", async () => {
    // Given
    const fixture = createRecordingDiscoveryAdapters({
      openalex: [failedStep("openalex", "rate_limited")],
      crossref: [failedStep("crossref", "rate_limited")],
      pubmed: [failedStep("pubmed", "rate_limited")]
    });
    const service = createLiteratureDiscoveryService({
      adapters: fixture.adapters,
      cursorCodec: createDiscoveryTestCodec()
    });

    // When
    const error = await captureDiscoveryError(
      service.search({ query: "glioblastoma", limit: 20 })
    );

    // Then
    expect(error).toMatchObject({ code: "discovery_rate_limited", statusCode: 429 });
  });

  it("maps an all-unconfigured search to a distinct 503", async () => {
    // Given
    const fixture = createRecordingDiscoveryAdapters({
      openalex: [failedStep("openalex", "provider_unconfigured")],
      crossref: [failedStep("crossref", "provider_unconfigured")],
      pubmed: [failedStep("pubmed", "provider_unconfigured")]
    });
    const service = createLiteratureDiscoveryService({
      adapters: fixture.adapters,
      cursorCodec: createDiscoveryTestCodec()
    });

    // When
    const error = await captureDiscoveryError(
      service.search({ query: "glioblastoma", limit: 20 })
    );

    // Then
    expect(error).toMatchObject({ code: "discovery_unconfigured", statusCode: 503 });
  });

  it.each([
    [
      1,
      "rate_limited",
      "discovery_rate_limited",
      429,
      { openalex: 1, crossref: 0, pubmed: 0 }
    ],
    [
      2,
      "rate_limited",
      "discovery_rate_limited",
      429,
      { openalex: 1, crossref: 1, pubmed: 0 }
    ],
    [
      1,
      "provider_unconfigured",
      "discovery_unconfigured",
      503,
      { openalex: 1, crossref: 0, pubmed: 0 }
    ],
    [
      2,
      "provider_unconfigured",
      "discovery_unconfigured",
      503,
      { openalex: 1, crossref: 1, pubmed: 0 }
    ]
  ] as const)("maps limit %i quota-bearing %s failures to %s", async (
    limit,
    providerErrorCode,
    expectedCode,
    expectedStatusCode,
    expectedCalls
  ) => {
    // Given
    const fixture = createRecordingDiscoveryAdapters({
      openalex: [failedStep("openalex", providerErrorCode)],
      crossref: [failedStep("crossref", providerErrorCode)],
      pubmed: [failedStep("pubmed", providerErrorCode)]
    });
    const service = createLiteratureDiscoveryService({
      adapters: fixture.adapters,
      cursorCodec: createDiscoveryTestCodec()
    });

    // When
    const error = await captureDiscoveryError(
      service.search({ query: "glioblastoma", limit })
    );

    // Then
    expect(error).toMatchObject({ code: expectedCode, statusCode: expectedStatusCode });
    expect({
      openalex: fixture.openalex.calls.length,
      crossref: fixture.crossref.calls.length,
      pubmed: fixture.pubmed.calls.length
    }).toEqual(expectedCalls);
  });

  it("maps mixed unavailable failures to 503 without exposing provider details", async () => {
    // Given
    const fixture = createRecordingDiscoveryAdapters({
      openalex: [failedStep("openalex", "network_error")],
      crossref: [failedStep("crossref", "invalid_response")],
      pubmed: [failedStep("pubmed", "provider_unavailable")]
    });
    const service = createLiteratureDiscoveryService({
      adapters: fixture.adapters,
      cursorCodec: createDiscoveryTestCodec()
    });

    // When
    const error = await captureDiscoveryError(
      service.search({ query: "glioblastoma", limit: 20 })
    );

    // Then
    expect(error).toMatchObject({ code: "discovery_unavailable", statusCode: 503 });
    expect(JSON.stringify(error)).not.toMatch(/glioblastoma|network_error|invalid_response/u);
  });
});
