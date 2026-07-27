import type { FastifyInstance } from "fastify";
import { afterEach, describe, expect, it } from "vitest";

import { fixtureProviderError } from "./literature.import-provider.test-fixture.js";
import { createImportServiceHarness } from "./literature.import-service.test-fixture.js";
import {
  createInjectedLiteratureImportRouteApp,
  literatureTestCookieName
} from "./literature.routes.test-fixture.js";

const cookie = `${literatureTestCookieName}=session-user-1`;
const createRequest = {
  method: "POST" as const,
  url: "/literature/imports",
  headers: {
    cookie,
    "idempotency-key": "bb1358c7-41af-4e55-af9c-168b29833454"
  },
  payload: {
    target: { scope: "personal" },
    seed: { providerKey: "openalex", recordKey: "W1" }
  }
};

describe("literature import authentication boundary", () => {
  let app: FastifyInstance | null = null;

  afterEach(async () => {
    if (app !== null) {
      await app.close();
    }
  });

  it("rejects malformed unauthenticated JSON before parsing the body", async () => {
    // Given
    const harness = createImportServiceHarness();
    app = await createInjectedLiteratureImportRouteApp(harness.service);

    // When
    const response = await app.inject({
      method: "POST",
      url: "/literature/imports",
      headers: { "content-type": "application/json" },
      payload: "{"
    });

    // Then
    expect(response.statusCode).toBe(401);
    expect(harness.repository.history).toHaveLength(0);
    expect(harness.providers.calls).toHaveLength(0);
  });

  it("rejects oversized unauthenticated JSON before reading the body", async () => {
    // Given
    const harness = createImportServiceHarness();
    app = await createInjectedLiteratureImportRouteApp(harness.service);
    const oversizedPayload = JSON.stringify({ value: "x".repeat(1_048_576) });

    // When
    const response = await app.inject({
      method: "POST",
      url: "/literature/imports",
      headers: { "content-type": "application/json" },
      payload: oversizedPayload
    });

    // Then
    expect(response.statusCode).toBe(401);
    expect(harness.repository.history).toHaveLength(0);
    expect(harness.providers.calls).toHaveLength(0);
  });

  it("authenticates an import create exactly once", async () => {
    // Given
    const harness = createImportServiceHarness();
    let currentSessionLookups = 0;
    app = await createInjectedLiteratureImportRouteApp(harness.service, false, () => {
      currentSessionLookups += 1;
    });

    // When
    const response = await app.inject(createRequest);

    // Then
    expect(response.statusCode).toBe(201);
    expect(currentSessionLookups).toBe(1);
  });

  it("authenticates an import read exactly once", async () => {
    // Given
    const harness = createImportServiceHarness();
    let currentSessionLookups = 0;
    app = await createInjectedLiteratureImportRouteApp(harness.service, false, () => {
      currentSessionLookups += 1;
    });
    await app.inject(createRequest);
    currentSessionLookups = 0;

    // When
    const response = await app.inject({
      method: "GET",
      url: "/literature/imports/operation-1",
      headers: { cookie }
    });

    // Then
    expect(response.statusCode).toBe(200);
    expect(currentSessionLookups).toBe(1);
  });

  it("authenticates an import retry exactly once", async () => {
    // Given
    const harness = createImportServiceHarness();
    harness.providers.openAlexSeedError = fixtureProviderError("openalex", "timeout");
    let currentSessionLookups = 0;
    app = await createInjectedLiteratureImportRouteApp(harness.service, false, () => {
      currentSessionLookups += 1;
    });
    await app.inject(createRequest);
    harness.providers.openAlexSeedError = null;
    currentSessionLookups = 0;

    // When
    const response = await app.inject({
      method: "POST",
      url: "/literature/imports/operation-1/retry",
      headers: { cookie }
    });

    // Then
    expect(response.statusCode).toBe(200);
    expect(currentSessionLookups).toBe(1);
  });
});
