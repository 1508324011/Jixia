import type { FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { LiteratureDiscoveryError } from "./discovery/discovery.service.js";
import {
  createLiteratureRouteTestApp,
  type RecordingDiscoveryService,
  type RecordingLiteratureService,
  literatureTestCookieName
} from "./literature.routes.test-fixture.js";

describe("literature discovery route", () => {
  let app: FastifyInstance;
  let discoveryService: RecordingDiscoveryService;
  let literatureService: RecordingLiteratureService;

  beforeEach(async () => {
    const setup = await createLiteratureRouteTestApp();
    app = setup.app;
    discoveryService = setup.discoveryService;
    literatureService = setup.service;
  });

  afterEach(async () => {
    await app.close();
  });

  it("returns 401 before parsing an unauthenticated search", async () => {
    // Given
    const payload = { query: "", limit: 99 };

    // When
    const response = await app.inject({
      method: "POST",
      url: "/literature/discovery/search",
      payload
    });

    // Then
    expect(response.statusCode).toBe(401);
    expect(discoveryService.calls).toHaveLength(0);
  });

  it.each([
    ["malformed JSON", "{"],
    ["JSON above Fastify's default body limit", JSON.stringify({
      query: "x".repeat(1024 * 1024)
    })]
  ])("returns 401 before parsing unauthenticated %s", async (_caseName, payload) => {
    // Given
    const rawPayload = payload;

    // When
    const response = await app.inject({
      method: "POST",
      url: "/literature/discovery/search",
      headers: { "content-type": "application/json" },
      payload: rawPayload
    });

    // Then
    expect(response.statusCode).toBe(401);
    expect(discoveryService.calls).toHaveLength(0);
  });

  it("applies the discovery route body limit after authentication", async () => {
    // Given
    const payload = JSON.stringify({ query: "x".repeat(140 * 1024) });

    // When
    const response = await app.inject({
      method: "POST",
      url: "/literature/discovery/search",
      headers: {
        "content-type": "application/json",
        cookie: `${literatureTestCookieName}=session-user-1`
      },
      payload
    });

    // Then
    expect(response.statusCode).toBe(413);
    expect(response.json()).toEqual({ error: "Invalid request" });
    expect(discoveryService.calls).toHaveLength(0);
  });

  it("normalizes the query and applies the default limit", async () => {
    // Given
    const query = "  \uFF47\uFF4C\uFF49\uFF4F\uFF42\uFF4C\uFF41\uFF53\uFF54\uFF4F\uFF4D\uFF41 \n therapy ";

    // When
    const response = await authenticatedSearch(app, { query });

    // Then
    expect(response.statusCode).toBe(200);
    expect(discoveryService.calls).toHaveLength(1);
    expect(discoveryService.calls[0]).toMatchObject({
      query: "glioblastoma therapy",
      limit: 20
    });
    expect(discoveryService.calls[0]?.signal).toBeInstanceOf(AbortSignal);
  });

  it.each([
    ["blank query", { query: " \t\n " }],
    ["query over 512 characters", { query: "x".repeat(513) }],
    ["zero limit", { query: "glioblastoma", limit: 0 }],
    ["limit below three-provider fanout", { query: "glioblastoma", limit: 1 }],
    ["limit below three-provider fanout", { query: "glioblastoma", limit: 2 }],
    ["limit over twenty", { query: "glioblastoma", limit: 21 }],
    ["unknown field", { query: "glioblastoma", providerUrl: "https://example.test" }]
  ])("rejects %s before discovery execution", async (_caseName, payload) => {
    // Given
    const requestPayload = payload;

    // When
    const response = await authenticatedSearch(app, requestPayload);

    // Then
    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({ error: "Invalid request" });
    expect(discoveryService.calls).toHaveLength(0);
  });

  it("returns normalized candidates and every partial provider status", async () => {
    // Given
    discoveryService.response = {
      candidates: [{
        title: "Alpha",
        abstract: null,
        publicationYear: 2026,
        publicationDate: "2026-07-20",
        venue: "Jixia Journal",
        publicationType: "journal-article",
        doi: "10.1000/alpha",
        authors: [],
        identifiers: [{ scheme: "doi", value: "10.1000/alpha" }],
        openAccess: null,
        publisher: null,
        sourceMatches: [
          { providerKey: "openalex", recordKey: "W1", providerRank: 1 },
          { providerKey: "pubmed", recordKey: "1", providerRank: 1 }
        ]
      }],
      providerStatuses: [
        { providerKey: "openalex", status: "succeeded", resultCount: 1 },
        { providerKey: "crossref", status: "unavailable", failureCode: "timeout" },
        { providerKey: "pubmed", status: "succeeded", resultCount: 1 }
      ],
      nextCursor: "signed-next-cursor"
    };

    // When
    const response = await authenticatedSearch(app, { query: "glioblastoma", limit: 20 });

    // Then
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual(discoveryService.response);
    expect(literatureService.createCalls).toHaveLength(0);
    expect(literatureService.appendCalls).toHaveLength(0);
    expect(literatureService.getCalls).toHaveLength(0);
  });

  it.each([
    ["invalid_cursor", 400],
    ["discovery_rate_limited", 429],
    ["discovery_unconfigured", 503],
    ["discovery_unavailable", 503]
  ] as const)("maps %s to its safe route status", async (code, statusCode) => {
    // Given
    discoveryService.error = new LiteratureDiscoveryError(code, statusCode);

    // When
    const response = await authenticatedSearch(app, {
      query: "glioblastoma",
      limit: 20,
      cursor: "opaque"
    });

    // Then
    expect(response.statusCode).toBe(statusCode);
    expect(response.json()).toEqual({ error: code });
  });
});

function authenticatedSearch(app: FastifyInstance, payload: object) {
  return app.inject({
    method: "POST",
    url: "/literature/discovery/search",
    headers: { cookie: `${literatureTestCookieName}=session-user-1` },
    payload
  });
}
