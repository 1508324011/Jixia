import type { LiteratureAssertionHistoryDTO } from "@jixia/shared";

import type { CanonicalImportAssertion } from "./literature.import-repository.js";
import { decodeStructuredLiteratureAssertion } from "./literature.history-structured-value.js";
import {
  isCanonicalLiteratureDoi,
  isCanonicalLiteraturePublicationDate,
  normalizeLiteratureText
} from "./literature.normalization.js";
import { LiteratureProjectionError } from "./literature.projection.js";
import type { StoredCanonicalLiteratureAssertion } from "./literature.stored-assertion.js";

export type DecodedLiteratureAssertion = {
  readonly dto: LiteratureAssertionHistoryDTO;
  readonly canonical: CanonicalImportAssertion;
};

export function decodeStoredLiteratureAssertion(
  assertion: StoredCanonicalLiteratureAssertion,
  literatureId: string,
  providerRecordIds: ReadonlySet<string>
): DecodedLiteratureAssertion {
  validateLinkage(assertion, literatureId, providerRecordIds);
  const canonical = decodeCanonicalValue(assertion);
  const provenance = {
    assertionId: assertion.id,
    providerRecordId: assertion.providerRecordId,
    ordinal: assertion.ordinal
  };
  return { canonical, dto: { ...provenance, ...canonical } };
}

function decodeCanonicalValue(assertion: StoredCanonicalLiteratureAssertion): CanonicalImportAssertion {
  switch (assertion.kind) {
    case "title":
    case "abstract":
    case "venue":
    case "publicationType":
      validateScalarShape(assertion);
      return { kind: assertion.kind, value: requireCanonicalText(assertion) };
    case "doi":
      validateScalarShape(assertion);
      if (assertion.textValue === null || !isCanonicalLiteratureDoi(assertion.textValue)) {
        throw invalid(assertion);
      }
      return { kind: assertion.kind, value: assertion.textValue };
    case "publicationDate": {
      validateScalarShape(assertion);
      const value = requireCanonicalText(assertion);
      if (!isCanonicalLiteraturePublicationDate(value)) {
        throw invalid(assertion);
      }
      return { kind: assertion.kind, value };
    }
    case "publicationYear":
      validateScalarShape(assertion);
      if (
        assertion.textValue !== null || assertion.integerValue === null ||
        !Number.isInteger(assertion.integerValue) ||
        assertion.integerValue < 1000 || assertion.integerValue > 9999
      ) {
        throw invalid(assertion);
      }
      return { kind: assertion.kind, value: assertion.integerValue };
    case "authors":
    case "identifiers":
    case "openAccess":
    case "publisher":
      return decodeStructuredLiteratureAssertion(assertion);
    default:
      throw invalid(assertion);
  }
}

function validateLinkage(
  assertion: StoredCanonicalLiteratureAssertion,
  literatureId: string,
  providerRecordIds: ReadonlySet<string>
): void {
  if (
    assertion.id.length === 0 || assertion.literatureId !== literatureId ||
    !providerRecordIds.has(assertion.providerRecordId) ||
    !(assertion.createdAt instanceof Date) || !Number.isFinite(assertion.createdAt.getTime()) ||
    !Array.isArray(assertion.authors) || !Array.isArray(assertion.identifiers)
  ) {
    throw invalid(assertion);
  }
}

function validateScalarShape(assertion: StoredCanonicalLiteratureAssertion): void {
  if (
    assertion.structuredItemCount !== null || assertion.valueFingerprint !== null ||
    assertion.authors.length !== 0 || assertion.identifiers.length !== 0 ||
    assertion.openAccess !== null || assertion.publisher !== null
  ) {
    throw invalid(assertion);
  }
}

function requireCanonicalText(assertion: StoredCanonicalLiteratureAssertion): string {
  if (assertion.textValue === null || assertion.integerValue !== null || !isCanonicalText(assertion.textValue)) {
    throw invalid(assertion);
  }
  return assertion.textValue;
}

function isCanonicalText(value: string): boolean {
  return value.length > 0 && normalizeLiteratureText(value) === value;
}

function invalid(assertion: Pick<StoredCanonicalLiteratureAssertion, "id">): LiteratureProjectionError {
  return new LiteratureProjectionError(assertion.id);
}
