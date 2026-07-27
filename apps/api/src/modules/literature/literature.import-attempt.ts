import type {
  LiteratureImportFailureCode,
  LiteratureImportSeed,
  LiteratureImportWarningCode,
  LiteratureProviderKey,
  LiteratureSourceIdentity
} from "@jixia/shared";

import type { ProviderAssertionBatch } from "./literature.import-repository.js";
import { LiteratureProviderError } from "./discovery/provider-errors.js";
import {
  classifyEnrichmentFailure,
  classifySeedFailure,
  type LiteratureEnrichmentFailure
} from "./literature.import-failure.js";
import { importRecordToBatch, type NormalizedImportRecord } from "./literature.import-record.js";
import type { LiteratureImportProviders } from "./literature.import-service.js";

export type LiteratureImportAttemptResult =
  | {
      readonly kind: "succeeded";
      readonly batches: readonly ProviderAssertionBatch[];
      readonly warningCodes: readonly LiteratureImportWarningCode[];
    }
  | {
      readonly kind: "failed";
      readonly failureCode: LiteratureImportFailureCode;
      readonly warningCodes: readonly LiteratureImportWarningCode[];
    };

type RecordEnrichmentOutcome =
  | { readonly kind: "record"; readonly record: NormalizedImportRecord }
  | { readonly kind: "warning"; readonly warningCode: LiteratureImportWarningCode }
  | { readonly kind: "failed"; readonly failureCode: LiteratureImportFailureCode };

export async function collectLiteratureImportAttempt(input: {
  readonly providers: LiteratureImportProviders;
  readonly seed: LiteratureImportSeed;
  readonly operationDeadlineMs: number;
}): Promise<LiteratureImportAttemptResult> {
  const seedResult = await fetchSeedResult(input);
  if (seedResult.kind === "failed") {
    return seedResult;
  }
  const seedRecord = seedResult.record;
  if (!sameSource(seedRecord.source, input.seed)) {
    return failed("invalid_provider_response", []);
  }
  const seedBatch = importRecordToBatch(seedRecord);
  if (seedBatch.assertions.length === 0) {
    return failed("invalid_provider_response", []);
  }
  if (seedRecord.doi === null) {
    return { kind: "succeeded", batches: [seedBatch], warningCodes: [] };
  }

  const doi = seedRecord.doi;
  const callInput = { doi, operationDeadlineMs: input.operationDeadlineMs };
  const [openalex, crossref, pubmed, unpaywall] = await Promise.allSettled([
    input.providers.openalex.lookupDoi(callInput),
    input.providers.crossref.lookupDoi(callInput),
    input.providers.pubmed.lookupDoi(callInput),
    input.providers.unpaywall.enrichDoi(callInput)
  ]);
  const outcomes = [
    recordOutcome("openalex", openalex),
    recordOutcome("crossref", crossref),
    recordOutcome("pubmed", pubmed)
  ] as const;
  const batches: ProviderAssertionBatch[] = [seedBatch];
  const warnings: LiteratureImportWarningCode[] = [];
  const records: NormalizedImportRecord[] = [seedRecord];

  for (const outcome of outcomes) {
    switch (outcome.kind) {
      case "record":
        if (outcome.record.doi !== doi) {
          return outcome.record.doi === null
            ? failed("invalid_provider_response", warnings)
            : failed("identity_conflict", warnings);
        }
        records.push(outcome.record);
        if (outcome.record.source.providerKey !== input.seed.providerKey) {
          batches.push(importRecordToBatch(outcome.record));
        } else if (!sameSource(outcome.record.source, input.seed)) {
          return failed("identity_conflict", warnings);
        }
        break;
      case "warning":
        warnings.push(outcome.warningCode);
        break;
      case "failed":
        return failed(outcome.failureCode, warnings);
      default: {
        const unreachable: never = outcome;
        throw unreachable;
      }
    }
  }

  if (unpaywall.status === "fulfilled") {
    if (!sameSource(unpaywall.value.source, { providerKey: "unpaywall", recordKey: doi })) {
      return failed("invalid_provider_response", warnings);
    }
    if (unpaywall.value.doi !== doi) {
      return failed("identity_conflict", warnings);
    }
    batches.push({
      source: unpaywall.value.source,
      assertions: [
        { kind: "doi", value: unpaywall.value.doi },
        { kind: "openAccess", value: unpaywall.value.openAccess },
        { kind: "publisher", value: unpaywall.value.publisher }
      ]
    });
  } else {
    const failureCode = applyEnrichmentFailure(
      classifyEnrichmentFailure("unpaywall", unpaywall.reason),
      warnings
    );
    if (failureCode !== null) {
      return failed(failureCode, warnings);
    }
  }

  const pmcids = exactPmcids(records);
  const pmcResults = await Promise.allSettled(pmcids.map(async (pmcid) => ({
    pmcid,
    pointer: await input.providers.pmc.lookup({
      pmcid,
      operationDeadlineMs: input.operationDeadlineMs
    })
  })));
  for (const pmcResult of pmcResults) {
    if (pmcResult.status === "fulfilled") {
      const { pmcid, pointer } = pmcResult.value;
      if (pointer !== null) {
        if (!sameSource(pointer.source, { providerKey: "pmc", recordKey: pmcid })) {
          return failed("invalid_provider_response", warnings);
        }
        batches.push({
          source: pointer.source,
          assertions: [{ kind: "openAccess", value: pointer.openAccess }]
        });
      }
    } else {
      const failureCode = applyEnrichmentFailure(
        classifyEnrichmentFailure("pmc", pmcResult.reason),
        warnings
      );
      if (failureCode !== null) {
        return failed(failureCode, warnings);
      }
    }
  }
  return { kind: "succeeded", batches, warningCodes: normalizeWarningCodes(warnings) };
}

async function fetchSeedResult(input: {
  readonly providers: LiteratureImportProviders;
  readonly seed: LiteratureImportSeed;
  readonly operationDeadlineMs: number;
}): Promise<
  | { readonly kind: "record"; readonly record: NormalizedImportRecord }
  | { readonly kind: "failed"; readonly failureCode: LiteratureImportFailureCode; readonly warningCodes: readonly [] }
> {
  try {
    switch (input.seed.providerKey) {
      case "openalex":
        return {
          kind: "record",
          record: await input.providers.openalex.fetchSeed({
            recordKey: input.seed.recordKey,
            operationDeadlineMs: input.operationDeadlineMs
          })
        };
      case "crossref":
        return {
          kind: "record",
          record: await input.providers.crossref.fetchSeed({
            recordKey: input.seed.recordKey,
            operationDeadlineMs: input.operationDeadlineMs
          })
        };
      case "pubmed":
        return {
          kind: "record",
          record: await input.providers.pubmed.fetchSeed({
            recordKey: input.seed.recordKey,
            operationDeadlineMs: input.operationDeadlineMs
          })
        };
      default: {
        const unreachable: never = input.seed.providerKey;
        throw unreachable;
      }
    }
  } catch (error) {
    return {
      kind: "failed",
      failureCode: error instanceof LiteratureProviderError
        ? classifySeedFailure(error)
        : "internal_error",
      warningCodes: []
    };
  }
}

function recordOutcome<TRecord extends NormalizedImportRecord>(
  providerKey: LiteratureProviderKey,
  result: PromiseSettledResult<TRecord>
): RecordEnrichmentOutcome {
  if (result.status === "fulfilled") {
    if (result.value.source.providerKey !== providerKey) {
      return { kind: "failed", failureCode: "invalid_provider_response" };
    }
    return { kind: "record", record: result.value };
  }
  return classifyEnrichmentFailure(providerKey, result.reason);
}

function applyEnrichmentFailure(
  outcome: LiteratureEnrichmentFailure,
  warnings: LiteratureImportWarningCode[]
): LiteratureImportFailureCode | null {
  switch (outcome.kind) {
    case "failed":
      return outcome.failureCode;
    case "warning":
      warnings.push(outcome.warningCode);
      return null;
    default: {
      const unreachable: never = outcome;
      throw unreachable;
    }
  }
}

function exactPmcids(records: readonly NormalizedImportRecord[]): readonly string[] {
  return [...new Set(records.flatMap((record) => record.identifiers
    .filter((identifier) => identifier.scheme === "pmcid")
    .map((identifier) => identifier.value)))];
}

function sameSource(left: LiteratureSourceIdentity, right: LiteratureSourceIdentity): boolean {
  return left.providerKey === right.providerKey && left.recordKey === right.recordKey;
}

function failed(
  failureCode: LiteratureImportFailureCode,
  warningCodes: readonly LiteratureImportWarningCode[]
): LiteratureImportAttemptResult {
  return { kind: "failed", failureCode, warningCodes: normalizeWarningCodes(warningCodes) };
}

function normalizeWarningCodes(
  warningCodes: readonly LiteratureImportWarningCode[]
): readonly LiteratureImportWarningCode[] {
  return [...new Set(warningCodes)];
}
