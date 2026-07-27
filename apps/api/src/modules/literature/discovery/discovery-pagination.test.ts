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

describe("literature discovery cursor pagination", () => {
  it.each([
    [1, { openalex: 1, crossref: 0, pubmed: 0 }],
    [2, { openalex: 1, crossref: 1, pubmed: 0 }]
  ] as const)("does not advertise a dead cursor when limit %i exhausts its quota providers", async (
    limit,
    expectedCalls
  ) => {
    // Given
    const fixture = createRecordingDiscoveryAdapters({
      openalex: [successfulStep([openAlexRecord("W1", { doi: "10.1000/openalex" })])],
      crossref: [successfulStep([crossrefRecord("10.1000/crossref", {
        doi: "10.1000/crossref"
      })])],
      pubmed: [successfulStep([pubMedRecord("1", { doi: "10.1000/pubmed" })])]
    });
    const service = createLiteratureDiscoveryService({
      adapters: fixture.adapters,
      cursorCodec: createDiscoveryTestCodec(),
      now: () => discoveryTestNowMs
    });

    // When
    const response = await service.search({ query: "glioblastoma", limit });

    // Then
    expect(response.candidates).toHaveLength(limit);
    expect(response.nextCursor).toBeNull();
    expect({
      openalex: fixture.openalex.calls.length,
      crossref: fixture.crossref.calls.length,
      pubmed: fixture.pubmed.calls.length
    }).toEqual(expectedCalls);
  });

  it("returns the exact second page, suppresses seen DOI, and keeps failures disabled", async () => {
    // Given
    const alpha = "10.1000/alpha";
    const fixture = createRecordingDiscoveryAdapters({
      openalex: [
        successfulStep([openAlexRecord("W1", { doi: alpha })], "oa-2"),
        successfulStep([openAlexRecord("W2", { doi: "10.1000/openalex-two" })]),
        successfulStep([openAlexRecord("W3", { doi: "10.1000/openalex-new" })])
      ],
      crossref: [
        failedStep("crossref", "timeout"),
        successfulStep([crossrefRecord("10.1000/crossref-new", { doi: "10.1000/crossref-new" })])
      ],
      pubmed: [
        successfulStep([pubMedRecord("1", { doi: alpha })], "2"),
        successfulStep([
          pubMedRecord("1", { doi: alpha }),
          pubMedRecord("2", { doi: "10.1000/pubmed-two" })
        ]),
        successfulStep([pubMedRecord("3", { doi: "10.1000/pubmed-new" })])
      ]
    });
    const service = createLiteratureDiscoveryService({
      adapters: fixture.adapters,
      cursorCodec: createDiscoveryTestCodec(),
      now: () => discoveryTestNowMs
    });
    const first = await service.search({ query: "glioblastoma", limit: 20 });
    if (first.nextCursor === null) {
      throw new LiteratureDiscoveryError("invalid_cursor", 400);
    }

    // When
    const second = await service.search({
      query: "glioblastoma",
      limit: 20,
      cursor: first.nextCursor
    });
    const crossrefCallsAfterSecondPage = fixture.crossref.calls.length;
    await service.search({ query: "glioblastoma", limit: 20 });

    // Then
    expect(second.candidates.map((candidate) => candidate.doi)).toEqual([
      "10.1000/openalex-two",
      "10.1000/pubmed-two"
    ]);
    expect(second.providerStatuses).toContainEqual({
      providerKey: "crossref",
      status: "unavailable",
      failureCode: "provider_unavailable"
    });
    expect(crossrefCallsAfterSecondPage).toBe(1);
    expect(fixture.crossref.calls).toHaveLength(2);
  });

});
