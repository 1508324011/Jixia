import type { AdapterOwnedLiteratureRequest } from "../provider-types.js";
import { LiteratureProviderError } from "../provider-errors.js";
import type { NcbiServiceConfig } from "./ncbi.types.js";

export const pubMedOrigin = "https://eutils.ncbi.nlm.nih.gov";
export const pmcOrigin = "https://www.ncbi.nlm.nih.gov";

export type PubMedRequest =
  | {
      readonly kind: "search";
      readonly action: "search" | "doi_lookup";
      readonly term: string;
      readonly limit: number;
      readonly offset: number;
    }
  | {
      readonly kind: "summary";
      readonly ids: readonly string[];
    }
  | {
      readonly kind: "fetch";
      readonly action: "fetch_seed" | "doi_lookup";
      readonly pmid: string;
    };

export type PmcRequest = {
  readonly pmcid: string;
};

export function buildPubMedRequest(
  config: NcbiServiceConfig,
  request: PubMedRequest
): AdapterOwnedLiteratureRequest {
  switch (request.kind) {
    case "search":
      return {
        action: request.action,
        pathname: "/entrez/eutils/esearch.fcgi",
        query: [
          ["db", "pubmed"],
          ["term", request.term],
          ["retstart", String(request.offset)],
          ["retmax", String(request.limit)],
          ["retmode", "json"],
          ...ncbiIdentityQuery(config)
        ],
        headers: { Accept: "application/json" },
        expectedContentTypes: ["application/json"]
      };
    case "summary":
      return {
        action: "search",
        pathname: "/entrez/eutils/esummary.fcgi",
        query: [
          ["db", "pubmed"],
          ["id", request.ids.join(",")],
          ["retmode", "json"],
          ...ncbiIdentityQuery(config)
        ],
        headers: { Accept: "application/json" },
        expectedContentTypes: ["application/json"]
      };
    case "fetch":
      return {
        action: request.action,
        pathname: "/entrez/eutils/efetch.fcgi",
        query: [
          ["db", "pubmed"],
          ["id", request.pmid],
          ["retmode", "xml"],
          ...ncbiIdentityQuery(config)
        ],
        headers: { Accept: "application/xml" },
        expectedContentTypes: ["application/xml", "text/xml"]
      };
    default:
      return assertPubMedRequest(request);
  }
}

export function buildPmcRequest(
  config: NcbiServiceConfig,
  request: PmcRequest
): AdapterOwnedLiteratureRequest {
  return {
    action: "oa_lookup",
    pathname: "/pmc/utils/oa/oa.fcgi",
    query: [
      ["id", request.pmcid],
      ...ncbiIdentityQuery(config)
    ],
    headers: { Accept: "application/xml" },
    expectedContentTypes: ["application/xml", "text/xml"]
  };
}

function ncbiIdentityQuery(
  config: NcbiServiceConfig
): readonly (readonly [string, string])[] {
  return [
    ["api_key", config.apiKey],
    ["tool", config.tool],
    ["email", config.email]
  ];
}

function assertPubMedRequest(_request: never): never {
  throw new LiteratureProviderError({
    providerKey: "pubmed",
    action: "invalid_operation",
    attempt: 0,
    statusClass: null,
    latencyMs: 0,
    code: "internal_error"
  });
}
