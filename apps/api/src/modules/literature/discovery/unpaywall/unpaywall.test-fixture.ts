import { readFile } from "node:fs/promises";

import { vi } from "vitest";

import type {
  LiteratureProviderFetch,
  LiteratureProviderLogEvent,
  LiteratureProviderRateGate
} from "../provider-types.js";
import { createUnpaywallAdapter } from "./unpaywall.adapter.js";
import type { UnpaywallAdapterConfigState } from "./unpaywall.types.js";

type ResponseFactory = () => Response;

type UnpaywallTestAdapterOptions = {
  readonly configState?: UnpaywallAdapterConfigState;
};

export type UnpaywallTestAdapter = {
  readonly adapter: ReturnType<typeof createUnpaywallAdapter>;
  readonly applyServerFeedback: ReturnType<
    typeof vi.fn<LiteratureProviderRateGate["applyServerFeedback"]>
  >;
  readonly events: readonly LiteratureProviderLogEvent[];
  readonly fetchImplementation: ReturnType<typeof vi.fn<LiteratureProviderFetch>>;
  readonly operationDeadlineMs: number;
};

export function createUnpaywallTestAdapter(
  responseFactories: readonly ResponseFactory[],
  options: UnpaywallTestAdapterOptions = {}
): UnpaywallTestAdapter {
  const queuedResponses = [...responseFactories];
  const fetchImplementation = vi.fn<LiteratureProviderFetch>(async () => {
    const responseFactory = queuedResponses.shift();
    if (responseFactory === undefined) {
      throw new TypeError("Unpaywall test response queue exhausted.");
    }
    return responseFactory();
  });
  const applyServerFeedback = vi.fn<LiteratureProviderRateGate["applyServerFeedback"]>();
  const rateGate: LiteratureProviderRateGate = {
    async run(_context, operation) {
      return operation();
    },
    applyServerFeedback
  };
  const events: LiteratureProviderLogEvent[] = [];
  const now = () => 1_000;
  const configState = options.configState ?? {
    status: "enabled",
    config: { providerKey: "unpaywall", email: "unpaywall-test@example.com" }
  };

  return {
    adapter: createUnpaywallAdapter(configState, {
      rateGate,
      transport: {
        fetchImplementation,
        logger: { record: (event) => events.push(event) },
        now,
        random: () => 0,
        resolveAddresses: async () => ["8.8.8.8"],
        sleep: async () => undefined
      }
    }),
    applyServerFeedback,
    events,
    fetchImplementation,
    operationDeadlineMs: now() + 8_000
  };
}

export async function readUnpaywallFixture(name: string): Promise<string> {
  return readFile(new URL(`./fixtures/${name}`, import.meta.url), "utf8");
}

export function unpaywallJsonResponse(
  body: string,
  options: {
    readonly status?: number;
    readonly headers?: Readonly<Record<string, string>>;
  } = {}
): Response {
  return new Response(body, {
    status: options.status ?? 200,
    headers: {
      "Content-Type": "application/json",
      ...options.headers
    }
  });
}
