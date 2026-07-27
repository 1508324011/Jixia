import type {
  LiteratureAuthorValue,
  LiteratureIdentifierValue,
  LiteratureOpenAccessHostType,
  LiteratureOpenAccessValue,
  LiteratureOpenAccessVersion,
  LiteraturePublisherValue
} from "@jixia/shared";

import {
  isCanonicalLiteratureDoi,
  isCanonicalLiteraturePublicationChronology,
  normalizeLiteratureDoi,
  normalizeLiteratureText
} from "../../literature.normalization.js";
import { LiteraturePayloadError } from "../provider-errors.js";
import {
  isCanonicalOpenAlexRecordKey,
  isCanonicalPmcRecordKey,
  isCanonicalPubmedRecordKey
} from "../provider-identities.js";
import { normalizeProviderReferenceUrl } from "../provider-reference-url.js";
import type { OpenAlexWork } from "./openalex.schemas.js";
import type { OpenAlexNormalizedWork } from "./openalex.types.js";

const openAlexWorkIdPattern = /^https:\/\/openalex\.org\/(W\d+)$/u;
const orcidPattern = /^https:\/\/orcid\.org\/(.+)$/u;
const pmidPatterns = [
  /^https:\/\/pubmed\.ncbi\.nlm\.nih\.gov\/(\d+)\/?$/u,
  /^pmid:(\d+)$/u,
  /^(\d+)$/u
] as const;
const pmcidPatterns = [
  /^https:\/\/www\.ncbi\.nlm\.nih\.gov\/pmc\/articles\/(PMC\d+)\/?$/u,
  /^pmcid:(PMC\d+)$/u,
  /^(PMC\d+)$/u
] as const;
const versionMap = {
  publishedVersion: "published",
  acceptedVersion: "accepted",
  submittedVersion: "submitted"
} as const satisfies Readonly<Record<string, LiteratureOpenAccessVersion>>;
type OpenAlexSource = NonNullable<OpenAlexWork["primary_location"]>["source"];

export function normalizeOpenAlexWork(work: OpenAlexWork): OpenAlexNormalizedWork {
  const recordKey = parseOpenAlexWorkId(work.id);
  if (work.ids.openalex !== undefined && parseOpenAlexWorkId(work.ids.openalex) !== recordKey) {
    throw invalidOpenAlexPayload();
  }
  const doi = normalizeWorkDoi(work);
  const source = work.primary_location?.source ?? work.best_oa_location?.source ?? null;
  if (!isCanonicalLiteraturePublicationChronology(work.publication_year, work.publication_date)) {
    throw invalidOpenAlexPayload();
  }

  return {
    source: { providerKey: "openalex", recordKey },
    title: optionalText(work.title),
    abstract: reconstructOpenAlexAbstract(work.abstract_inverted_index),
    publicationYear: work.publication_year,
    publicationDate: work.publication_date,
    venue: optionalText(source?.display_name ?? null),
    publicationType: normalizeLiteratureText(work.type),
    doi,
    authors: normalizeAuthors(work),
    identifiers: normalizeIdentifiers(work, recordKey, doi, source),
    openAccess: normalizeOpenAccess(work),
    publisher: normalizePublisher(work.primary_location?.source ?? null)
  };
}

function parseOpenAlexWorkId(value: string): string {
  const match = openAlexWorkIdPattern.exec(value);
  const recordKey = match?.[1];
  if (recordKey === undefined || !isCanonicalOpenAlexRecordKey(recordKey)) {
    throw invalidOpenAlexPayload();
  }
  return recordKey;
}

function normalizeWorkDoi(work: OpenAlexWork): string | null {
  const candidates = [work.doi, work.ids.doi]
    .filter((value): value is string => value !== null && value !== undefined)
    .map(normalizeLiteratureDoi);
  for (const candidate of candidates) {
    if (!isCanonicalLiteratureDoi(candidate)) {
      throw invalidOpenAlexPayload();
    }
  }
  const unique = [...new Set(candidates)];
  if (unique.length > 1) {
    throw invalidOpenAlexPayload();
  }
  return unique[0] ?? null;
}

function normalizeAuthors(work: OpenAlexWork): readonly LiteratureAuthorValue[] {
  return work.authorships.map(({ author }) => {
    const displayName = normalizeLiteratureText(author.display_name);
    const orcid = author.orcid === null ? null : orcidPattern.exec(author.orcid)?.[1] ?? null;
    if (displayName.length === 0 || (author.orcid !== null && orcid === null)) {
      throw invalidOpenAlexPayload();
    }
    return {
      displayName,
      ...(orcid === null ? {} : { orcid })
    };
  });
}

function normalizeIdentifiers(
  work: OpenAlexWork,
  recordKey: string,
  doi: string | null,
  source: OpenAlexSource
): readonly LiteratureIdentifierValue[] {
  const identifiers: LiteratureIdentifierValue[] = [
    { scheme: "openalex", value: recordKey }
  ];
  if (doi !== null) {
    identifiers.push({ scheme: "doi", value: doi });
  }
  const pmid = optionalExternalId(
    work.ids.pmid,
    pmidPatterns,
    isCanonicalPubmedRecordKey
  );
  const pmcid = optionalExternalId(
    work.ids.pmcid,
    pmcidPatterns,
    isCanonicalPmcRecordKey
  );
  if (pmid !== null) {
    identifiers.push({ scheme: "pmid", value: pmid });
  }
  if (pmcid !== null) {
    identifiers.push({ scheme: "pmcid", value: pmcid });
  }
  for (const issn of new Set([
    ...(source?.issn_l === null || source?.issn_l === undefined ? [] : [source.issn_l]),
    ...(source?.issn ?? [])
  ])) {
    identifiers.push({ scheme: "issn", value: issn.toUpperCase() });
  }
  return identifiers.sort((left, right) =>
    left.scheme.localeCompare(right.scheme) || left.value.localeCompare(right.value)
  );
}

function optionalExternalId(
  value: string | null | undefined,
  patterns: readonly RegExp[],
  isCanonical: (recordKey: string) => boolean
): string | null {
  if (value === null || value === undefined) {
    return null;
  }
  for (const pattern of patterns) {
    const normalized = pattern.exec(value)?.[1];
    if (normalized !== undefined && isCanonical(normalized)) {
      return normalized;
    }
  }
  throw invalidOpenAlexPayload();
}

function reconstructOpenAlexAbstract(
  invertedIndex: OpenAlexWork["abstract_inverted_index"]
): string | null {
  if (invertedIndex === null) {
    return null;
  }
  const tokens: string[] = [];
  let positionCount = 0;
  for (const [token, positions] of Object.entries(invertedIndex)) {
    for (const position of positions) {
      if (tokens[position] !== undefined) {
        throw invalidOpenAlexPayload();
      }
      tokens[position] = token;
      positionCount += 1;
    }
  }
  if (positionCount === 0) {
    return null;
  }
  if (tokens.length !== positionCount) {
    throw invalidOpenAlexPayload();
  }
  return tokens.join(" ");
}

function normalizeOpenAccess(work: OpenAlexWork): LiteratureOpenAccessValue {
  if (!work.open_access.is_oa) {
    return { isOpenAccess: false };
  }
  const location = work.best_oa_location ?? work.primary_location;
  const selectedUrl = location?.landing_page_url ?? location?.pdf_url ?? work.open_access.oa_url;
  const bestUrl = selectedUrl === null ? null : normalizeProviderReferenceUrl(selectedUrl);
  const license = optionalText(location?.license ?? null);
  const version = location?.version === null || location?.version === undefined
    ? null
    : versionMap[location.version];
  const hostType = location?.source === null || location?.source === undefined
    ? null
    : normalizeHostType(location.source.type);
  return {
    isOpenAccess: true,
    ...(bestUrl === null ? {} : { bestUrl }),
    ...(license === null ? {} : { license }),
    ...(version === null ? {} : { version }),
    ...(hostType === null ? {} : { hostType })
  };
}

function normalizeHostType(sourceType: string): LiteratureOpenAccessHostType {
  if (sourceType === "repository") {
    return "repository";
  }
  if (sourceType === "journal" || sourceType === "conference") {
    return "publisher";
  }
  return "other";
}

function normalizePublisher(
  source: OpenAlexSource
): LiteraturePublisherValue | null {
  const name = optionalText(source?.host_organization_name ?? null);
  const rawLandingPageUrl = source?.host_organization ?? null;
  const landingPageUrl = rawLandingPageUrl === null
    ? null
    : normalizeProviderReferenceUrl(rawLandingPageUrl);
  if (name !== null && landingPageUrl !== null) {
    return { name, landingPageUrl };
  }
  if (name !== null) {
    return { name };
  }
  return landingPageUrl === null ? null : { landingPageUrl };
}

function optionalText(value: string | null): string | null {
  if (value === null) {
    return null;
  }
  const normalized = normalizeLiteratureText(value);
  return normalized.length === 0 ? null : normalized;
}

function invalidOpenAlexPayload(): LiteraturePayloadError {
  return new LiteraturePayloadError("invalid_response");
}
