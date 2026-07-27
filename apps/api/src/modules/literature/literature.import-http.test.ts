import type { FastifyInstance } from "fastify";
import { afterEach, describe, expect, it } from "vitest";

import {
  fixtureDoi,
  fixtureProviderError
} from "./literature.import-provider.test-fixture.js";
import { LiteratureImportRepositoryError } from "./literature.import-repository.js";
import { createImportServiceHarness } from "./literature.import-service.test-fixture.js";
import {
  createInjectedLiteratureImportRouteApp,
  literatureTestCookieName
} from "./literature.routes.test-fixture.js";

const cookie = `${literatureTestCookieName}=session-user-1`;

describe("literature import HTTP lifecycle", () => {
  let app: FastifyInstance | null = null;

  afterEach(async () => {
    if (app !== null) {
      await app.close();
    }
  });

  it("replays one server-refetched import without another provider call", async () => {
    // Given
    const harness = createImportServiceHarness();
    app = await createInjectedLiteratureImportRouteApp(harness.service);
    const request = {
      method: "POST" as const,
      url: "/literature/imports",
      headers: {
        cookie,
        "idempotency-key": "74bd2eb2-2826-4757-b544-5b2abf82a40d"
      },
      payload: {
        target: { scope: "personal" },
        seed: { providerKey: "openalex", recordKey: "W1" }
      }
    };

    await app.inject(request);
    const callsAfterCreate = [...harness.providers.calls];

    // When
    const replayed = await app.inject(request);

    // Then
    expect(replayed.statusCode).toBe(200);
    expect(harness.providers.calls).toEqual(callsAfterCreate);
  });

  it("reads the terminal operation created by an import", async () => {
    // Given
    const harness = createImportServiceHarness();
    app = await createInjectedLiteratureImportRouteApp(harness.service);
    await app.inject({
      method: "POST",
      url: "/literature/imports",
      headers: {
        cookie,
        "idempotency-key": "42799785-b11d-4daf-a340-971b155a7c5e"
      },
      payload: {
        target: { scope: "personal" },
        seed: { providerKey: "openalex", recordKey: "W1" }
      }
    });

    // When
    const response = await app.inject({
      method: "GET",
      url: "/literature/imports/operation-1",
      headers: { cookie }
    });

    // Then
    expect(response.statusCode).toBe(200);
    expect(response.json()).toMatchObject({
      operation: { id: "operation-1", status: "succeeded", literatureId: "literature-1" }
    });
  });

  it("exposes a seed failure as a terminal operation", async () => {
    // Given
    const harness = createImportServiceHarness();
    harness.providers.openAlexSeedError = fixtureProviderError("openalex", "timeout");
    app = await createInjectedLiteratureImportRouteApp(harness.service);

    // When
    const response = await app.inject({
      method: "POST",
      url: "/literature/imports",
      headers: {
        cookie,
        "idempotency-key": "559a1302-8a40-4e68-b878-fefc204f9828"
      },
      payload: {
        target: { scope: "personal" },
        seed: { providerKey: "openalex", recordKey: "W1" }
      }
    });

    // Then
    expect(response.statusCode).toBe(201);
    expect(response.json()).toMatchObject({
      operation: { status: "failed", failureCode: "seed_unavailable" }
    });
  });

  it("closes revoked project authorization as a terminal operation", async () => {
    // Given
    const harness = createImportServiceHarness();
    harness.repository.finalizeError = new LiteratureImportRepositoryError("forbidden");
    app = await createInjectedLiteratureImportRouteApp(harness.service);

    // When
    const response = await app.inject({
      method: "POST",
      url: "/literature/imports",
      headers: {
        cookie,
        "idempotency-key": "f1061e18-9ca0-4b22-9363-5b825fef8595"
      },
      payload: {
        target: { scope: "project", projectId: "project-1" },
        seed: { providerKey: "openalex", recordKey: "W1" }
      }
    });

    // Then
    expect(response.statusCode).toBe(201);
    expect(response.json()).toMatchObject({
      operation: { status: "failed", failureCode: "authorization_revoked" }
    });
  });

  it("retries a failed operation to success", async () => {
    // Given
    const harness = createImportServiceHarness();
    harness.providers.openAlexSeedError = fixtureProviderError("openalex", "timeout");
    app = await createInjectedLiteratureImportRouteApp(harness.service);
    await app.inject({
      method: "POST",
      url: "/literature/imports",
      headers: {
        cookie,
        "idempotency-key": "559a1302-8a40-4e68-b878-fefc204f9828"
      },
      payload: {
        target: { scope: "personal" },
        seed: { providerKey: "openalex", recordKey: "W1" }
      }
    });
    harness.providers.openAlexSeedError = null;

    // When
    const retried = await app.inject({
      method: "POST",
      url: "/literature/imports/operation-1/retry",
      headers: { cookie }
    });

    // Then
    expect(retried.statusCode).toBe(200);
    expect(retried.json()).toMatchObject({
      operation: { status: "succeeded", attemptCount: 2 }
    });
    expect(harness.repository.history.map((operation) => operation.status)).toEqual([
      "running",
      "failed",
      "running",
      "succeeded"
    ]);
  });

  it("omits the provider seed from create, project read, and retry responses", async () => {
    // Given
    const harness = createImportServiceHarness();
    harness.providers.crossrefSeedError = fixtureProviderError("crossref", "timeout");
    app = await createInjectedLiteratureImportRouteApp(harness.service);
    const created = await app.inject({
      method: "POST",
      url: "/literature/imports",
      headers: {
        cookie,
        "idempotency-key": "dd61bc1c-54af-4a8f-9f49-e58f5005bf70"
      },
      payload: {
        target: { scope: "project", projectId: "project-1" },
        seed: { providerKey: "crossref", recordKey: fixtureDoi }
      }
    });
    const read = await app.inject({
      method: "GET",
      url: "/literature/imports/operation-1",
      headers: { cookie }
    });
    harness.providers.crossrefSeedError = null;

    // When
    const retried = await app.inject({
      method: "POST",
      url: "/literature/imports/operation-1/retry",
      headers: { cookie }
    });

    // Then
    for (const response of [created, read, retried]) {
      expect(response.statusCode).toBe(response === created ? 201 : 200);
      expect(response.json().operation).not.toHaveProperty("seed");
      expect(response.body).not.toContain(fixtureDoi);
    }
  });

  it("authenticates before parsing import input", async () => {
    // Given
    const harness = createImportServiceHarness();
    app = await createInjectedLiteratureImportRouteApp(harness.service);

    // When
    const response = await app.inject({
      method: "POST",
      url: "/literature/imports",
      payload: { title: "untrusted" }
    });

    // Then
    expect(response.statusCode).toBe(401);
    expect(harness.providers.calls).toHaveLength(0);
  });
});
