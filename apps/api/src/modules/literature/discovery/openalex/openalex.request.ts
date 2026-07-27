import type { OpenAlexProviderConfig } from "../provider-config.js";
import { LiteratureProviderError } from "../provider-errors.js";
import type { AdapterOwnedLiteratureRequest } from "../provider-types.js";

export const openAlexOrigin = "https://api.openalex.org";

const openAlexSelectedFields = [
  "id",
  "doi",
  "title",
  "publication_year",
  "publication_date",
  "type",
  "primary_location",
  "best_oa_location",
  "open_access",
  "authorships",
  "ids",
  "abstract_inverted_index"
].join(",");

export type OpenAlexRequest =
  | {
      readonly kind: "search";
      readonly query: string;
      readonly limit: number;
      readonly cursor: string;
    }
  | {
      readonly kind: "seed";
      readonly recordKey: string;
    }
  | {
      readonly kind: "doi";
      readonly doi: string;
    };

export function buildOpenAlexRequest(
  config: OpenAlexProviderConfig,
  request: OpenAlexRequest
): AdapterOwnedLiteratureRequest {
  const commonQuery = [
    ["select", openAlexSelectedFields],
    ["api_key", config.apiKey]
  ] as const;
  switch (request.kind) {
    case "search":
      return {
        action: "search",
        pathname: "/works",
        query: [
          ["search", request.query],
          ["per_page", String(request.limit)],
          ["cursor", request.cursor],
          ...commonQuery
        ] as const,
        headers: { Accept: "application/json" },
        expectedContentTypes: ["application/json"]
      };
    case "seed":
      return {
        action: "fetch_seed",
        pathname: `/works/${request.recordKey}`,
        query: commonQuery,
        headers: { Accept: "application/json" },
        expectedContentTypes: ["application/json"]
      };
    case "doi":
      return {
        action: "doi_lookup",
        pathname: `/works/${encodeURIComponent(`doi:${request.doi}`)}`,
        query: commonQuery,
        headers: { Accept: "application/json" },
        expectedContentTypes: ["application/json"]
      };
    default:
      return assertOpenAlexRequest(request);
  }
}

function assertOpenAlexRequest(_request: never): never {
  throw new LiteratureProviderError({
    providerKey: "openalex",
    action: "invalid_operation",
    attempt: 0,
    statusClass: null,
    latencyMs: 0,
    code: "internal_error"
  });
}
