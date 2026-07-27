import type { AdapterOwnedLiteratureRequest } from "../provider-types.js";
import type { UnpaywallProviderConfig } from "../provider-config.js";

export type UnpaywallRequest = {
  readonly doi: string;
};

export const unpaywallOrigin = "https://api.unpaywall.org";

const unpaywallExpectedContentTypes = ["application/json"] as const;

export function buildUnpaywallRequest(
  config: UnpaywallProviderConfig,
  request: UnpaywallRequest
): AdapterOwnedLiteratureRequest {
  return {
    action: "doi_enrichment",
    pathname: `/v2/${encodeURIComponent(request.doi)}`,
    query: [["email", config.email]],
    headers: { Accept: "application/json" },
    expectedContentTypes: unpaywallExpectedContentTypes
  };
}
