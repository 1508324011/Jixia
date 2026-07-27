import { readFile } from "node:fs/promises";

import { vi } from "vitest";

import { createOpenAlexAdapter } from "./openalex.adapter.js";
import type { LiteratureProviderFetch, LiteratureProviderRateGate } from "../provider-types.js";

type ResponseFactory = () => Response;

export type OpenAlexTestAdapter = {
  readonly adapter: ReturnType<typeof createOpenAlexAdapter>;
  readonly applyServerFeedback: ReturnType<
    typeof vi.fn<LiteratureProviderRateGate["applyServerFeedback"]>
  >;
  readonly fetchImplementation: ReturnType<typeof vi.fn<LiteratureProviderFetch>>;
  readonly operationDeadlineMs: number;
};

export function createOpenAlexTestAdapter(
  responseFactories: readonly ResponseFactory[]
): OpenAlexTestAdapter {
  const queuedResponses = [...responseFactories];
  const fetchImplementation = vi.fn<LiteratureProviderFetch>(async () => {
    const responseFactory = queuedResponses.shift();
    if (responseFactory === undefined) {
      throw new TypeError("OpenAlex test response queue exhausted.");
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
  const now = () => 1_000;
  return {
    adapter: createOpenAlexAdapter(
      { providerKey: "openalex", apiKey: "openalex-test-key" },
      {
        rateGate,
        transport: {
          fetchImplementation,
          now,
          random: () => 0,
          resolveAddresses: async () => ["8.8.8.8"],
          sleep: async () => undefined
        }
      }
    ),
    applyServerFeedback,
    fetchImplementation,
    operationDeadlineMs: now() + 8_000
  };
}

export async function readOpenAlexFixture(name: string): Promise<string> {
  return readFile(new URL(`./fixtures/${name}`, import.meta.url), "utf8");
}

export function openAlexJsonResponse(
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
