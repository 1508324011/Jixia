const canonicalDoiPattern = /^10\.\d{4,9}\/[-._;()/:a-z0-9]+$/u;
const canonicalPublicationDatePattern = /^(\d{4})(?:-(\d{2})(?:-(\d{2}))?)?$/u;

export function normalizeLiteratureText(value: string): string {
  return value.trim().replace(/\s+/gu, " ");
}

export function normalizeLiteratureDoi(value: string): string {
  return normalizeLiteratureText(value)
    .toLowerCase()
    .replace(/^doi:\s*/u, "")
    .replace(/^https?:\/\/(?:dx\.)?doi\.org\//u, "");
}

export function isCanonicalLiteratureDoi(value: string): boolean {
  return normalizeLiteratureDoi(value) === value && canonicalDoiPattern.test(value);
}

export function isCanonicalLiteraturePublicationYear(value: number): boolean {
  return Number.isInteger(value) && value >= 1000 && value <= 9999;
}

export function isCanonicalLiteraturePublicationDate(value: string): boolean {
  const match = canonicalPublicationDatePattern.exec(value);
  if (match === null) {
    return false;
  }
  const yearText = match[1];
  if (yearText === undefined) {
    return false;
  }
  const year = Number(yearText);
  if (!isCanonicalLiteraturePublicationYear(year)) {
    return false;
  }
  const monthText = match[2];
  if (monthText === undefined) {
    return true;
  }
  const month = Number(monthText);
  if (month < 1 || month > 12) {
    return false;
  }
  const dayText = match[3];
  if (dayText === undefined) {
    return true;
  }
  const day = Number(dayText);
  const date = new Date(Date.UTC(year, month - 1, day));
  return date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day;
}

export function isCanonicalLiteraturePublicationChronology(
  publicationYear: number | null,
  publicationDate: string | null
): boolean {
  if (
    (publicationYear !== null && !isCanonicalLiteraturePublicationYear(publicationYear)) ||
    (publicationDate !== null && !isCanonicalLiteraturePublicationDate(publicationDate))
  ) {
    return false;
  }
  return publicationYear === null || publicationDate === null ||
    Number(publicationDate.slice(0, 4)) === publicationYear;
}
