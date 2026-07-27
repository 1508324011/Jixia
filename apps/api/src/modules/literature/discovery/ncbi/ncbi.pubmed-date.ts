import { isCanonicalLiteraturePublicationYear } from "../../literature.normalization.js";
import { LiteraturePayloadError } from "../provider-errors.js";
import type {
  PubMedFetchArticle,
  PubMedXmlDate
} from "./ncbi.schema.js";

export type PubMedDate = {
  readonly publicationYear: number;
  readonly publicationDate: string;
};

const monthNumbers: Readonly<Record<string, number>> = {
  jan: 1,
  feb: 2,
  mar: 3,
  apr: 4,
  may: 5,
  jun: 6,
  jul: 7,
  aug: 8,
  sep: 9,
  oct: 10,
  nov: 11,
  dec: 12
};

export function normalizePubMedSummaryDate(value: string): PubMedDate {
  const match = /^(\d{4})\/(\d{2})\/(\d{2})(?:\s|$)/u.exec(value);
  if (match === null) {
    throw invalidDate();
  }
  return dateFromParts(match[1], match[2], match[3]);
}

export function normalizePubMedFetchDate(
  article: PubMedFetchArticle
): PubMedDate | null {
  const articleDates = article.MedlineCitation.Article.ArticleDate ?? [];
  const firstArticleDate = articleDates[0];
  if (firstArticleDate !== undefined) {
    return normalizeXmlDate(firstArticleDate);
  }
  return normalizeXmlDate(
    article.MedlineCitation.Article.Journal.JournalIssue.PubDate
  );
}

function normalizeXmlDate(value: PubMedXmlDate): PubMedDate | null {
  if (value.Year !== undefined) {
    return dateFromParts(value.Year, value.Month, value.Day);
  }
  if (value.MedlineDate === undefined) {
    return null;
  }
  const year = /^(\d{4})(?:\D|$)/u.exec(value.MedlineDate)?.[1];
  if (year === undefined) {
    throw invalidDate();
  }
  return dateFromParts(year);
}

function dateFromParts(
  yearText: string | undefined,
  monthText?: string,
  dayText?: string
): PubMedDate {
  const year = parseInteger(yearText, 0, 9_999);
  if (!isCanonicalLiteraturePublicationYear(year)) {
    throw invalidDate();
  }
  const yearValue = String(year).padStart(4, "0");
  if (monthText === undefined) {
    if (dayText !== undefined) {
      throw invalidDate();
    }
    return { publicationYear: year, publicationDate: yearValue };
  }
  const month = parseMonth(monthText);
  const yearMonth = `${yearValue}-${String(month).padStart(2, "0")}`;
  if (dayText === undefined) {
    return { publicationYear: year, publicationDate: yearMonth };
  }
  const day = parseInteger(dayText, 1, maximumDayInMonth(year, month));
  return {
    publicationYear: year,
    publicationDate: `${yearMonth}-${String(day).padStart(2, "0")}`
  };
}

function parseMonth(value: string): number {
  if (/^\d{1,2}$/u.test(value)) {
    return parseInteger(value, 1, 12);
  }
  const month = monthNumbers[value.slice(0, 3).toLowerCase()];
  if (month === undefined) {
    throw invalidDate();
  }
  return month;
}

function parseInteger(
  value: string | undefined,
  minimum: number,
  maximum: number
): number {
  if (value === undefined || !/^\d+$/u.test(value)) {
    throw invalidDate();
  }
  const parsed = Number(value);
  if (!Number.isSafeInteger(parsed) || parsed < minimum || parsed > maximum) {
    throw invalidDate();
  }
  return parsed;
}

function maximumDayInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

function invalidDate(): LiteraturePayloadError {
  return new LiteraturePayloadError("invalid_response");
}
