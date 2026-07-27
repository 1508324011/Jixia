import type { LiteratureProviderKey } from "@jixia/shared";

export const literatureProviderErrorCodes = [
  "cancelled",
  "deadline_exhausted",
  "invalid_response",
  "network_error",
  "not_found",
  "provider_rejected",
  "provider_unavailable",
  "provider_unconfigured",
  "rate_limited",
  "redirect_rejected",
  "response_too_large",
  "timeout",
  "unexpected_content_type",
  "unsafe_destination",
  "internal_error"
] as const;

export type LiteratureProviderErrorCode = (typeof literatureProviderErrorCodes)[number];
export type LiteratureProviderStatusClass = "2xx" | "3xx" | "4xx" | "5xx";

export type LiteratureProviderErrorDetails = {
  readonly providerKey: LiteratureProviderKey;
  readonly action: string;
  readonly attempt: number;
  readonly statusClass: LiteratureProviderStatusClass | null;
  readonly latencyMs: number;
  readonly code: LiteratureProviderErrorCode;
};

const safeActionPattern = /^[a-z][a-z0-9_]{0,63}$/u;

export function sanitizeLiteratureProviderAction(action: string): string {
  return safeActionPattern.test(action) ? action : "invalid_operation";
}

export class LiteratureProviderError extends Error {
  readonly name: string = "LiteratureProviderError";
  readonly providerKey: LiteratureProviderKey;
  readonly action: string;
  readonly attempt: number;
  readonly statusClass: LiteratureProviderStatusClass | null;
  readonly latencyMs: number;
  readonly code: LiteratureProviderErrorCode;

  constructor(details: LiteratureProviderErrorDetails) {
    super("Literature provider request failed.");
    this.providerKey = details.providerKey;
    this.action = sanitizeLiteratureProviderAction(details.action);
    this.attempt = details.attempt;
    this.statusClass = details.statusClass;
    this.latencyMs = details.latencyMs;
    this.code = details.code;
  }
}

export class LiteratureProviderIdentityConflictError extends LiteratureProviderError {
  readonly name = "LiteratureProviderIdentityConflictError";

  constructor(details: Omit<LiteratureProviderErrorDetails, "code">) {
    super({ ...details, code: "invalid_response" });
  }
}

export const literaturePayloadErrorCodes = [
  "invalid_response",
  "response_too_large",
  "unsafe_response",
  "internal_error"
] as const;

export type LiteraturePayloadErrorCode = (typeof literaturePayloadErrorCodes)[number];

export class LiteraturePayloadError extends Error {
  readonly name = "LiteraturePayloadError";

  constructor(readonly code: LiteraturePayloadErrorCode) {
    super("Literature provider payload was rejected.");
  }
}

export class LiteratureCursorError extends Error {
  readonly name = "LiteratureCursorError";
  readonly code = "invalid_cursor" as const;

  constructor() {
    super("Invalid literature discovery cursor.");
  }
}
