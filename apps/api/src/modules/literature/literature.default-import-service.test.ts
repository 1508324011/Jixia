import { describe, expect, it } from "vitest";

import { loadLiteratureProviderConfig } from "./discovery/provider-config.js";
import { createConfiguredLiteratureImportProviders } from "./literature.default-import-service.js";
import {
  importFixtureActor,
  InMemoryImportRepository
} from "./literature.import-service.test-fixture.js";
import { createLiteratureImportService } from "./literature.import-service.js";

describe("default literature import service composition", () => {
  it("admits an operation before closing a disabled seed provider as unconfigured", async () => {
    // Given
    const repository = new InMemoryImportRepository();
    const service = createLiteratureImportService({
      repository,
      providers: createConfiguredLiteratureImportProviders(loadLiteratureProviderConfig({}))
    });

    // When
    const result = await service.createImport({
      actor: importFixtureActor,
      request: {
        target: { scope: "personal" },
        seed: { providerKey: "openalex", recordKey: "W1" }
      },
      idempotencyKey: "3a1dc99b-4fc7-489d-966c-428637297fc7"
    });

    // Then
    expect(repository.history.map((operation) => operation.status)).toEqual([
      "running",
      "failed"
    ]);
    expect(result.response.operation).toMatchObject({
      status: "failed",
      failureCode: "provider_unconfigured"
    });
  });
});
