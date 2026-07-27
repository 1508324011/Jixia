import type { LiteratureAuthorValue } from "@jixia/shared";

import { normalizeLiteratureText } from "../../literature.normalization.js";
import { LiteraturePayloadError } from "../provider-errors.js";
import {
  normalizePubMedFetchDate,
  normalizePubMedSummaryDate
} from "./ncbi.pubmed-date.js";
import {
  normalizePubMedIdentifiers,
  type PubMedRawIdentifier
} from "./ncbi.pubmed-identifiers.js";
import type {
  PubMedFetchArticle,
  PubMedSummaryRecord,
  PubMedXmlAuthor
} from "./ncbi.schema.js";
import type { PubMedNormalizedArticle } from "./ncbi.types.js";
import {
  normalizeNcbiXmlText,
  type PubMedOrderedText
} from "./ncbi.xml-text.js";

type XmlTextNode = string | { readonly "#text": string };
type XmlFlexibleTextNode = string | {
  readonly "#text"?: string;
  readonly "@_Label"?: string;
};

export function normalizePubMedSummary(
  record: PubMedSummaryRecord,
  expectedPmid: string
): PubMedNormalizedArticle {
  if (record.uid !== expectedPmid) {
    throw invalidPubMedRecord();
  }
  const date = normalizePubMedSummaryDate(record.sortpubdate);
  const identifiers = normalizePubMedIdentifiers({
    recordKey: expectedPmid,
    articleIds: record.articleids.map(({ idtype, value }) => ({
      kind: idtype,
      value
    })),
    issns: [record.issn, record.essn]
  });

  return {
    source: { providerKey: "pubmed", recordKey: expectedPmid },
    title: optionalText(record.title),
    abstract: null,
    publicationYear: date.publicationYear,
    publicationDate: date.publicationDate,
    venue: optionalText(record.fulljournalname) ?? optionalText(record.source),
    publicationType: joinText(record.pubtype),
    doi: identifiers.doi,
    authors: record.authors.flatMap(({ name }) => {
      const displayName = optionalText(name);
      return displayName === null ? [] : [{ displayName }];
    }),
    identifiers: identifiers.values,
    openAccess: null,
    publisher: publisherName(record.publishername)
  };
}

export function normalizePubMedFetchArticle(
  article: PubMedFetchArticle,
  expectedPmid: string,
  orderedText: PubMedOrderedText
): PubMedNormalizedArticle {
  const citationPmid = xmlText(article.MedlineCitation.PMID);
  if (citationPmid !== expectedPmid) {
    throw invalidPubMedRecord();
  }
  const publication = article.MedlineCitation.Article;
  const articleIds = article.PubmedData.ArticleIdList.ArticleId.map(
    (identifier): PubMedRawIdentifier => ({
      kind: identifier["@_IdType"],
      value: identifier["#text"]
    })
  );
  const identifiers = normalizePubMedIdentifiers({
    recordKey: expectedPmid,
    articleIds,
    issns: [
      optionalXmlText(publication.Journal.ISSN) ?? "",
      article.MedlineCitation.MedlineJournalInfo?.ISSNLinking ?? ""
    ]
  });
  const date = normalizePubMedFetchDate(article);

  return {
    source: { providerKey: "pubmed", recordKey: expectedPmid },
    title: orderedText.title,
    abstract: normalizeAbstract(publication.Abstract?.AbstractText, orderedText),
    publicationYear: date?.publicationYear ?? null,
    publicationDate: date?.publicationDate ?? null,
    venue: optionalXmlText(publication.Journal.Title),
    publicationType: normalizePublicationTypes(
      publication.PublicationTypeList?.PublicationType
    ),
    doi: identifiers.doi,
    authors: normalizeAuthors(publication.AuthorList?.Author),
    identifiers: identifiers.values,
    openAccess: null,
    publisher: null
  };
}

function normalizeAbstract(
  value: readonly XmlFlexibleTextNode[] | undefined,
  orderedText: PubMedOrderedText
): string | null {
  const nodes = value ?? [];
  if (nodes.length !== orderedText.abstractSections.length) {
    throw invalidPubMedRecord();
  }
  const sections = nodes.map((node, index) => {
    const text = orderedText.abstractSections[index];
    if (text === undefined || text.length === 0) {
      throw invalidPubMedRecord();
    }
    const label = typeof node === "string" ? null : optionalText(node["@_Label"] ?? "");
    return label === null ? text : `${label}: ${text}`;
  });
  return sections.length === 0 ? null : sections.join(" ");
}

function normalizeAuthors(
  value: readonly PubMedXmlAuthor[] | undefined
): readonly LiteratureAuthorValue[] {
  const authors: LiteratureAuthorValue[] = [];
  for (const author of value ?? []) {
    const collectiveName = optionalXmlText(author.CollectiveName);
    const personName = optionalText(
      `${optionalXmlText(author.ForeName) ?? ""} ${optionalXmlText(author.LastName) ?? ""}`
    );
    const displayName = collectiveName ?? personName;
    if (displayName === null) {
      continue;
    }
    const orcid = normalizeOrcid(author.Identifier);
    authors.push(orcid === null ? { displayName } : { displayName, orcid });
  }
  return authors;
}

function normalizeOrcid(
  value: readonly { readonly "#text": string; readonly "@_Source": string }[] | undefined
): string | null {
  for (const identifier of value ?? []) {
    if (identifier["@_Source"].toLowerCase() !== "orcid") {
      continue;
    }
    const orcid = normalizeNcbiXmlText(identifier["#text"])
      .replace(/^https?:\/\/(?:www\.)?orcid\.org\//iu, "")
      .toUpperCase();
    return /^\d{4}-\d{4}-\d{4}-\d{3}[\dX]$/u.test(orcid) ? orcid : null;
  }
  return null;
}

function normalizePublicationTypes(
  value: readonly XmlTextNode[] | undefined
): string | null {
  return joinText((value ?? []).map(xmlText));
}

function xmlText(value: XmlTextNode): string {
  return normalizeNcbiXmlText(typeof value === "string" ? value : value["#text"]);
}

function optionalXmlText(value: XmlTextNode | undefined): string | null {
  return value === undefined ? null : optionalText(xmlText(value));
}

function optionalText(value: string): string | null {
  const normalized = normalizeLiteratureText(value);
  return normalized.length === 0 ? null : normalized;
}

function joinText(values: readonly string[]): string | null {
  const normalized = values.map(optionalText).filter((value): value is string => value !== null);
  return normalized.length === 0 ? null : normalized.join("; ");
}

function publisherName(value: string): { readonly name: string } | null {
  const name = optionalText(value);
  return name === null ? null : { name };
}

function invalidPubMedRecord(): LiteraturePayloadError {
  return new LiteraturePayloadError("invalid_response");
}
