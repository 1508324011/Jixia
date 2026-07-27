import { Writable } from "node:stream";

import type { LiteratureDiscoverySearchResponse } from "@jixia/shared";
import { describe, expect, it } from "vitest";

import {
  createDiscoveryTestCodec,
  createRecordingDiscoveryAdapters,
  crossrefRecord,
  discoveryTestNowMs,
  failedStep,
  openAlexRecord,
  successfulStep
} from "./discovery/discovery.test-fixture.js";
import {
  createLiteratureDiscoveryService,
  LiteratureDiscoveryError
} from "./discovery/discovery.service.js";
import {
  createInjectedLiteratureDiscoveryRouteApp,
  literatureTestCookieName
} from "./literature.routes.test-fixture.js";

describe("literature discovery Fastify integration", () => {
  it("serves two exact pages with a disabled timeout and no sensitive side effects", async () => {
    // Given
    const sensitiveQuery = "SECRET_QUERY_MARKER";
    const sensitiveDoi = "10.9999/secret-doi-marker";
    const adapters = createRecordingDiscoveryAdapters({
      openalex: [
        successfulStep([
          openAlexRecord("W1", { doi: sensitiveDoi, title: "OpenAlex title" }),
          openAlexRecord("W2", { doi: "10.9999/openalex-one" })
        ], "openalex-page-2"),
        successfulStep([
          openAlexRecord("W1", { doi: sensitiveDoi }),
          openAlexRecord("W3", { doi: "10.9999/openalex-two" })
        ])
      ],
      crossref: [
        successfulStep([
          crossrefRecord(sensitiveDoi, {
            doi: sensitiveDoi,
            publisher: { name: "Publisher" }
          }),
          crossrefRecord("10.9999/crossref-one", { doi: "10.9999/crossref-one" })
        ], "crossref-page-2"),
        successfulStep([
          crossrefRecord("10.9999/crossref-two", { doi: "10.9999/crossref-two" }),
          crossrefRecord("10.9999/crossref-three", { doi: "10.9999/crossref-three" })
        ])
      ],
      pubmed: [failedStep("pubmed", "timeout")]
    });
    const dependencies = {
      adapters: adapters.adapters,
      cursorCodec: createDiscoveryTestCodec(),
      now: () => discoveryTestNowMs
    } as const;
    const logChunks: string[] = [];
    const logStream = new Writable({
      write(chunk, _encoding, callback) {
        logChunks.push(chunk.toString());
        callback();
      }
    });
    const setup = await createInjectedLiteratureDiscoveryRouteApp(
      createLiteratureDiscoveryService(dependencies),
      { level: "info", stream: logStream }
    );

    try {
      // When
      const firstResponse = await setup.app.inject({
        method: "POST",
        url: "/literature/discovery/search",
        headers: { cookie: `${literatureTestCookieName}=session-user-1` },
        payload: { query: `  ${sensitiveQuery}  `, limit: 6 }
      });
      const first = firstResponse.json<LiteratureDiscoverySearchResponse>();
      if (first.nextCursor === null) {
        throw new LiteratureDiscoveryError("invalid_cursor", 400);
      }
      const secondResponse = await setup.app.inject({
        method: "POST",
        url: "/literature/discovery/search",
        headers: { cookie: `${literatureTestCookieName}=session-user-1` },
        payload: { query: sensitiveQuery, limit: 6, cursor: first.nextCursor }
      });
      const second = secondResponse.json<LiteratureDiscoverySearchResponse>();

      // Then
      expect([firstResponse.statusCode, secondResponse.statusCode]).toEqual([200, 200]);
      expect([first.candidates.length, second.candidates.length]).toEqual([3, 3]);
      expect(first.candidates[0]).toMatchObject({
        title: "OpenAlex title",
        publisher: { name: "Publisher" },
        doi: sensitiveDoi
      });
      expect(first.providerStatuses).toContainEqual({
        providerKey: "pubmed",
        status: "unavailable",
        failureCode: "timeout"
      });
      expect(second.candidates.map((candidate) => candidate.doi)).not.toContain(sensitiveDoi);
      expect(second.nextCursor).toBeNull();
      expect(adapters.pubmed.calls).toHaveLength(1);
      expect(adapters.openalex.calls[1]?.cursor).toBe("openalex-page-2");
      expect(adapters.crossref.calls[1]?.cursor).toBe("crossref-page-2");
      expect([
        ...adapters.openalex.calls,
        ...adapters.crossref.calls,
        ...adapters.pubmed.calls
      ].every((call) => call.signal instanceof AbortSignal)).toBe(true);
      expect(setup.literatureService.createCalls).toHaveLength(0);
      expect(setup.literatureService.appendCalls).toHaveLength(0);
      expect(setup.literatureService.getCalls).toHaveLength(0);
      expect(Object.keys(dependencies).sort()).toEqual(["adapters", "cursorCodec", "now"]);
      const logs = logChunks.join("");
      expect(logs).not.toContain(sensitiveQuery);
      expect(logs).not.toContain(sensitiveDoi);
      expect(logs).not.toContain(first.nextCursor);
    } finally {
      await setup.app.close();
    }
  });
});
