import { describe, expect, it } from "vitest";

import {
  crossrefFixtureWork,
  fixtureDoi,
  fixtureProviderError,
  openAlexFixtureWork,
  warningForProvider
} from "./literature.import-provider.test-fixture.js";
import {
  createImportServiceHarness,
  importFixtureActor
} from "./literature.import-service.test-fixture.js";
import { createLiteratureImportService } from "./literature.import-service.js";

const idempotencyKey = "bdb7c115-a6a7-4bb7-a2aa-42b86a123101";

describe("literature import enrichment", () => {
  it("collects every DOI and PMCID enrichment as one provenance batch per provider", async () => {
    // Given
    const harness = createImportServiceHarness();

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
    expect(result.response.operation).toMatchObject({ status: "succeeded", warnings: [] });
    expect(harness.providers.calls).toEqual([
      "openalex:seed",
      "openalex:doi",
      "crossref:doi",
      "pubmed:doi",
      "unpaywall:doi",
      "pmc:lookup"
    ]);
    expect(
      harness.repository.finalizeCalls[0]?.batches.map((batch) => batch.source.providerKey)
    ).toEqual(["openalex", "crossref", "pubmed", "unpaywall", "pmc"]);
    expect(JSON.stringify(harness.repository.finalizeCalls)).not.toContain("/pdf");
  });

  it("starts all DOI enrichments before any result settles", async () => {
    // Given
    const harness = createImportServiceHarness();
    const started = new Set<string>();
    let releaseLookups = (): void => undefined;
    const lookupGate = new Promise<void>((resolve) => {
      releaseLookups = resolve;
    });
    const waitForRelease = async <T>(providerKey: string, value: T): Promise<T> => {
      started.add(providerKey);
      await lookupGate;
      return value;
    };
    const service = createLiteratureImportService({
      repository: harness.repository,
      providers: {
        openalex: {
          fetchSeed: harness.providers.adapters.openalex.fetchSeed,
          lookupDoi: async () => waitForRelease("openalex", harness.providers.openAlexDoi)
        },
        crossref: {
          fetchSeed: harness.providers.adapters.crossref.fetchSeed,
          lookupDoi: async () => waitForRelease("crossref", harness.providers.crossrefDoi)
        },
        pubmed: {
          fetchSeed: harness.providers.adapters.pubmed.fetchSeed,
          lookupDoi: async () => waitForRelease("pubmed", harness.providers.pubmedDoi)
        },
        unpaywall: {
          enrichDoi: async () => waitForRelease("unpaywall", harness.providers.unpaywall)
        },
        pmc: harness.providers.adapters.pmc
      },
      now: () => new Date("2026-07-20T00:00:00.000Z").getTime()
    });
    const operation = service.createImport({
      actor: importFixtureActor,
      request: {
        target: { scope: "personal" },
        seed: { providerKey: "openalex", recordKey: "W1" }
      },
      idempotencyKey
    });

    // When
    await new Promise<void>((resolve) => setImmediate(resolve));
    const startedBeforeRelease = [...started].sort();
    releaseLookups();
    await operation;

    // Then
    expect(startedBeforeRelease).toEqual(["crossref", "openalex", "pubmed", "unpaywall"]);
  });

  it("closes an optional enrichment failure into its typed warning", async () => {
    // Given
    const harness = createImportServiceHarness();
    harness.providers.crossrefDoiError = fixtureProviderError("crossref", "not_found");

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
      status: "succeeded",
      warnings: [warningForProvider.crossref]
    });
    expect(
      harness.repository.finalizeCalls[0]?.batches.some(
        (batch) => batch.source.providerKey === "crossref"
      )
    ).toBe(false);
  });

  it("enriches every discovered PMCID and preserves partial PMC success", async () => {
    // Given
    const harness = createImportServiceHarness();
    harness.providers.openAlexDoi = {
      ...openAlexFixtureWork,
      identifiers: [
        ...openAlexFixtureWork.identifiers,
        { scheme: "pmcid", value: "PMC43" }
      ]
    };
    harness.providers.pmcOutcomes.set(
      "PMC43",
      fixtureProviderError("pmc", "timeout")
    );

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
    expect(harness.providers.pmcRecordKeys).toEqual(["PMC43", "PMC42"]);
    expect(result.response.operation).toMatchObject({
      status: "succeeded",
      warnings: [warningForProvider.pmc]
    });
    expect(harness.repository.finalizeCalls[0]?.batches
      .filter((batch) => batch.source.providerKey === "pmc")
      .map((batch) => batch.source.recordKey)).toEqual(["PMC42"]);
  });

  it("starts every PMCID lookup concurrently and deduplicates repeated warnings", async () => {
    // Given
    const harness = createImportServiceHarness();
    harness.providers.openAlexDoi = {
      ...openAlexFixtureWork,
      identifiers: [
        ...openAlexFixtureWork.identifiers,
        { scheme: "pmcid", value: "PMC43" }
      ]
    };
    const started = new Set<string>();
    let releaseLookups = (): void => undefined;
    const lookupGate = new Promise<void>((resolve) => {
      releaseLookups = resolve;
    });
    const service = createLiteratureImportService({
      repository: harness.repository,
      providers: {
        ...harness.providers.adapters,
        pmc: {
          lookup: async (input) => {
            started.add(input.pmcid);
            await lookupGate;
            throw fixtureProviderError("pmc", "timeout");
          }
        }
      },
      now: () => new Date("2026-07-20T00:00:00.000Z").getTime()
    });
    const operation = service.createImport({
      actor: importFixtureActor,
      request: {
        target: { scope: "personal" },
        seed: { providerKey: "openalex", recordKey: "W1" }
      },
      idempotencyKey
    });

    // When
    await new Promise<void>((resolve) => setImmediate(resolve));
    const startedBeforeRelease = [...started].sort();
    releaseLookups();
    const result = await operation;

    // Then
    expect(startedBeforeRelease).toEqual(["PMC42", "PMC43"]);
    expect(result.response.operation).toMatchObject({
      status: "succeeded",
      warnings: [warningForProvider.pmc]
    });
  });

  it("fails the operation when an enrichment observes a conflicting DOI", async () => {
    // Given
    const harness = createImportServiceHarness();
    harness.providers.crossrefDoi = {
      ...crossrefFixtureWork,
      source: { providerKey: "crossref", recordKey: "10.1000/conflict" },
      doi: "10.1000/conflict",
      identifiers: [{ scheme: "doi", value: "10.1000/conflict" }]
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
      failureCode: "identity_conflict",
      literatureId: null
    });
    expect(harness.repository.finalizeCalls).toHaveLength(0);
    expect(harness.repository.failCalls[0]).toMatchObject({
      failureCode: "identity_conflict"
    });
    expect(fixtureDoi).not.toBe("10.1000/conflict");
  });
});
