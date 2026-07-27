import { describe, expect, it } from "vitest";

import {
  canonicalAssertionKinds,
  literatureDiscoveryDefaultLimit,
  literatureDiscoveryMaxLimit,
  literatureDiscoveryMinLimit,
  literatureImportOperationStatuses,
  literatureImportSeedProviderKeys,
  literatureLibraryDefaultLimit,
  literatureLibraryMaxLimit,
  literatureProviderKeys,
  literatureSearchProviderKeys
} from "./index";

describe("literature Phase 2 vocabulary", () => {
  it("pins canonical, provider, seed, and operation vocabularies", () => {
    // Given
    const expectedVocabularies = {
      canonicalHistory: [
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
      ],
      providers: ["openalex", "crossref", "pubmed", "pmc", "unpaywall"],
      searchProviders: ["openalex", "crossref", "pubmed"],
      importSeeds: ["openalex", "crossref", "pubmed"],
      operationStatuses: ["running", "succeeded", "failed"]
    };

    // When
    const actualVocabularies = {
      canonicalHistory: [...canonicalAssertionKinds],
      providers: [...literatureProviderKeys],
      searchProviders: [...literatureSearchProviderKeys],
      importSeeds: [...literatureImportSeedProviderKeys],
      operationStatuses: [...literatureImportOperationStatuses]
    };

    // Then
    expect(actualVocabularies).toEqual(expectedVocabularies);
  });

  it("pins discovery and library limits", () => {
    // Given
    const expectedLimits = {
      discoveryDefault: 20,
      discoveryMin: 3,
      discoveryMax: 20,
      libraryDefault: 20,
      libraryMax: 50
    };

    // When
    const actualLimits = {
      discoveryDefault: literatureDiscoveryDefaultLimit,
      discoveryMin: literatureDiscoveryMinLimit,
      discoveryMax: literatureDiscoveryMaxLimit,
      libraryDefault: literatureLibraryDefaultLimit,
      libraryMax: literatureLibraryMaxLimit
    };

    // Then
    expect(actualLimits).toEqual(expectedLimits);
  });
});
