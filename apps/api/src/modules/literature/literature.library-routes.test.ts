import type { FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import {
  createLiteratureRouteTestApp,
  literatureTestCookieName,
  type RecordingLiteratureService
} from "./literature.routes.test-fixture.js";
import { LiteratureError } from "./literature.service.js";

describe("literature library routes", () => {
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

  it("lists the authenticated actor's personal library with the default limit", async () => {
    // Given
    const cookie = `${literatureTestCookieName}=session-user-1`;

    // When
    const response = await app.inject({
      method: "GET",
      url: "/literature?scope=personal",
      headers: { cookie }
    });

    // Then
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual(service.listResponse);
    expect(service.listCalls).toEqual([
      {
        actor: { userId: "user-1", spaceId: "space-1", spaceRole: "SpaceMember" },
        request: { scope: "personal", limit: 20 }
      }
    ]);
  });

  it("passes a project scope, bounded limit, and opaque cursor to the service", async () => {
    // Given
    const cookie = `${literatureTestCookieName}=session-user-1`;

    // When
    const response = await app.inject({
      method: "GET",
      url: "/literature?scope=project&projectId=project-1&limit=50&cursor=opaque",
      headers: { cookie }
    });

    // Then
    expect(response.statusCode).toBe(200);
    expect(service.listCalls[0]?.request).toEqual({
      scope: "project",
      projectId: "project-1",
      limit: 50,
      cursor: "opaque"
    });
  });

  it.each([
    ["personal projectId", "/literature?scope=personal&projectId=project-1"],
    ["project without projectId", "/literature?scope=project"],
    ["limit below one", "/literature?scope=personal&limit=0"],
    ["limit above fifty", "/literature?scope=personal&limit=51"],
    ["unknown query field", "/literature?scope=personal&ownerUserId=user-2"]
  ])("rejects an invalid %s query before calling the service", async (_label, url) => {
    // Given
    const cookie = `${literatureTestCookieName}=session-user-1`;

    // When
    const response = await app.inject({ method: "GET", url, headers: { cookie } });

    // Then
    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({ error: "Invalid request" });
    expect(service.listCalls).toHaveLength(0);
  });

  it("maps an invalid signed cursor to a closed client error", async () => {
    // Given
    service.listError = new LiteratureError("invalid_cursor", 400);

    // When
    const response = await app.inject({
      method: "GET",
      url: "/literature?scope=personal&cursor=tampered",
      headers: { cookie: `${literatureTestCookieName}=session-user-1` }
    });

    // Then
    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({ error: "invalid_cursor" });
  });

  it("requires authentication before listing a library", async () => {
    // Given
    const request = { method: "GET" as const, url: "/literature?scope=personal" };

    // When
    const response = await app.inject(request);

    // Then
    expect(response.statusCode).toBe(401);
    expect(service.listCalls).toHaveLength(0);
  });

  it("sanitizes an unavailable cursor configuration without affecting authentication", async () => {
    service.listError = new LiteratureError("Literature library unavailable", 503);

    const response = await app.inject({
      method: "GET",
      url: "/literature?scope=personal",
      headers: { cookie: `${literatureTestCookieName}=session-user-1` }
    });

    expect(response.statusCode).toBe(503);
    expect(response.json()).toEqual({ error: "Service unavailable" });
  });
});
