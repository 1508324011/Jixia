import { describe, expect, it } from "vitest";

import {
  literatureDiscoveryDefaultLimit,
  literatureDiscoveryMaxLimit,
  literatureDiscoveryMinLimit,
  literatureDiscoveryProviderFailureCodes,
  literatureIdentifierSchemes,
  literatureOpenAccessHostTypes,
  literatureOpenAccessVersions,
  type LiteratureAssertionHistoryDTO,
  type LiteratureDiscoveryProviderStatusDTO,
  type LiteratureDiscoverySearchRequest,
  type LiteratureDiscoverySearchResponse
} from "./index";

describe("Phase 2 literature contracts", () => {
  it("covers every canonical assertion discriminant with typed history", () => {
    // Given
    const provenance = {
      assertionId: "assertion-1",
      providerRecordId: "provider-record-1",
      ordinal: 1
    };
    const history = [
      { ...provenance, kind: "title", value: "A title" },
      { ...provenance, kind: "abstract", value: "An abstract" },
      { ...provenance, kind: "publicationYear", value: 2026 },
      { ...provenance, kind: "doi", value: "10.1000/phase-two" },
      { ...provenance, kind: "publicationDate", value: "2026-07-18" },
      { ...provenance, kind: "venue", value: "Jixia Journal" },
      { ...provenance, kind: "publicationType", value: "journal-article" },
      {
        ...provenance,
        kind: "authors",
        value: [{ displayName: "Ada Lovelace", orcid: "0000-0001-2345-6789" }]
      },
      {
        ...provenance,
        kind: "identifiers",
        value: [
          { scheme: "doi", value: "10.1000/phase-two" },
          { scheme: "pmid", value: "12345678" }
        ]
      },
      {
        ...provenance,
        kind: "openAccess",
        value: {
          isOpenAccess: true,
          bestUrl: "https://example.test/article",
          license: "cc-by",
          version: "published",
          hostType: "publisher"
        }
      },
      {
        ...provenance,
        kind: "publisher",
        value: { name: "Jixia Press", landingPageUrl: "https://example.test" }
      }
    ] satisfies readonly LiteratureAssertionHistoryDTO[];

    // When
    const discriminants = history.map((assertion) => assertion.kind);

    // Then
    expect(discriminants).toEqual([
      "title",
      "abstract",
      "publicationYear",
      "doi",
      "publicationDate",
      "venue",
      "publicationType",
      "authors",
      "identifiers",
      "openAccess",
      "publisher"
    ]);
    expect(literatureIdentifierSchemes).toEqual([
      "doi",
      "pmid",
      "pmcid",
      "openalex",
      "issn",
      "isbn"
    ]);
    expect(literatureOpenAccessVersions).toEqual(["published", "accepted", "submitted"]);
    expect(literatureOpenAccessHostTypes).toEqual(["publisher", "repository", "other"]);
  });

  it("represents normalized discovery without provider-native data", () => {
    // Given
    const request = {
      query: "glioblastoma",
      limit: literatureDiscoveryDefaultLimit,
      cursor: "opaque-search-cursor"
    } satisfies LiteratureDiscoverySearchRequest;
    const providerStatuses = [
      { providerKey: "openalex", status: "succeeded", resultCount: 2 },
      { providerKey: "crossref", status: "rate_limited", retryAfterSeconds: 2 },
      { providerKey: "pubmed", status: "unavailable", failureCode: "timeout" },
      { providerKey: "openalex", status: "unconfigured" }
    ] satisfies readonly LiteratureDiscoveryProviderStatusDTO[];
    const response = {
      candidates: [
        {
          title: "A normalized result",
          abstract: null,
          publicationYear: 2026,
          publicationDate: "2026-07-18",
          venue: "Jixia Journal",
          publicationType: "journal-article",
          doi: "10.1000/phase-two",
          authors: [{ displayName: "Ada Lovelace" }],
          identifiers: [{ scheme: "doi", value: "10.1000/phase-two" }],
          openAccess: { isOpenAccess: false },
          publisher: { landingPageUrl: "https://example.test/publisher" },
          sourceMatches: [
            { providerKey: "openalex", recordKey: "W1", providerRank: 1 },
            { providerKey: "crossref", recordKey: "10.1000/phase-two", providerRank: 1 },
            { providerKey: "pubmed", recordKey: "12345678", providerRank: 1 }
          ]
        }
      ],
      providerStatuses,
      nextCursor: "opaque-next-cursor"
    } satisfies LiteratureDiscoverySearchResponse;

    // When
    const providerStatusKinds = response.providerStatuses.map((provider) => provider.status);
    const sourceProviderKeys = response.candidates[0]?.sourceMatches.map(
      (source) => source.providerKey
    );
    const requestKeys = Object.keys(request).sort();

    // Then
    expect(providerStatusKinds).toEqual([
      "succeeded",
      "rate_limited",
      "unavailable",
      "unconfigured"
    ]);
    expect(sourceProviderKeys).toEqual(["openalex", "crossref", "pubmed"]);
    expect(requestKeys).toEqual(["cursor", "limit", "query"]);
    expect(literatureDiscoveryProviderFailureCodes).toEqual([
      "timeout",
      "network_error",
      "invalid_response",
      "response_too_large",
      "unsafe_response",
      "provider_unavailable"
    ]);
    expect(literatureDiscoveryMinLimit).toBe(3);
    expect(literatureDiscoveryMaxLimit).toBe(20);
  });

});
