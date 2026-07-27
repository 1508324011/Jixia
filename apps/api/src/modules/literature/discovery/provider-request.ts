import type { LiteratureProviderKey } from "@jixia/shared";

import { LiteratureProviderError } from "./provider-errors.js";

type LiteratureProviderRequestContext = {
  readonly providerKey: LiteratureProviderKey;
  readonly action: string;
};

export function parseFixedLiteratureProviderOrigin(input: {
  readonly origin: string;
  readonly providerKey: LiteratureProviderKey;
}): URL {
  try {
    const origin = new URL(input.origin);
    if (
      origin.protocol !== "https:" || origin.username || origin.password ||
      origin.pathname !== "/" || origin.search || origin.hash
    ) {
      throw unsafeDestination(input.providerKey, "configure_transport");
    }
    return origin;
  } catch (error) {
    if (error instanceof LiteratureProviderError) {
      throw error;
    }
    throw unsafeDestination(input.providerKey, "configure_transport");
  }
}

export function buildFixedLiteratureProviderUrl(input: {
  readonly origin: URL;
  readonly pathname: string;
  readonly query: readonly (readonly [string, string])[];
  readonly context: LiteratureProviderRequestContext;
}): URL {
  try {
    const url = new URL(input.pathname, input.origin);
    if (
      url.origin !== input.origin.origin || !input.pathname.startsWith("/") ||
      input.pathname.startsWith("//")
    ) {
      throw unsafeDestination(input.context.providerKey, input.context.action);
    }
    const search = new URLSearchParams();
    for (const [name, value] of input.query) {
      search.append(name, value);
    }
    url.search = search.toString();
    return url;
  } catch (error) {
    if (error instanceof LiteratureProviderError) {
      throw error;
    }
    throw unsafeDestination(input.context.providerKey, input.context.action);
  }
}

function unsafeDestination(providerKey: LiteratureProviderKey, action: string): LiteratureProviderError {
  return new LiteratureProviderError({
    providerKey,
    action,
    attempt: 0,
    statusClass: null,
    latencyMs: 0,
    code: "unsafe_destination"
  });
}
