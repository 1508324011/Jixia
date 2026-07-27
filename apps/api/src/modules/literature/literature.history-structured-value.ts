import type {
  LiteratureIdentifierScheme,
  LiteratureOpenAccessHostType,
  LiteratureOpenAccessVersion
} from "@jixia/shared";

import { fingerprintStructuredImportAssertion } from "./literature.import-assertions.js";
import type { CanonicalImportAssertion } from "./literature.import-repository.js";
import { isCanonicalLiteratureDoi, normalizeLiteratureText } from "./literature.normalization.js";
import { LiteratureProjectionError } from "./literature.projection.js";
import type { StoredCanonicalLiteratureAssertion } from "./literature.stored-assertion.js";

const fingerprintPattern = /^[a-f0-9]{64}$/u;
const orcidPattern = /^\d{4}-\d{4}-\d{4}-[\dX]{4}$/u;

export function decodeStructuredLiteratureAssertion(
  assertion: StoredCanonicalLiteratureAssertion
): CanonicalImportAssertion {
  switch (assertion.kind) {
    case "authors":
      return decodeAuthors(assertion);
    case "identifiers":
      return decodeIdentifiers(assertion);
    case "openAccess":
      return decodeOpenAccess(assertion);
    case "publisher":
      return decodePublisher(assertion);
    default:
      throw invalid(assertion);
  }
}

function decodeAuthors(assertion: StoredCanonicalLiteratureAssertion): CanonicalImportAssertion {
  validateStructuredShape(assertion, assertion.authors.length, "authors");
  if (assertion.authors.length === 0) {
    throw invalid(assertion);
  }
  const value = assertion.authors.map((author, position) => {
    if (
      author.position !== position || !isCanonicalText(author.displayName) ||
      (author.orcid !== null && !orcidPattern.test(author.orcid))
    ) {
      throw invalid(assertion);
    }
    return {
      displayName: author.displayName,
      ...(author.orcid === null ? {} : { orcid: author.orcid })
    };
  });
  return validateFingerprint(assertion, { kind: "authors", value });
}

function decodeIdentifiers(assertion: StoredCanonicalLiteratureAssertion): CanonicalImportAssertion {
  validateStructuredShape(assertion, assertion.identifiers.length, "identifiers");
  if (assertion.identifiers.length === 0) {
    throw invalid(assertion);
  }
  const seen = new Set<string>();
  const value = assertion.identifiers.map((identifier, position) => {
    const key = `${identifier.scheme}\u0000${identifier.value}`;
    const scheme = parseIdentifierScheme(identifier.scheme);
    if (
      identifier.position !== position || scheme === null ||
      !isCanonicalText(identifier.value) || seen.has(key) ||
      (identifier.scheme === "doi" && !isCanonicalLiteratureDoi(identifier.value))
    ) {
      throw invalid(assertion);
    }
    seen.add(key);
    return {
      scheme,
      value: identifier.value
    };
  });
  const sorted = [...value].sort(
    (left, right) => left.scheme.localeCompare(right.scheme) || left.value.localeCompare(right.value)
  );
  if (value.some((identifier, index) => identifier !== sorted[index])) {
    throw invalid(assertion);
  }
  return validateFingerprint(assertion, { kind: "identifiers", value });
}

function decodeOpenAccess(assertion: StoredCanonicalLiteratureAssertion): CanonicalImportAssertion {
  validateStructuredShape(assertion, assertion.openAccess === null ? 0 : 1, "openAccess");
  const record = assertion.openAccess;
  const version = record?.version === null || record?.version === undefined
    ? null
    : parseOpenAccessVersion(record.version);
  const hostType = record?.hostType === null || record?.hostType === undefined
    ? null
    : parseOpenAccessHostType(record.hostType);
  if (
    record === null ||
    !isOptionalCanonicalText(record.bestUrl) || !isOptionalCanonicalText(record.license) ||
    (record.bestUrl !== null && !isHttpUrl(record.bestUrl)) ||
    (record.version !== null && version === null) ||
    (record.hostType !== null && hostType === null)
  ) {
    throw invalid(assertion);
  }
  const value = {
    isOpenAccess: record.isOpenAccess,
    ...(record.bestUrl === null ? {} : { bestUrl: record.bestUrl }),
    ...(record.license === null ? {} : { license: record.license }),
    ...(version === null ? {} : { version }),
    ...(hostType === null ? {} : { hostType })
  };
  return validateFingerprint(assertion, { kind: "openAccess", value });
}

function decodePublisher(assertion: StoredCanonicalLiteratureAssertion): CanonicalImportAssertion {
  validateStructuredShape(assertion, assertion.publisher === null ? 0 : 1, "publisher");
  const record = assertion.publisher;
  if (
    record === null || (record.name === null && record.landingPageUrl === null) ||
    !isOptionalCanonicalText(record.name) || !isOptionalCanonicalText(record.landingPageUrl) ||
    (record.landingPageUrl !== null && !isHttpUrl(record.landingPageUrl))
  ) {
    throw invalid(assertion);
  }
  if (record.name === null) {
    if (record.landingPageUrl === null) {
      throw invalid(assertion);
    }
    return validateFingerprint(assertion, {
      kind: "publisher",
      value: { landingPageUrl: record.landingPageUrl }
    });
  }
  return validateFingerprint(assertion, {
    kind: "publisher",
    value: {
      name: record.name,
      ...(record.landingPageUrl === null ? {} : { landingPageUrl: record.landingPageUrl })
    }
  });
}

function validateStructuredShape(
  assertion: StoredCanonicalLiteratureAssertion,
  itemCount: number,
  relation: "authors" | "identifiers" | "openAccess" | "publisher"
): void {
  const hasUnexpectedRelation =
    (relation !== "authors" && assertion.authors.length !== 0) ||
    (relation !== "identifiers" && assertion.identifiers.length !== 0) ||
    (relation !== "openAccess" && assertion.openAccess !== null) ||
    (relation !== "publisher" && assertion.publisher !== null);
  if (
    assertion.textValue !== null || assertion.integerValue !== null ||
    assertion.structuredItemCount !== itemCount || itemCount < 1 ||
    assertion.valueFingerprint === null || !fingerprintPattern.test(assertion.valueFingerprint) ||
    hasUnexpectedRelation
  ) {
    throw invalid(assertion);
  }
}

function validateFingerprint<TAssertion extends CanonicalImportAssertion>(
  stored: StoredCanonicalLiteratureAssertion,
  assertion: TAssertion
): TAssertion {
  if (
    (assertion.kind === "authors" || assertion.kind === "identifiers" ||
      assertion.kind === "openAccess" || assertion.kind === "publisher") &&
    fingerprintStructuredImportAssertion(assertion) === stored.valueFingerprint
  ) {
    return assertion;
  }
  throw invalid(stored);
}

function isCanonicalText(value: string): boolean {
  return value.length > 0 && normalizeLiteratureText(value) === value;
}

function isOptionalCanonicalText(value: string | null): boolean {
  return value === null || isCanonicalText(value);
}

function parseIdentifierScheme(value: string): LiteratureIdentifierScheme | null {
  switch (value) {
    case "doi": case "pmid": case "pmcid": case "openalex": case "issn": case "isbn":
      return value;
    default:
      return null;
  }
}

function parseOpenAccessVersion(value: string): LiteratureOpenAccessVersion | null {
  switch (value) {
    case "published": case "accepted": case "submitted":
      return value;
    default:
      return null;
  }
}

function parseOpenAccessHostType(value: string): LiteratureOpenAccessHostType | null {
  switch (value) {
    case "publisher": case "repository": case "other":
      return value;
    default:
      return null;
  }
}

function isHttpUrl(value: string): boolean {
  try {
    const url = new URL(value);
    return (url.protocol === "http:" || url.protocol === "https:") &&
      url.username === "" && url.password === "";
  } catch {
    return false;
  }
}

function invalid(assertion: Pick<StoredCanonicalLiteratureAssertion, "id">): LiteratureProjectionError {
  return new LiteratureProjectionError(assertion.id);
}
