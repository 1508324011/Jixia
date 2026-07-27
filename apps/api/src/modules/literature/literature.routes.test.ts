import type { FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  createLiteratureRouteTestApp,
  literatureTestCookieName,
  RecordingLiteratureService
} from "./literature.routes.test-fixture.js";
import { LiteratureError } from "./literature.service.js";

describe("literature routes", () => {
  let app: FastifyInstance;
  let service: RecordingLiteratureService;

  beforeEach(async () => {
    const setup = await createLiteratureRouteTestApp();
    app = setup.app;
    service = setup.service;
  });

  afterEach(async () => {
    await app.close();
  });

  it("returns 401 when creating Literature without a session", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/literature",
      payload: { scope: "personal" }
    });

    expect(response.statusCode).toBe(401);
    expect(service.createCalls).toHaveLength(0);
  });

  it("rejects caller-supplied ownership before creating Literature", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/literature",
      headers: { cookie: `${literatureTestCookieName}=session-user-1` },
      payload: { scope: "personal", ownerUserId: "user-2" }
    });

    expect(response.statusCode).toBe(400);
    expect(service.createCalls).toHaveLength(0);
  });

  it("creates personal Literature for the authenticated actor", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/literature",
      headers: { cookie: `${literatureTestCookieName}=session-user-1` },
      payload: { scope: "personal" }
    });

    expect(response.statusCode).toBe(201);
    expect(response.json()).toMatchObject({
      literature: { id: "literature-1", scope: { kind: "personal", ownerUserId: "user-1" } }
    });
    expect(service.createCalls).toEqual([
      {
        actor: { userId: "user-1", spaceId: "space-1", spaceRole: "SpaceMember" },
        request: { scope: "personal" }
      }
    ]);
  });

  it("rejects provider-native payloads before appending assertions", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/literature/literature-1/assertions",
      headers: { cookie: `${literatureTestCookieName}=session-user-1` },
      payload: {
        provider: { providerKey: "crossref", recordKey: "work-1", payload: { title: "raw" } },
        assertions: [{ kind: "title", value: "A paper" }]
      }
    });

    expect(response.statusCode).toBe(400);
    expect(service.appendCalls).toHaveLength(0);
  });

  it("appends assertions and reads the resulting Literature", async () => {
    const cookie = `${literatureTestCookieName}=session-user-1`;
    const appendResponse = await app.inject({
      method: "POST",
      url: "/literature/literature-1/assertions",
      headers: { cookie },
      payload: {
        provider: { providerKey: "crossref", recordKey: "work-1" },
        assertions: [{ kind: "title", value: "A paper" }]
      }
    });
    const getResponse = await app.inject({
      method: "GET",
      url: "/literature/literature-1",
      headers: { cookie }
    });

    expect(appendResponse.statusCode).toBe(201);
    expect(getResponse.statusCode).toBe(200);
    expect(service.appendCalls).toHaveLength(1);
    expect(service.getCalls).toHaveLength(1);
  });

  it("maps an inaccessible Literature to a sanitized not-found response", async () => {
    service.getError = new LiteratureError("Not found", 404);
    const response = await app.inject({
      method: "GET",
      url: "/literature/other-owner-literature",
      headers: { cookie: `${literatureTestCookieName}=session-user-1` }
    });

    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({ error: "Not found" });
  });

  it("sanitizes unexpected service failures", async () => {
    service.getError = new Error("database credential leaked");
    const response = await app.inject({
      method: "GET",
      url: "/literature/literature-1",
      headers: { cookie: `${literatureTestCookieName}=session-user-1` }
    });

    expect(response.statusCode).toBe(500);
    expect(response.json()).toEqual({ error: "Internal Server Error" });
  });

  it("preserves framework client errors for malformed JSON", async () => {
    const response = await app.inject({
      method: "POST",
      url: "/literature",
      headers: {
        "content-type": "application/json",
        cookie: `${literatureTestCookieName}=session-user-1`
      },
      payload: '{"scope":'
    });

    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({ error: "Invalid request" });
    expect(service.createCalls).toHaveLength(0);
  });

  it("sanitizes typed server failures", async () => {
    service.getError = new LiteratureError("persisted ownership invariant failed", 500);
    const response = await app.inject({
      method: "GET",
      url: "/literature/literature-1",
      headers: { cookie: `${literatureTestCookieName}=session-user-1` }
    });

    expect(response.statusCode).toBe(500);
    expect(response.json()).toEqual({ error: "Internal Server Error" });
  });
});
