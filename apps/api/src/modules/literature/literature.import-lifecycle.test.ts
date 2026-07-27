import type { LiteratureImportSeed } from "@jixia/shared";
import { describe, expect, it } from "vitest";

import { fixtureProviderError } from "./literature.import-provider.test-fixture.js";
import { LiteratureImportRepositoryError } from "./literature.import-repository.js";
import {
  createImportServiceHarness,
  importFixtureActor
} from "./literature.import-service.test-fixture.js";

const idempotencyKey = "5cb3d888-f5f2-4bb4-b57a-0a92d4cf4321";

const seedCases = [
  {
    seed: { providerKey: "openalex", recordKey: "W1" },
    expectedCall: "openalex:seed"
  },
  {
    seed: { providerKey: "crossref", recordKey: "10.1000/import-fixture" },
    expectedCall: "crossref:seed"
  },
  {
    seed: { providerKey: "pubmed", recordKey: "42" },
    expectedCall: "pubmed:seed"
  }
] as const satisfies readonly {
  readonly seed: LiteratureImportSeed;
  readonly expectedCall: string;
}[];

describe("literature import lifecycle", () => {
  it("performs no provider I/O when admission is rejected", async () => {
    // Given
    const harness = createImportServiceHarness();
    harness.repository.admitError = new LiteratureImportRepositoryError("forbidden");

    // When / Then
    await expect(harness.service.createImport({
      actor: importFixtureActor,
      request: {
        target: { scope: "project", projectId: "project-1" },
        seed: { providerKey: "openalex", recordKey: "W1" }
      },
      idempotencyKey
    })).rejects.toMatchObject({ code: "forbidden" });
    expect(harness.providers.calls).toHaveLength(0);
  });

  it.each(seedCases)("refetches and succeeds from $seed.providerKey seed", async ({
    seed,
    expectedCall
  }) => {
    // Given
    const harness = createImportServiceHarness();

    // When
    const result = await harness.service.createImport({
      actor: importFixtureActor,
      request: { target: { scope: "personal" }, seed },
      idempotencyKey
    });

    // Then
    expect(result).toMatchObject({ kind: "created" });
    expect(result.response.operation).toMatchObject({ status: "succeeded" });
    expect(harness.providers.calls[0]).toBe(expectedCall);
  });

  it("closes a missing seed into a terminal failure", async () => {
    // Given
    const harness = createImportServiceHarness();
    harness.providers.openAlexSeedError = fixtureProviderError("openalex", "not_found");

    // When
    const result = await harness.service.createImport({
      actor: importFixtureActor,
      request: {
        target: { scope: "personal" },
        seed: { providerKey: "openalex", recordKey: "W404" }
      },
      idempotencyKey
    });

    // Then
    expect(result.response.operation).toMatchObject({
      status: "failed",
      failureCode: "seed_not_found"
    });
    expect(harness.repository.failCalls).toHaveLength(1);
  });

  it("replays a lost create response without refetching providers", async () => {
    // Given
    const harness = createImportServiceHarness();
    const input = {
      actor: importFixtureActor,
      request: {
        target: { scope: "personal" } as const,
        seed: { providerKey: "openalex", recordKey: "W1" } as const
      },
      idempotencyKey
    };
    await harness.service.createImport(input);
    const callsAfterFirstResponse = [...harness.providers.calls];

    // When
    const replay = await harness.service.createImport(input);

    // Then
    expect(replay).toMatchObject({
      kind: "replayed",
      response: { operation: { status: "succeeded", id: "operation-1" } }
    });
    expect(harness.providers.calls).toEqual(callsAfterFirstResponse);
  });

  it("rejects retry while the running lease is active", async () => {
    // Given
    const harness = createImportServiceHarness();
    await harness.repository.admitImport({
      actor: importFixtureActor,
      target: { scope: "personal" },
      seed: { providerKey: "openalex", recordKey: "W1" },
      idempotencyKey
    });

    // When / Then
    await expect(harness.service.retryImport({
      actor: importFixtureActor,
      operationId: "operation-1"
    })).rejects.toMatchObject({ code: "operation_conflict", statusCode: 409 });
    expect(harness.providers.calls).toHaveLength(0);
  });

  it("retries a failed operation to success", async () => {
    // Given
    const harness = createImportServiceHarness();
    harness.providers.openAlexSeedError = fixtureProviderError("openalex", "timeout");
    await harness.service.createImport({
      actor: importFixtureActor,
      request: {
        target: { scope: "personal" },
        seed: { providerKey: "openalex", recordKey: "W1" }
      },
      idempotencyKey
    });
    harness.providers.openAlexSeedError = null;

    // When
    const result = await harness.service.retryImport({
      actor: importFixtureActor,
      operationId: "operation-1"
    });

    // Then
    expect(result.operation).toMatchObject({ status: "succeeded", attemptCount: 2 });
  });

  it("takes over an expired running attempt and succeeds", async () => {
    // Given
    const harness = createImportServiceHarness();
    await harness.repository.admitImport({
      actor: importFixtureActor,
      target: { scope: "personal" },
      seed: { providerKey: "openalex", recordKey: "W1" },
      idempotencyKey
    });
    harness.repository.expireRunningAttempt();

    // When
    const result = await harness.service.retryImport({
      actor: importFixtureActor,
      operationId: "operation-1"
    });

    // Then
    expect(result.operation).toMatchObject({ status: "succeeded", attemptCount: 2 });
  });

  it("closes a seed failure as authorization_revoked when failure access changed", async () => {
    // Given
    const harness = createImportServiceHarness();
    harness.providers.openAlexSeedError = fixtureProviderError("openalex", "timeout");
    harness.repository.failError = new LiteratureImportRepositoryError("forbidden");

    // When
    const result = await harness.service.createImport({
      actor: importFixtureActor,
      request: {
        target: { scope: "project", projectId: "project-1" },
        seed: { providerKey: "openalex", recordKey: "W1" }
      },
      idempotencyKey
    });

    // Then
    expect(result.response.operation).toMatchObject({
      status: "failed",
      failureCode: "authorization_revoked"
    });
    expect(harness.repository.failCalls.map((call) => call.failureCode)).toEqual([
      "seed_unavailable",
      "authorization_revoked"
    ]);
  });

  it.each([
    { repositoryCode: "identity_conflict", failureCode: "identity_conflict" },
    { repositoryCode: "persistence_invariant", failureCode: "persistence_failed" },
    { repositoryCode: "forbidden", failureCode: "authorization_revoked" },
    { repositoryCode: "not_found", failureCode: "authorization_revoked" }
  ] as const)("closes $repositoryCode finalization as $failureCode", async ({
    repositoryCode,
    failureCode
  }) => {
    // Given
    const harness = createImportServiceHarness();
    harness.repository.finalizeError = new LiteratureImportRepositoryError(repositoryCode);

    // When
    const result = await harness.service.createImport({
      actor: importFixtureActor,
      request: {
        target: { scope: "personal" },
        seed: { providerKey: "openalex", recordKey: "W1" }
      },
      idempotencyKey
    });

    // Then
    expect(result.response.operation).toMatchObject({
      status: "failed",
      failureCode
    });
    expect(harness.repository.failCalls[0]).toMatchObject({ failureCode });
  });
});
