import { expect } from "vitest";

import { LiteratureProviderError } from "./provider-errors.js";
import { createLiteratureProviderTransport } from "./provider-transport.js";
import type {
  LiteratureProviderFetch,
  LiteratureProviderLogEvent,
  LiteratureProviderRateGate,
  LiteratureProviderTransportDependencies
} from "./provider-types.js";

export type TransportFixtureRequest = {
  readonly pathname: string;
  readonly queryValue?: string;
  readonly expectedContentTypes?: readonly string[];
};

export const immediateRateGate: LiteratureProviderRateGate = {
  async run(_context, operation) {
    return operation();
  },
  applyServerFeedback() {}
};

export function createTransportFixture(
  fetchImplementation: LiteratureProviderFetch,
  overrides: Omit<LiteratureProviderTransportDependencies, "fetchImplementation"> = {},
  rateGate: LiteratureProviderRateGate = immediateRateGate
) {
  const events: LiteratureProviderLogEvent[] = [];
  const now = overrides.now ?? (() => 1_000);
  const transport = createLiteratureProviderTransport<TransportFixtureRequest>(
    {
      providerKey: "openalex",
      origin: "https://api.openalex.org",
      rateGate,
      buildRequest(request) {
        return {
          action: "search",
          pathname: request.pathname,
          query: request.queryValue === undefined
            ? []
            : [["query", request.queryValue]],
          headers: {
            Accept: request.expectedContentTypes?.join(", ") ?? "application/json",
            Authorization: "Bearer transport-test-secret"
          },
          expectedContentTypes: request.expectedContentTypes ?? ["application/json"]
        };
      }
    },
    {
      ...overrides,
      fetchImplementation,
      now,
      resolveAddresses: overrides.resolveAddresses ?? (async () => ["8.8.8.8"]),
      sleep: overrides.sleep ?? (async () => undefined),
      logger: overrides.logger ?? { record: (event) => events.push(event) }
    }
  );

  return {
    events,
    transport,
    operationDeadlineMs: now() + 8_000
  };
}

export async function expectProviderError(
  operation: Promise<unknown>,
  expectedCode: LiteratureProviderError["code"]
): Promise<LiteratureProviderError> {
  try {
    await operation;
  } catch (error) {
    expect(error).toBeInstanceOf(LiteratureProviderError);
    if (error instanceof LiteratureProviderError) {
      expect(error.code).toBe(expectedCode);
      return error;
    }
    throw error;
  }
  throw new LiteratureProviderError({
    providerKey: "openalex",
    action: "test_assertion",
    attempt: 0,
    statusClass: null,
    latencyMs: 0,
    code: "internal_error"
  });
}
