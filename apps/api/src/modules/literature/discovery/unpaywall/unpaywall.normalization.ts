import type {
  LiteratureOpenAccessValue,
  LiteratureOpenAccessVersion,
  LiteraturePublisherValue
} from "@jixia/shared";

import {
  isCanonicalLiteratureDoi,
  normalizeLiteratureDoi,
  normalizeLiteratureText
} from "../../literature.normalization.js";
import { LiteraturePayloadError } from "../provider-errors.js";
import { normalizeProviderReferenceUrl } from "../provider-reference-url.js";
import type { UnpaywallResponse } from "./unpaywall.schema.js";
import type { UnpaywallEnrichment } from "./unpaywall.types.js";

const unpaywallVersionMap = {
  publishedVersion: "published",
  acceptedVersion: "accepted",
  submittedVersion: "submitted"
} as const satisfies Readonly<Record<string, LiteratureOpenAccessVersion>>;

export function normalizeUnpaywallResponse(
  response: UnpaywallResponse
): UnpaywallEnrichment {
  const doi = normalizeLiteratureDoi(response.doi);
  if (!isCanonicalLiteratureDoi(doi)) {
    throw invalidUnpaywallPayload();
  }
  if (response.is_oa !== (response.best_oa_location !== null)) {
    throw invalidUnpaywallPayload();
  }

  return {
    source: { providerKey: "unpaywall", recordKey: doi },
    doi,
    openAccess: normalizeOpenAccess(response),
    publisher: normalizePublisher(response.publisher, response.doi_url)
  };
}

function normalizeOpenAccess(response: UnpaywallResponse): LiteratureOpenAccessValue {
  const location = response.best_oa_location;
  if (location === null) {
    return { isOpenAccess: false };
  }
  const preferredUrl = location.url_for_pdf ?? location.url_for_landing_page;
  if (location.url !== preferredUrl) {
    throw invalidUnpaywallPayload();
  }
  const license = location.license === null
    ? null
    : normalizeLiteratureText(location.license);
  if (license !== null && license.length === 0) {
    throw invalidUnpaywallPayload();
  }
  return {
    isOpenAccess: true,
    bestUrl: normalizeProviderReferenceUrl(location.url),
    ...(license === null ? {} : { license }),
    ...(location.version === null
      ? {}
      : { version: unpaywallVersionMap[location.version] }),
    hostType: location.host_type
  };
}

function normalizePublisher(
  publisher: string | null,
  landingPageUrl: string
): LiteraturePublisherValue {
  const name = publisher === null ? null : normalizeLiteratureText(publisher);
  const normalizedUrl = normalizeProviderReferenceUrl(landingPageUrl);
  return name === null || name.length === 0
    ? { landingPageUrl: normalizedUrl }
    : { name, landingPageUrl: normalizedUrl };
}

function invalidUnpaywallPayload(): LiteraturePayloadError {
  return new LiteraturePayloadError("invalid_response");
}
