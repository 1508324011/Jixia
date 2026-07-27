import type {
  LiteratureImportFailureCode,
  LiteratureImportWarningCode,
  LiteratureProviderKey
} from "@jixia/shared";

import {
  LiteratureProviderError,
  LiteratureProviderIdentityConflictError,
  type LiteratureProviderErrorCode
} from "./discovery/provider-errors.js";
import { LiteratureImportRepositoryError } from "./literature.import-repository.js";

const enrichmentWarnings = {
  openalex: "openalex_enrichment_unavailable",
  crossref: "crossref_enrichment_unavailable",
  pubmed: "pubmed_enrichment_unavailable",
  pmc: "pmc_enrichment_unavailable",
  unpaywall: "unpaywall_enrichment_unavailable"
} as const satisfies Readonly<Record<LiteratureProviderKey, LiteratureImportWarningCode>>;

export function classifySeedFailure(error: unknown): LiteratureImportFailureCode {
  if (!(error instanceof LiteratureProviderError)) {
    return "internal_error";
  }
  return seedFailureForProviderCode(error.code);
}

export type LiteratureEnrichmentFailure =
  | { readonly kind: "failed"; readonly failureCode: LiteratureImportFailureCode }
  | { readonly kind: "warning"; readonly warningCode: LiteratureImportWarningCode };

export function classifyEnrichmentFailure(
  providerKey: LiteratureProviderKey,
  error: unknown
): LiteratureEnrichmentFailure {
  if (error instanceof LiteratureProviderIdentityConflictError) {
    return { kind: "failed", failureCode: "identity_conflict" };
  }
  return error instanceof LiteratureProviderError
    ? { kind: "warning", warningCode: enrichmentWarnings[providerKey] }
    : { kind: "failed", failureCode: "internal_error" };
}

export function classifyFinalizationFailure(
  error: unknown
): LiteratureImportFailureCode | null {
  if (!(error instanceof LiteratureImportRepositoryError)) {
    return null;
  }
  switch (error.code) {
    case "identity_conflict":
      return "identity_conflict";
    case "invalid_batch":
    case "persistence_invariant":
      return "persistence_failed";
    case "not_found":
    case "forbidden":
      return "authorization_revoked";
    case "idempotency_conflict":
    case "operation_conflict":
    case "stale_attempt":
      return null;
    default: {
      const unreachable: never = error.code;
      throw unreachable;
    }
  }
}

function seedFailureForProviderCode(
  code: LiteratureProviderErrorCode
): LiteratureImportFailureCode {
  switch (code) {
    case "provider_unconfigured":
      return "provider_unconfigured";
    case "not_found":
      return "seed_not_found";
    case "invalid_response":
    case "redirect_rejected":
    case "response_too_large":
    case "unexpected_content_type":
    case "unsafe_destination":
      return "invalid_provider_response";
    case "internal_error":
      return "internal_error";
    case "cancelled":
    case "deadline_exhausted":
    case "network_error":
    case "provider_rejected":
    case "provider_unavailable":
    case "rate_limited":
    case "timeout":
      return "seed_unavailable";
    default: {
      const unreachable: never = code;
      throw unreachable;
    }
  }
}
