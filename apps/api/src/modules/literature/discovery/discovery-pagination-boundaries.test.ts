import { createHmac } from "node:crypto";

import { describe, expect, it } from "vitest";

import {
  createLiteratureCursorCodec,
  fingerprintLiteratureDiscoveryRequest
} from "./cursor-codec.js";
import { createLiteratureDiscoveryService } from "./discovery.service.js";
import {
  createDiscoveryTestCodec,
  createRecordingDiscoveryAdapters,
  crossrefRecord,
  discoveryTestNowMs,
  discoveryTestSecret,
  GeneratingDiscoveryAdapter,
  openAlexRecord,
  pubMedRecord,
  successfulStep
} from "./discovery.test-fixture.js";
import type { LiteratureDiscoveryService } from "./discovery.types.js";
import { LiteratureDiscoveryError } from "./discovery.types.js";

async function expectInvalidCursor(operation: Promise<unknown>): Promise<void> {
  try {
    await operation;
  } catch (error) {
    if (error instanceof LiteratureDiscoveryError) {
      expect(error).toMatchObject({ code: "invalid_cursor", statusCode: 400 });
      return;
    }
    throw error;
  }
  throw new LiteratureDiscoveryError("invalid_cursor", 400);
}

function signCursorPayload(state: object): string {
  const payload = Buffer.from(JSON.stringify(state), "utf8").toString("base64url");
  const signature = createHmac("sha256", discoveryTestSecret)
    .update(payload, "utf8")
    .digest("base64url");
  return `${payload}.${signature}`;
}

describe("literature discovery pagination boundaries", () => {
  it("rejects tamper, expiry, version, query, limit, and page overflow before provider calls", async () => {
    // Given
    let now = discoveryTestNowMs;
    const fixture = createRecordingDiscoveryAdapters({
      openalex: [successfulStep([openAlexRecord("W1")], "oa-2")],
      crossref: [successfulStep([crossrefRecord("10.1000/alpha")], "cr-2")],
      pubmed: [successfulStep([pubMedRecord("1")], "2")]
    });
    const codec = createLiteratureCursorCodec({ secret: discoveryTestSecret, now: () => now });
    const service = createLiteratureDiscoveryService({
      adapters: fixture.adapters,
      cursorCodec: codec,
      now: () => now
    });
    const first = await service.search({ query: "glioblastoma", limit: 20 });
    if (first.nextCursor === null) {
      throw new LiteratureDiscoveryError("invalid_cursor", 400);
    }
    const replacement = first.nextCursor.endsWith("A") ? "B" : "A";
    const tampered = `${first.nextCursor.slice(0, -1)}${replacement}`;
    const fingerprint = fingerprintLiteratureDiscoveryRequest({
      normalizedQuery: "glioblastoma",
      limit: 20
    });
    const wrongVersion = signCursorPayload({
      version: 2,
      expiresAt: now + 60_000,
      requestFingerprint: fingerprint,
      limit: 20,
      page: 1,
      providers: {
        openalex: { status: "active", continuation: "oa-2" },
        crossref: { status: "active", continuation: "cr-2" },
        pubmed: { status: "active", continuation: "2" }
      },
      seenIdentities: []
    });
    const pageFive = codec.encode({
      requestFingerprint: fingerprint,
      limit: 20,
      page: 5,
      providers: {
        openalex: { status: "active", continuation: "oa-6" },
        crossref: { status: "active", continuation: "cr-6" },
        pubmed: { status: "active", continuation: "100" }
      },
      seenIdentities: []
    });

    // When
    await expectInvalidCursor(service.search({ query: "glioblastoma", limit: 20, cursor: tampered }));
    await expectInvalidCursor(service.search({ query: "different", limit: 20, cursor: first.nextCursor }));
    await expectInvalidCursor(service.search({ query: "glioblastoma", limit: 19, cursor: first.nextCursor }));
    await expectInvalidCursor(service.search({ query: "glioblastoma", limit: 20, cursor: wrongVersion }));
    await expectInvalidCursor(service.search({ query: "glioblastoma", limit: 20, cursor: pageFive }));
    now += 15 * 60 * 1_000 + 1;
    await expectInvalidCursor(service.search({ query: "glioblastoma", limit: 20, cursor: first.nextCursor }));

    // Then
    expect(fixture.openalex.calls).toHaveLength(1);
    expect(fixture.crossref.calls).toHaveLength(1);
    expect(fixture.pubmed.calls).toHaveLength(1);
  });

  it("caps a deterministic chain at five pages and one hundred seen identities", async () => {
    // Given
    const openalex = new GeneratingDiscoveryAdapter("openalex");
    const crossref = new GeneratingDiscoveryAdapter("crossref");
    const pubmed = new GeneratingDiscoveryAdapter("pubmed");
    const service: LiteratureDiscoveryService = createLiteratureDiscoveryService({
      adapters: { openalex, crossref, pubmed },
      cursorCodec: createDiscoveryTestCodec(),
      now: () => discoveryTestNowMs
    });
    const sourceIdentities: string[] = [];
    let cursor: string | undefined;

    // When
    for (let page = 1; page <= 5; page += 1) {
      const response = await service.search({
        query: "glioblastoma",
        limit: 20,
        ...(cursor === undefined ? {} : { cursor })
      });
      sourceIdentities.push(...response.candidates.flatMap((candidate) =>
        candidate.sourceMatches.map((sourceMatch) =>
          `${sourceMatch.providerKey}:${sourceMatch.recordKey}`
        )
      ));
      cursor = response.nextCursor ?? undefined;
      if (page < 5) {
        expect(cursor).toBeDefined();
      }
    }

    // Then
    expect(sourceIdentities).toHaveLength(100);
    expect(new Set(sourceIdentities).size).toBe(100);
    expect(cursor).toBeUndefined();
    expect(openalex.calls).toHaveLength(5);
    expect(crossref.calls).toHaveLength(5);
    expect(pubmed.calls).toHaveLength(5);
  });

  it.each([
    [98, 1],
    [99, 0]
  ] as const)(
    "admits complete DOI/provider identity closures without crossing the 100-identity budget from %i",
    async (priorIdentityCount, expectedCandidateCount) => {
      // Given
      const codec = createDiscoveryTestCodec();
      const fixture = createRecordingDiscoveryAdapters({
        openalex: [successfulStep([
          openAlexRecord("W-terminal", { doi: "10.1000/terminal-budget" })
        ], "oa-next")],
        crossref: [successfulStep([], "cr-next")],
        pubmed: [successfulStep([], "pm-next")]
      });
      const service = createLiteratureDiscoveryService({
        adapters: fixture.adapters,
        cursorCodec: codec,
        now: () => discoveryTestNowMs
      });
      const requestFingerprint = fingerprintLiteratureDiscoveryRequest({
        normalizedQuery: "glioblastoma",
        limit: 20
      });
      const cursor = codec.encode({
        requestFingerprint,
        limit: 20,
        page: 3,
        providers: {
          openalex: { status: "active", continuation: "oa-current" },
          crossref: { status: "active", continuation: "cr-current" },
          pubmed: { status: "active", continuation: "pm-current" }
        },
        seenIdentities: Array.from({ length: priorIdentityCount }, (_, index) => ({
          kind: "provider" as const,
          providerKey: "openalex" as const,
          recordKey: `W-seen-${index}`
        }))
      });

      // When
      const response = await service.search({ query: "glioblastoma", limit: 20, cursor });

      // Then
      expect(response.candidates).toHaveLength(expectedCandidateCount);
      expect(priorIdentityCount + response.candidates.flatMap((candidate) => [
        ...(candidate.doi === null ? [] : [candidate.doi]),
        ...candidate.sourceMatches.map((sourceMatch) => sourceMatch.recordKey)
      ]).length).toBeLessThanOrEqual(100);
      expect(response.nextCursor).toBeNull();
    }
  );
});
