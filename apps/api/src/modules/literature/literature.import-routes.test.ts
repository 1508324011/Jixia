import type { FastifyInstance } from "fastify";
import { afterEach, beforeEach, describe, expect, it } from "vitest";

import { LiteratureImportRepositoryError } from "./literature.import-repository.js";
import type { RecordingImportService } from "./literature.import-routes.test-fixture.js";
import {
  createLiteratureRouteTestApp,
  literatureTestCookieName
} from "./literature.routes.test-fixture.js";

describe("literature import routes", () => {
  let app: FastifyInstance;
  let importService: RecordingImportService;

  beforeEach(async () => {
    ({ app, importService } = await createLiteratureRouteTestApp());
  });

  afterEach(async () => {
    await app.close();
  });

  it("rejects canonical metadata supplied by the client", async () => {
    // Given
    const cookie = `${literatureTestCookieName}=session-user-1`;

    // When
    const response = await app.inject({
      method: "POST",
      url: "/literature/imports",
      headers: {
        cookie,
        "idempotency-key": "99c7be0a-c3ea-4d6e-bd90-c3fca918a1d1"
      },
      payload: {
        target: { scope: "personal" },
        seed: { providerKey: "openalex", recordKey: "W1" },
        title: "Client-controlled title"
      }
    });

    // Then
    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({ error: "Invalid request" });
  });

  it("requires a UUID idempotency key", async () => {
    // Given
    const cookie = `${literatureTestCookieName}=session-user-1`;

    // When
    const response = await app.inject({
      method: "POST",
      url: "/literature/imports",
      headers: { cookie, "idempotency-key": "not-a-uuid" },
      payload: {
        target: { scope: "personal" },
        seed: { providerKey: "openalex", recordKey: "W1" }
      }
    });

    // Then
    expect(response.statusCode).toBe(400);
    expect(importService.createCalls).toHaveLength(0);
  });

  it("creates an import from only target and opaque seed identity", async () => {
    // Given
    const idempotencyKey = "99c7be0a-c3ea-4d6e-bd90-c3fca918a1d1";

    // When
    const response = await app.inject({
      method: "POST",
      url: "/literature/imports",
      headers: {
        cookie: `${literatureTestCookieName}=session-user-1`,
        "idempotency-key": idempotencyKey
      },
      payload: {
        target: { scope: "personal" },
        seed: { providerKey: "openalex", recordKey: "W1" }
      }
    });

    // Then
    expect(response.statusCode).toBe(201);
    expect(importService.createCalls[0]).toEqual({
      actor: { userId: "user-1", spaceId: "space-1", spaceRole: "SpaceMember" },
      idempotencyKey,
      request: {
        target: { scope: "personal" },
        seed: { providerKey: "openalex", recordKey: "W1" }
      }
    });
    expect(response.json()).toMatchObject({ operation: { status: "succeeded" } });
  });

  it("returns 200 for an idempotent create replay", async () => {
    // Given
    importService.createKind = "replayed";

    // When
    const response = await app.inject({
      method: "POST",
      url: "/literature/imports",
      headers: {
        cookie: `${literatureTestCookieName}=session-user-1`,
        "idempotency-key": "99c7be0a-c3ea-4d6e-bd90-c3fca918a1d1"
      },
      payload: {
        target: { scope: "personal" },
        seed: { providerKey: "openalex", recordKey: "W1" }
      }
    });

    // Then
    expect(response.statusCode).toBe(200);
  });

  it("reads an authorized import operation", async () => {
    // Given
    const cookie = `${literatureTestCookieName}=session-user-1`;

    // When
    const response = await app.inject({
      method: "GET",
      url: "/literature/imports/operation-1",
      headers: { cookie }
    });

    // Then
    expect(response.statusCode).toBe(200);
    expect(importService.getCalls[0]).toMatchObject({ operationId: "operation-1" });
  });

  it("maps an active retry conflict to a sanitized 409", async () => {
    // Given
    importService.error = new LiteratureImportRepositoryError("operation_conflict");

    // When
    const response = await app.inject({
      method: "POST",
      url: "/literature/imports/operation-1/retry",
      headers: { cookie: `${literatureTestCookieName}=session-user-1` }
    });

    // Then
    expect(response.statusCode).toBe(409);
    expect(response.json()).toEqual({ error: "Conflict" });
  });

  it("rejects a retry request body before invoking the service", async () => {
    // Given
    const cookie = `${literatureTestCookieName}=session-user-1`;

    // When
    const response = await app.inject({
      method: "POST",
      url: "/literature/imports/operation-1/retry",
      headers: { cookie },
      payload: { unexpected: "body" }
    });

    // Then
    expect(response.statusCode).toBe(400);
    expect(response.json()).toEqual({ error: "Invalid request" });
    expect(importService.retryCalls).toHaveLength(0);
  });

  it("preserves non-disclosing authorization responses", async () => {
    // Given
    importService.error = new LiteratureImportRepositoryError("not_found");

    // When
    const response = await app.inject({
      method: "GET",
      url: "/literature/imports/operation-hidden",
      headers: { cookie: `${literatureTestCookieName}=session-user-1` }
    });

    // Then
    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({ error: "Not found" });
  });

  it("sanitizes unexpected import failures", async () => {
    // Given
    importService.error = new Error("provider payload secret");

    // When
    const response = await app.inject({
      method: "GET",
      url: "/literature/imports/operation-1",
      headers: { cookie: `${literatureTestCookieName}=session-user-1` }
    });

    // Then
    expect(response.statusCode).toBe(500);
    expect(response.json()).toEqual({ error: "Internal Server Error" });
    expect(response.body).not.toContain("provider payload secret");
  });
});
