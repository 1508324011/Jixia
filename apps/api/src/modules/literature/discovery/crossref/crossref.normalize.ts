import type {
  LiteratureAuthorValue,
  LiteratureIdentifierValue,
  LiteraturePublisherValue
} from "@jixia/shared";

import {
  isCanonicalLiteratureDoi,
  isCanonicalLiteraturePublicationYear,
  normalizeLiteratureDoi,
  normalizeLiteratureText
} from "../../literature.normalization.js";
import { LiteraturePayloadError } from "../provider-errors.js";
import { normalizeProviderReferenceUrl } from "../provider-reference-url.js";
import { normalizeCrossrefAbstract } from "./crossref.abstract.js";
import type { CrossrefWork } from "./crossref.schema.js";
import type { CrossrefNormalizedWork } from "./crossref.types.js";

type NormalizedDate = {
  readonly publicationYear: number;
  readonly publicationDate: string;
};

type CrossrefDate = NonNullable<CrossrefWork["published"]>;
type CrossrefAuthor = NonNullable<CrossrefWork["author"]>[number];

const orcidPattern = /^\d{4}-\d{4}-\d{4}-\d{3}[\dX]$/u;
const issnPattern = /^\d{4}-\d{3}[\dX]$/u;

export function normalizeCrossrefWork(work: CrossrefWork): CrossrefNormalizedWork {
  const doi = normalizeLiteratureDoi(work.DOI);
  if (doi.length > 512 || !isCanonicalLiteratureDoi(doi)) {
    throw new LiteraturePayloadError("invalid_response");
  }
  const date = normalizeDate(selectDate(work));

  return {
    source: { providerKey: "crossref", recordKey: doi },
    title: firstNormalizedText(work.title),
    abstract: work.abstract === undefined ? null : normalizeCrossrefAbstract(work.abstract),
    publicationYear: date?.publicationYear ?? null,
    publicationDate: date?.publicationDate ?? null,
    venue: firstNormalizedText(work["container-title"]),
    publicationType: normalizePublicationType(work.type),
    doi,
    authors: normalizeAuthors(work.author),
    identifiers: normalizeIdentifiers(doi, work.ISSN),
    openAccess: null,
    publisher: normalizePublisher(work.publisher, work.URL)
  };
}

function selectDate(work: CrossrefWork): CrossrefDate | undefined {
  return work.published ?? work["published-online"] ?? work["published-print"] ??
    work.issued ?? work.created;
}

function normalizeDate(value: CrossrefDate | undefined): NormalizedDate | null {
  if (value === undefined) {
    return null;
  }
  const parts = value["date-parts"][0];
  if (parts === undefined) {
    throw new LiteraturePayloadError("invalid_response");
  }
  const year = parts[0];
  if (year === undefined || !isCanonicalLiteraturePublicationYear(year)) {
    throw new LiteraturePayloadError("invalid_response");
  }
  const month = parts[1];
  if (month === undefined) {
    return { publicationYear: year, publicationDate: String(year).padStart(4, "0") };
  }
  if (month < 1 || month > 12) {
    throw new LiteraturePayloadError("invalid_response");
  }
  const yearMonth = `${String(year).padStart(4, "0")}-${String(month).padStart(2, "0")}`;
  const day = parts[2];
  if (day === undefined) {
    return { publicationYear: year, publicationDate: yearMonth };
  }
  if (day < 1 || day > maximumDayInMonth(year, month)) {
    throw new LiteraturePayloadError("invalid_response");
  }
  return {
    publicationYear: year,
    publicationDate: `${yearMonth}-${String(day).padStart(2, "0")}`
  };
}

function maximumDayInMonth(year: number, month: number): number {
  switch (month) {
    case 2:
      return year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0) ? 29 : 28;
    case 4:
    case 6:
    case 9:
    case 11:
      return 30;
    default:
      return 31;
  }
}

function firstNormalizedText(values: readonly string[] | undefined): string | null {
  if (values === undefined) {
    return null;
  }
  for (const value of values) {
    const normalized = normalizeLiteratureText(value);
    if (normalized.length > 0) {
      return normalized;
    }
  }
  return null;
}

function normalizePublicationType(value: string | undefined): string | null {
  if (value === undefined) {
    return null;
  }
  const normalized = normalizeLiteratureText(value).toLowerCase();
  switch (normalized) {
    case "journal-article":
      return "article";
    case "posted-content":
      return "preprint";
    case "":
      return null;
    default:
      return normalized;
  }
}

function normalizeAuthors(values: readonly CrossrefAuthor[] | undefined): readonly LiteratureAuthorValue[] {
  if (values === undefined) {
    return [];
  }
  const authors: LiteratureAuthorValue[] = [];
  for (const value of values) {
    const displayName = normalizeAuthorName(value);
    if (displayName === null) {
      continue;
    }
    const orcid = normalizeOrcid(value.ORCID);
    authors.push(orcid === null ? { displayName } : { displayName, orcid });
  }
  return authors;
}

function normalizeAuthorName(author: CrossrefAuthor): string | null {
  const given = author.given === undefined ? "" : normalizeLiteratureText(author.given);
  const family = author.family === undefined ? "" : normalizeLiteratureText(author.family);
  const splitName = normalizeLiteratureText(`${given} ${family}`);
  if (splitName.length > 0) {
    return splitName;
  }
  if (author.name === undefined) {
    return null;
  }
  const literalName = normalizeLiteratureText(author.name);
  return literalName.length === 0 ? null : literalName;
}

function normalizeOrcid(value: string | undefined): string | null {
  if (value === undefined) {
    return null;
  }
  const normalized = normalizeLiteratureText(value)
    .replace(/^https?:\/\/(?:www\.)?orcid\.org\//iu, "")
    .toUpperCase();
  return orcidPattern.test(normalized) ? normalized : null;
}

function normalizeIdentifiers(
  doi: string,
  values: readonly string[] | undefined
): readonly LiteratureIdentifierValue[] {
  const issns = new Set<string>();
  for (const value of values ?? []) {
    const normalized = normalizeLiteratureText(value).toUpperCase();
    if (issnPattern.test(normalized)) {
      issns.add(normalized);
    }
  }
  const identifiers: LiteratureIdentifierValue[] = [{ scheme: "doi", value: doi }];
  for (const value of [...issns].sort()) {
    identifiers.push({ scheme: "issn", value });
  }
  return identifiers;
}

function normalizePublisher(
  publisher: string | undefined,
  landingPageUrl: string | undefined
): LiteraturePublisherValue | null {
  const name = publisher === undefined ? null : normalizeLiteratureText(publisher) || null;
  const url = normalizeHttpUrl(landingPageUrl);
  if (name !== null && url !== null) {
    return { name, landingPageUrl: url };
  }
  if (name !== null) {
    return { name };
  }
  return url === null ? null : { landingPageUrl: url };
}

function normalizeHttpUrl(value: string | undefined): string | null {
  if (value === undefined) {
    return null;
  }
  try {
    return normalizeProviderReferenceUrl(normalizeLiteratureText(value));
  } catch (error) {
    if (error instanceof LiteraturePayloadError) {
      return null;
    }
    throw error;
  }
}
