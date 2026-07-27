import type { LiteratureIdentifierValue } from "@jixia/shared";

import {
  isCanonicalLiteratureDoi,
  normalizeLiteratureDoi,
  normalizeLiteratureText
} from "../../literature.normalization.js";
import {
  isCanonicalPmcRecordKey,
  isCanonicalPubmedRecordKey
} from "../provider-identities.js";
import { LiteraturePayloadError } from "../provider-errors.js";

export type PubMedRawIdentifier = {
  readonly kind: string;
  readonly value: string;
};

export type PubMedIdentifierInput = {
  readonly recordKey: string;
  readonly articleIds: readonly PubMedRawIdentifier[];
  readonly issns: readonly string[];
};

export type PubMedIdentifiers = {
  readonly doi: string | null;
  readonly values: readonly LiteratureIdentifierValue[];
};

const issnPattern = /^\d{4}-\d{3}[\dX]$/u;

export function normalizePubMedIdentifiers(
  input: PubMedIdentifierInput
): PubMedIdentifiers {
  let pmid: string | null = null;
  let pmcid: string | null = null;
  let doi: string | null = null;

  for (const identifier of input.articleIds) {
    const kind = normalizeLiteratureText(identifier.kind).toLowerCase();
    const value = normalizeLiteratureText(identifier.value);
    switch (kind) {
      case "pubmed":
      case "pmid":
        if (!isCanonicalPubmedRecordKey(value)) {
          throw invalidIdentifiers();
        }
        pmid = mergeSingleton(pmid, value);
        break;
      case "doi": {
        const normalizedDoi = normalizeLiteratureDoi(value);
        if (!isCanonicalLiteratureDoi(normalizedDoi)) {
          throw invalidIdentifiers();
        }
        doi = mergeSingleton(doi, normalizedDoi);
        break;
      }
      case "pmc":
      case "pmcid": {
        const normalizedPmcid = value.toUpperCase();
        if (!isCanonicalPmcRecordKey(normalizedPmcid)) {
          throw invalidIdentifiers();
        }
        pmcid = mergeSingleton(pmcid, normalizedPmcid);
        break;
      }
      default:
        break;
    }
  }
  if (pmid !== input.recordKey) {
    throw invalidIdentifiers();
  }

  const values: LiteratureIdentifierValue[] = [{ scheme: "pmid", value: pmid }];
  if (doi !== null) {
    values.push({ scheme: "doi", value: doi });
  }
  if (pmcid !== null) {
    values.push({ scheme: "pmcid", value: pmcid });
  }
  for (const issn of normalizeIssns(input.issns)) {
    values.push({ scheme: "issn", value: issn });
  }
  values.sort((left, right) =>
    left.scheme.localeCompare(right.scheme) || left.value.localeCompare(right.value)
  );
  return { doi, values };
}

function normalizeIssns(values: readonly string[]): readonly string[] {
  const normalized = new Set<string>();
  for (const value of values) {
    const issn = normalizeLiteratureText(value).toUpperCase();
    if (issnPattern.test(issn)) {
      normalized.add(issn);
    }
  }
  return [...normalized].sort();
}

function mergeSingleton(current: string | null, next: string): string {
  if (current !== null && current !== next) {
    throw invalidIdentifiers();
  }
  return next;
}

function invalidIdentifiers(): LiteraturePayloadError {
  return new LiteraturePayloadError("invalid_response");
}
