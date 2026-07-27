import { describe, expect, it } from "vitest";

import { pmcFixturePointer } from "./literature.import-provider.test-fixture.js";
import {
  createImportServiceHarness,
  importFixtureActor
} from "./literature.import-service.test-fixture.js";

const idempotencyKey = "bdb7c115-a6a7-4bb7-a2aa-42b86a123102";

describe("literature import enrichment provenance", () => {
  it("rejects an Unpaywall enrichment with substituted provenance", async () => {
    // Given
    const harness = createImportServiceHarness();
    harness.providers.unpaywall = {
      ...harness.providers.unpaywall,
      source: { providerKey: "unpaywall", recordKey: "10.1000/substituted" }
    };

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
      failureCode: "invalid_provider_response"
    });
    expect(harness.repository.finalizeCalls).toHaveLength(0);
  });

  it("rejects a PMC enrichment with substituted provenance", async () => {
    // Given
    const harness = createImportServiceHarness();
    harness.providers.pmcOutcomes.set("PMC42", {
      ...pmcFixturePointer,
      source: { providerKey: "pmc", recordKey: "PMC999" }
    });

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
      failureCode: "invalid_provider_response"
    });
    expect(harness.repository.finalizeCalls).toHaveLength(0);
  });
});
