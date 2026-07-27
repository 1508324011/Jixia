import { describe, expect, it, vi } from "vitest";

import type { LiteratureProviderFetch } from "../provider-types.js";
import { createNcbiAdapters } from "./ncbi.service.js";
import {
  ncbiJsonResponse,
  ncbiXmlResponse,
  readNcbiFixture
} from "./ncbi.test-fixture.js";

describe("NCBI service rate gate", () => {
  it("shares the default ten-request-per-second reservation stream", async () => {
    // Given
    const searchBody = await readNcbiFixture("esearch-zero.json");
    const pmcBody = await readNcbiFixture("pmc-zero.xml");
    const responses = [
      () => ncbiJsonResponse(searchBody),
      () => ncbiXmlResponse(pmcBody)
    ];
    let nowMs = 1_000;
    const sleeps: number[] = [];
    const fetchImplementation = vi.fn<LiteratureProviderFetch>(async () => {
      const response = responses.shift();
      if (response === undefined) {
        throw new TypeError("NCBI test response queue exhausted.");
      }
      return response();
    });
    const adapters = createNcbiAdapters(
      {
        apiKey: "ncbi-test-key",
        tool: "jixia-test",
        email: "ncbi-test@example.com"
      },
      {
        transport: {
          fetchImplementation,
          now: () => nowMs,
          random: () => 0,
          resolveAddresses: async () => ["8.8.8.8"],
          sleep: async (delayMs) => {
            sleeps.push(delayMs);
            nowMs += delayMs;
          }
        }
      }
    );

    // When
    await adapters.pubmed.search({
      query: "no matches",
      limit: 1,
      operationDeadlineMs: 5_000
    });
    await adapters.pmc.lookup({
      pmcid: "PMC999",
      operationDeadlineMs: 5_000
    });

    // Then
    expect(fetchImplementation).toHaveBeenCalledTimes(2);
    expect(sleeps).toEqual([100]);
  });
});
