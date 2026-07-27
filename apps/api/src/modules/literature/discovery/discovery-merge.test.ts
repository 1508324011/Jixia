import { describe, expect, it } from "vitest";

import {
  allocateLiteratureDiscoveryQuotas,
  mergeAndRankLiteratureDiscoveryRecords
} from "./discovery-merge.js";
import {
  crossrefRecord,
  openAlexRecord,
  pubMedRecord
} from "./discovery.test-fixture.js";

describe("literature discovery quota allocation", () => {
  it("uses floor division and assigns remainders by provider priority", () => {
    // Given
    const limits = [20, 5, 1];

    // When
    const quotas = limits.map(allocateLiteratureDiscoveryQuotas);

    // Then
    expect(quotas).toEqual([
      { openalex: 7, crossref: 7, pubmed: 6 },
      { openalex: 2, crossref: 2, pubmed: 1 },
      { openalex: 1, crossref: 0, pubmed: 0 }
    ]);
  });
});

describe("literature discovery exact merge and ranking", () => {
  it("merges overlapping DOI sources and applies fixed field precedence", () => {
    // Given
    const alpha = "10.1000/alpha";
    const input = {
      openalex: [openAlexRecord("W1", {
        title: "OpenAlex Alpha",
        abstract: null,
        doi: alpha,
        authors: [{ displayName: "OpenAlex Author" }],
        identifiers: [{ scheme: "doi", value: alpha }]
      })],
      crossref: [crossrefRecord(alpha, {
        title: "Crossref Alpha",
        abstract: "Crossref abstract",
        doi: alpha,
        authors: [{ displayName: "Crossref Author" }]
      })],
      pubmed: [pubMedRecord("12345678", {
        title: "PubMed Alpha",
        doi: alpha
      })]
    };

    // When
    const ranked = mergeAndRankLiteratureDiscoveryRecords(input);

    // Then
    expect(ranked).toHaveLength(1);
    expect(ranked[0]).toEqual({
      seenIdentities: [
        { kind: "doi", doi: alpha },
        { kind: "provider", providerKey: "openalex", recordKey: "W1" },
        { kind: "provider", providerKey: "crossref", recordKey: alpha },
        { kind: "provider", providerKey: "pubmed", recordKey: "12345678" }
      ],
      candidate: {
        title: "OpenAlex Alpha",
        abstract: "Crossref abstract",
        publicationYear: 2026,
        publicationDate: "2026-07-20",
        venue: "Fixture Journal",
        publicationType: "journal-article",
        doi: alpha,
        authors: [{ displayName: "OpenAlex Author" }],
        identifiers: [{ scheme: "doi", value: alpha }],
        openAccess: null,
        publisher: null,
        sourceMatches: [
          { providerKey: "openalex", recordKey: "W1", providerRank: 1 },
          { providerKey: "crossref", recordKey: alpha, providerRank: 1 },
          { providerKey: "pubmed", recordKey: "12345678", providerRank: 1 }
        ]
      }
    });
  });

  it("orders RRF ties by provider priority and canonical exact identity", () => {
    // Given
    const alpha = "10.1000/alpha";
    const beta = "10.1000/beta";
    const input = {
      openalex: [
        openAlexRecord("W-alpha", { title: "Alpha", doi: alpha }),
        openAlexRecord("W-beta", { title: "Beta", doi: beta })
      ],
      crossref: [
        crossrefRecord(beta, { title: "Beta Crossref", doi: beta }),
        crossrefRecord(alpha, { title: "Alpha Crossref", doi: alpha })
      ],
      pubmed: [pubMedRecord("3", { title: "PubMed only", doi: "10.1000/gamma" })]
    };

    // When
    const ranked = mergeAndRankLiteratureDiscoveryRecords(input);

    // Then
    expect(ranked.map((entry) => entry.candidate.doi)).toEqual([alpha, beta, "10.1000/gamma"]);
  });

  it("scores a merged candidate once per provider at its minimum rank", () => {
    // Given
    const alpha = "10.1000/alpha";
    const beta = "10.1000/beta";
    const input = {
      openalex: [
        openAlexRecord("W-alpha-1", { doi: alpha }),
        openAlexRecord("W-alpha-2", { doi: alpha })
      ],
      crossref: [crossrefRecord(beta, { doi: beta })],
      pubmed: [
        pubMedRecord("1", { doi: "10.1000/filler-1" }),
        pubMedRecord("2", { doi: "10.1000/filler-2" }),
        pubMedRecord("3", { doi: "10.1000/filler-3" }),
        pubMedRecord("4", { doi: "10.1000/filler-4" }),
        pubMedRecord("5", { doi: "10.1000/filler-5" }),
        pubMedRecord("6", { doi: beta })
      ]
    };

    // When
    const ranked = mergeAndRankLiteratureDiscoveryRecords(input);

    // Then
    expect(ranked.slice(0, 2).map((entry) => entry.candidate.doi)).toEqual([beta, alpha]);
    expect(ranked.find((entry) => entry.candidate.doi === alpha)?.candidate.sourceMatches).toEqual([
      { providerKey: "openalex", recordKey: "W-alpha-1", providerRank: 1 },
      { providerKey: "openalex", recordKey: "W-alpha-2", providerRank: 2 }
    ]);
  });

  it("deduplicates an exact provider identity when DOI is absent", () => {
    // Given
    const input = {
      openalex: [
        openAlexRecord("W-no-doi", { title: "First", doi: null }),
        openAlexRecord("W-no-doi", { title: "Second", doi: null })
      ],
      crossref: [],
      pubmed: []
    };

    // When
    const ranked = mergeAndRankLiteratureDiscoveryRecords(input);

    // Then
    expect(ranked).toHaveLength(1);
    expect(ranked[0]?.seenIdentities).toEqual([{
      kind: "provider",
      providerKey: "openalex",
      recordKey: "W-no-doi"
    }]);
    expect(ranked[0]?.candidate.sourceMatches).toEqual([
      { providerKey: "openalex", recordKey: "W-no-doi", providerRank: 1 }
    ]);
  });
});
