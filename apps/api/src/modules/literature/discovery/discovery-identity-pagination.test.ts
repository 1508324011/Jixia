import { describe, expect, it } from "vitest";

import { createLiteratureDiscoveryService } from "./discovery.service.js";
import {
  createDiscoveryTestCodec,
  createRecordingDiscoveryAdapters,
  crossrefRecord,
  discoveryTestNowMs,
  openAlexRecord,
  successfulStep
} from "./discovery.test-fixture.js";
import { LiteratureDiscoveryError } from "./discovery.types.js";

describe("literature discovery cursor identity aliases", () => {
  it.each([
    ["loses", "10.1000/alpha", null],
    ["gains", null, "10.1000/alpha"]
  ] as const)("suppresses the same provider record when its DOI %s on page two", async (
    _change,
    firstDoi,
    secondDoi
  ) => {
    // Given
    const fixture = createRecordingDiscoveryAdapters({
      openalex: [
        successfulStep([openAlexRecord("W1", { doi: firstDoi })], "openalex-page-2"),
        successfulStep([openAlexRecord("W1", { doi: secondDoi })])
      ],
      crossref: [successfulStep([])],
      pubmed: [successfulStep([])]
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

    // Then
    expect(second.candidates).toEqual([]);
    expect(fixture.openalex.calls).toHaveLength(2);
  });

  it("retains a provider alias learned from a suppressed DOI duplicate", async () => {
    // Given
    const alpha = "10.1000/alpha";
    const fixture = createRecordingDiscoveryAdapters({
      openalex: [successfulStep([openAlexRecord("W1", { doi: alpha })])],
      crossref: [
        successfulStep([], "crossref-page-2"),
        successfulStep([crossrefRecord("C1", { doi: alpha })], "crossref-page-3"),
        successfulStep([crossrefRecord("C1", { doi: null })])
      ],
      pubmed: [successfulStep([])]
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
    const second = await service.search({
      query: "glioblastoma",
      limit: 20,
      cursor: first.nextCursor
    });
    if (second.nextCursor === null) {
      throw new LiteratureDiscoveryError("invalid_cursor", 400);
    }

    // When
    const third = await service.search({
      query: "glioblastoma",
      limit: 20,
      cursor: second.nextCursor
    });

    // Then
    expect(second.candidates).toEqual([]);
    expect(third.candidates).toEqual([]);
    expect(fixture.crossref.calls).toHaveLength(3);
  });

  it("suppresses an alternate DOI learned from a transitive same-provider merge", async () => {
    // Given
    const alpha = "10.1000/alpha";
    const beta = "10.1000/beta";
    const fixture = createRecordingDiscoveryAdapters({
      openalex: [successfulStep([
        openAlexRecord("W1", { doi: alpha }),
        openAlexRecord("W1", { doi: beta })
      ])],
      crossref: [
        successfulStep([], "crossref-page-2"),
        successfulStep([crossrefRecord("crossref-beta", { doi: beta })])
      ],
      pubmed: [successfulStep([])]
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

    // Then
    expect(first.candidates.map((candidate) => candidate.doi)).toEqual([alpha]);
    expect(second.candidates).toEqual([]);
    expect(fixture.crossref.calls).toHaveLength(2);
  });
});
