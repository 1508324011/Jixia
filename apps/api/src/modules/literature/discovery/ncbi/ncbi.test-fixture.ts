import { readFile } from "node:fs/promises";

import { vi } from "vitest";

import type {
  LiteratureProviderFetch,
  LiteratureProviderRateGate
} from "../provider-types.js";
import { createNcbiAdapters } from "./ncbi.service.js";

type ResponseFactory = () => Response;

export type NcbiTestService = {
  readonly adapters: ReturnType<typeof createNcbiAdapters>;
  readonly applyServerFeedback: ReturnType<
    typeof vi.fn<LiteratureProviderRateGate["applyServerFeedback"]>
  >;
  readonly fetchImplementation: ReturnType<typeof vi.fn<LiteratureProviderFetch>>;
  readonly operationDeadlineMs: number;
};

export function createNcbiTestService(
  responseFactories: readonly ResponseFactory[],
  rateGate?: LiteratureProviderRateGate
): NcbiTestService {
  const queuedResponses = [...responseFactories];
  const fetchImplementation = vi.fn<LiteratureProviderFetch>(async () => {
    const responseFactory = queuedResponses.shift();
    if (responseFactory === undefined) {
      throw new TypeError("NCBI test response queue exhausted.");
    }
    return responseFactory();
  });
  const applyServerFeedback = vi.fn<LiteratureProviderRateGate["applyServerFeedback"]>();
  const immediateGate: LiteratureProviderRateGate = rateGate ?? {
    async run(_context, operation) {
      return operation();
    },
    applyServerFeedback
  };
  const now = () => 1_000;

  return {
    adapters: createNcbiAdapters(
      {
        apiKey: "ncbi-test-key",
        tool: "jixia-test",
        email: "ncbi-test@example.com"
      },
      {
        rateGate: immediateGate,
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

export async function readNcbiFixture(name: string): Promise<string> {
  return readFile(new URL(`./fixtures/${name}`, import.meta.url), "utf8");
}

export function ncbiJsonResponse(
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

export function ncbiXmlResponse(
  body: string,
  options: {
    readonly status?: number;
    readonly headers?: Readonly<Record<string, string>>;
  } = {}
): Response {
  return new Response(body, {
    status: options.status ?? 200,
    headers: {
      "Content-Type": "application/xml",
      ...options.headers
    }
  });
}
