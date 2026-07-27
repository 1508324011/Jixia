import { LiteratureProviderError } from "../provider-errors.js";
import type { AdapterOwnedLiteratureRequest } from "../provider-types.js";
import type { CrossrefAdapterConfig } from "./crossref.types.js";

export type CrossrefRequest =
  | {
      readonly kind: "search";
      readonly query: string;
      readonly limit: number;
      readonly cursor: string;
    }
  | {
      readonly kind: "work";
      readonly action: "fetch_seed" | "doi_lookup";
      readonly doi: string;
    };

export const crossrefOrigin = "https://api.crossref.org";

const crossrefExpectedContentTypes = ["application/json"] as const;

export function buildCrossrefRequest(
  config: CrossrefAdapterConfig,
  request: CrossrefRequest
): AdapterOwnedLiteratureRequest {
  const headers = {
    Accept: "application/json",
    "User-Agent": `Jixia/1.0 (mailto:${config.mailto})`
  } as const;
  switch (request.kind) {
    case "search":
      return {
        action: "search",
        pathname: "/works",
        query: [
          ["query.bibliographic", request.query],
          ["rows", String(request.limit)],
          ["cursor", request.cursor],
          ["mailto", config.mailto]
        ],
        headers,
        expectedContentTypes: crossrefExpectedContentTypes
      };
    case "work":
      return {
        action: request.action,
        pathname: `/works/${encodeURIComponent(request.doi)}`,
        query: [["mailto", config.mailto]],
        headers,
        expectedContentTypes: crossrefExpectedContentTypes
      };
    default:
      return assertCrossrefRequest(request);
  }
}

function assertCrossrefRequest(_request: never): never {
  throw new LiteratureProviderError({
    providerKey: "crossref",
    action: "invalid_operation",
    attempt: 0,
    statusClass: null,
    latencyMs: 0,
    code: "internal_error"
  });
}
