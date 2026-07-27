import { describe, expect, it } from "vitest";

import {
  createCrossrefTestAdapter,
  crossrefJsonResponse,
  readCrossrefFixture
} from "./discovery/crossref/crossref.test-fixture.js";
import {
  createImportServiceHarness,
  importFixtureActor
} from "./literature.import-service.test-fixture.js";
import { createLiteratureImportService } from "./literature.import-service.js";

describe("literature import provider identity", () => {
  it("fails a real Crossref exact-DOI identity conflict instead of degrading it", async () => {
    // Given
    const harness = createImportServiceHarness();
    const body = await readCrossrefFixture("work-conflicting-doi.json");
    const crossref = createCrossrefTestAdapter([() => crossrefJsonResponse(body)]);
    const service = createLiteratureImportService({
      repository: harness.repository,
      providers: {
        ...harness.providers.adapters,
        crossref: {
          fetchSeed: harness.providers.adapters.crossref.fetchSeed,
          lookupDoi: crossref.adapter.lookupDoi
        }
      },
      now: () => new Date("2026-07-20T00:00:00.000Z").getTime()
    });

    // When
    const result = await service.createImport({
      actor: importFixtureActor,
      request: {
        target: { scope: "personal" },
        seed: { providerKey: "openalex", recordKey: "W1" }
      },
      idempotencyKey: "2a7e4164-31dc-4ef8-bde6-cdc2f6a7c971"
    });

    // Then
    expect(result.response.operation).toMatchObject({
      status: "failed",
      failureCode: "identity_conflict",
      warnings: []
    });
    expect(harness.repository.finalizeCalls).toHaveLength(0);
    expect(harness.repository.failCalls[0]).toMatchObject({
      failureCode: "identity_conflict",
      warningCodes: []
    });
  });
});
