import {
  LiteraturePayloadError,
  LiteratureProviderError,
  LiteratureProviderIdentityConflictError
} from "../provider-errors.js";

export type NcbiProviderKey = "pubmed" | "pmc";

export function rejectedNcbiRequest(
  providerKey: NcbiProviderKey,
  action: string
): LiteratureProviderError {
  return new LiteratureProviderError({
    providerKey,
    action,
    attempt: 0,
    statusClass: null,
    latencyMs: 0,
    code: "provider_rejected"
  });
}

export function invalidNcbiResponse(
  providerKey: NcbiProviderKey,
  action: string,
  attempt: number
): LiteratureProviderError {
  return new LiteratureProviderError({
    providerKey,
    action,
    attempt,
    statusClass: "2xx",
    latencyMs: 0,
    code: "invalid_response"
  });
}

export function pubMedIdentityConflict(
  action: string,
  attempt: number
): LiteratureProviderIdentityConflictError {
  return new LiteratureProviderIdentityConflictError({
    providerKey: "pubmed",
    action,
    attempt,
    statusClass: "2xx",
    latencyMs: 0
  });
}

export function missingNcbiRecord(
  providerKey: NcbiProviderKey,
  action: string,
  attempt: number
): LiteratureProviderError {
  return new LiteratureProviderError({
    providerKey,
    action,
    attempt,
    statusClass: "2xx",
    latencyMs: 0,
    code: "not_found"
  });
}

export function withNcbiPayloadErrors<TResult>(
  providerKey: NcbiProviderKey,
  action: string,
  attempt: number,
  operation: () => TResult
): TResult {
  try {
    return operation();
  } catch (error) {
    if (error instanceof LiteraturePayloadError) {
      throw new LiteratureProviderError({
        providerKey,
        action,
        attempt,
        statusClass: "2xx",
        latencyMs: 0,
        code: error.code === "response_too_large"
          ? "response_too_large"
          : "invalid_response"
      });
    }
    throw error;
  }
}
