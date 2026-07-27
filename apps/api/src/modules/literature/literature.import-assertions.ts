import { createHash } from "node:crypto";

import type { CanonicalAssertionKind } from "@jixia/shared";

import type {
  CanonicalImportAssertion,
  ProviderAssertionBatch,
  StructuredImportAssertion
} from "./literature.import-repository.js";
import { LiteratureImportRepositoryError } from "./literature.import-repository.js";
import { isCanonicalLiteraturePublicationChronology } from "./literature.normalization.js";

export function prepareProviderAssertionBatch(
  batch: ProviderAssertionBatch
): ProviderAssertionBatch {
  const kinds = new Set<CanonicalAssertionKind>();
  let publicationYear: number | null = null;
  let publicationDate: string | null = null;
  const assertions = batch.assertions.map((assertion) => {
    if (kinds.has(assertion.kind)) {
      throw new LiteratureImportRepositoryError("invalid_batch");
    }
    kinds.add(assertion.kind);

    if (assertion.kind === "publicationYear") {
      publicationYear = assertion.value;
    }
    if (assertion.kind === "publicationDate") {
      publicationDate = assertion.value;
    }
    if (assertion.kind !== "identifiers") {
      if (assertion.kind === "authors" && assertion.value.length === 0) {
        throw new LiteratureImportRepositoryError("invalid_batch");
      }
      return assertion;
    }

    const identifiers = [...new Map(
      assertion.value.map((identifier) => [
        `${identifier.scheme}\u0000${identifier.value}`,
        identifier
      ])
    ).values()].sort(
      (left, right) =>
        left.scheme.localeCompare(right.scheme) || left.value.localeCompare(right.value)
    );
    if (identifiers.length === 0) {
      throw new LiteratureImportRepositoryError("invalid_batch");
    }
    return { kind: assertion.kind, value: identifiers };
  });

  if (assertions.length === 0) {
    throw new LiteratureImportRepositoryError("invalid_batch");
  }
  if (!isCanonicalLiteraturePublicationChronology(publicationYear, publicationDate)) {
    throw new LiteratureImportRepositoryError("invalid_batch");
  }
  return { source: batch.source, assertions };
}

export function fingerprintStructuredImportAssertion(
  assertion: StructuredImportAssertion
): string {
  return createHash("sha256").update(serializeImportAssertion(assertion), "utf8").digest("hex");
}

export function canonicalImportAssertionsEqual(
  left: CanonicalImportAssertion,
  right: CanonicalImportAssertion
): boolean {
  return serializeImportAssertion(left) === serializeImportAssertion(right);
}

function serializeImportAssertion(assertion: CanonicalImportAssertion): string {
  switch (assertion.kind) {
    case "title":
    case "abstract":
    case "doi":
    case "publicationDate":
    case "venue":
    case "publicationType":
    case "publicationYear":
      return JSON.stringify([assertion.kind, assertion.value]);
    case "authors":
      return JSON.stringify([
        assertion.kind,
        assertion.value.map((author) => [author.displayName, author.orcid ?? null])
      ]);
    case "identifiers":
      return JSON.stringify([
        assertion.kind,
        assertion.value.map((identifier) => [identifier.scheme, identifier.value])
      ]);
    case "openAccess":
      return JSON.stringify([
        assertion.kind,
        assertion.value.isOpenAccess,
        assertion.value.bestUrl ?? null,
        assertion.value.license ?? null,
        assertion.value.version ?? null,
        assertion.value.hostType ?? null
      ]);
    case "publisher":
      return JSON.stringify([
        assertion.kind,
        assertion.value.name ?? null,
        assertion.value.landingPageUrl ?? null
      ]);
    default: {
      const unreachable: never = assertion;
      throw unreachable;
    }
  }
}
