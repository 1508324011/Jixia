import type { LiteratureDiscoveryCandidateDTO, LiteratureSourceIdentity } from "@jixia/shared";

import type {
  CanonicalImportAssertion,
  ProviderAssertionBatch
} from "./literature.import-repository.js";

export type NormalizedImportRecord = Omit<LiteratureDiscoveryCandidateDTO, "sourceMatches"> & {
  readonly source: LiteratureSourceIdentity;
};

export function importRecordToBatch(record: NormalizedImportRecord): ProviderAssertionBatch {
  const assertions: CanonicalImportAssertion[] = [];
  appendText(assertions, "title", record.title);
  appendText(assertions, "abstract", record.abstract);
  appendNumber(assertions, record.publicationYear);
  appendText(assertions, "doi", record.doi);
  appendText(assertions, "publicationDate", record.publicationDate);
  appendText(assertions, "venue", record.venue);
  appendText(assertions, "publicationType", record.publicationType);
  if (record.authors.length > 0) {
    assertions.push({ kind: "authors", value: record.authors });
  }
  if (record.identifiers.length > 0) {
    assertions.push({ kind: "identifiers", value: record.identifiers });
  }
  if (record.openAccess !== null) {
    assertions.push({ kind: "openAccess", value: record.openAccess });
  }
  if (record.publisher !== null) {
    assertions.push({ kind: "publisher", value: record.publisher });
  }
  return { source: record.source, assertions };
}

function appendText(
  assertions: CanonicalImportAssertion[],
  kind: "title" | "abstract" | "doi" | "publicationDate" | "venue" | "publicationType",
  value: string | null
): void {
  if (value !== null) {
    assertions.push({ kind, value });
  }
}

function appendNumber(
  assertions: CanonicalImportAssertion[],
  value: number | null
): void {
  if (value !== null) {
    assertions.push({ kind: "publicationYear", value });
  }
}
