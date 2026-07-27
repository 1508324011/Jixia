export const assertionKinds = ["title", "abstract", "publicationYear", "doi"] as const;
export type AssertionKind = (typeof assertionKinds)[number];

export const assertionKindOrder = {
  title: 0,
  abstract: 1,
  publicationYear: 2,
  doi: 3
} as const satisfies Readonly<Record<AssertionKind, number>>;

export const canonicalAssertionKinds = [
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
] as const;
export type CanonicalAssertionKind = (typeof canonicalAssertionKinds)[number];

export const relationKinds = ["cites"] as const;
export type RelationKind = (typeof relationKinds)[number];

export const providerKeyMaxLength = 128;
export const providerRecordKeyMaxLength = 512;

export const literatureProviderKeys = [
  "openalex",
  "crossref",
  "pubmed",
  "pmc",
  "unpaywall"
] as const;
export type LiteratureProviderKey = (typeof literatureProviderKeys)[number];

export const literatureSearchProviderKeys = ["openalex", "crossref", "pubmed"] as const;
export type LiteratureSearchProviderKey = (typeof literatureSearchProviderKeys)[number];

export const literatureImportSeedProviderKeys = ["openalex", "crossref", "pubmed"] as const;
export type LiteratureImportSeedProviderKey = (typeof literatureImportSeedProviderKeys)[number];

export const literatureIdentifierSchemes = [
  "doi",
  "pmid",
  "pmcid",
  "openalex",
  "issn",
  "isbn"
] as const;
export type LiteratureIdentifierScheme = (typeof literatureIdentifierSchemes)[number];

export const literatureOpenAccessVersions = ["published", "accepted", "submitted"] as const;
export type LiteratureOpenAccessVersion = (typeof literatureOpenAccessVersions)[number];

export const literatureOpenAccessHostTypes = ["publisher", "repository", "other"] as const;
export type LiteratureOpenAccessHostType = (typeof literatureOpenAccessHostTypes)[number];

export const literatureDiscoveryProviderStatuses = [
  "succeeded",
  "rate_limited",
  "unavailable",
  "unconfigured"
] as const;
export type LiteratureDiscoveryProviderStatus =
  (typeof literatureDiscoveryProviderStatuses)[number];

export const literatureDiscoveryProviderFailureCodes = [
  "timeout",
  "network_error",
  "invalid_response",
  "response_too_large",
  "unsafe_response",
  "provider_unavailable"
] as const;
export type LiteratureDiscoveryProviderFailureCode =
  (typeof literatureDiscoveryProviderFailureCodes)[number];

export const literatureImportOperationStatuses = ["running", "succeeded", "failed"] as const;
export type LiteratureImportOperationStatus = (typeof literatureImportOperationStatuses)[number];

export const literatureImportWarningCodes = [
  "openalex_enrichment_unavailable",
  "crossref_enrichment_unavailable",
  "pubmed_enrichment_unavailable",
  "pmc_enrichment_unavailable",
  "unpaywall_enrichment_unavailable"
] as const;
export type LiteratureImportWarningCode = (typeof literatureImportWarningCodes)[number];

export const literatureImportFailureCodes = [
  "provider_unconfigured",
  "seed_not_found",
  "seed_unavailable",
  "invalid_provider_response",
  "identity_conflict",
  "authorization_revoked",
  "persistence_failed",
  "internal_error"
] as const;
export type LiteratureImportFailureCode = (typeof literatureImportFailureCodes)[number];

export const literatureDiscoveryDefaultLimit = 20;
export const literatureDiscoveryMinLimit = 3;
export const literatureDiscoveryMaxLimit = 20;
export const literatureLibraryDefaultLimit = 20;
export const literatureLibraryMaxLimit = 50;
