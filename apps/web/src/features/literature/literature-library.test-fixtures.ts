import type { GetLiteratureResponse, ListLiteratureResponse, LiteratureSummaryDTO } from "@jixia/shared";

export const personalSummary = {
  id: "literature-personal-1",
  scope: { kind: "personal", ownerUserId: "user-1" },
  title: "Evidence synthesis for chronic pain",
  authors: [{ displayName: "Ada Lovelace", orcid: "0000-0001-0000-0001" }],
  publicationYear: 2026,
  publicationDate: "2026-06-18",
  venue: "Jixia Journal",
  doi: "10.1000/evidence-synthesis",
  openAccess: {
    isOpenAccess: true,
    bestUrl: "https://example.test/open/evidence-synthesis",
    license: "CC BY 4.0",
    version: "published",
    hostType: "publisher"
  },
  publisher: { name: "Jixia Press", landingPageUrl: "https://example.test/jixia-press" },
  provenanceCount: 2,
  conflictKinds: ["doi"],
  createdAt: "2026-06-18T10:00:00.000Z",
  updatedAt: "2026-06-18T10:10:00.000Z"
} satisfies LiteratureSummaryDTO;

export const secondPersonalSummary = {
  ...personalSummary,
  id: "literature-personal-2",
  title: "Second page evidence record",
  doi: "10.1000/second-page"
} satisfies LiteratureSummaryDTO;

export const projectSummary = {
  ...personalSummary,
  id: "literature-project-1",
  scope: { kind: "project", projectId: "project-2" },
  title: "Project-only evidence record"
} satisfies LiteratureSummaryDTO;

export const literatureDetail = {
  literature: {
    id: personalSummary.id,
    scope: personalSummary.scope,
    createdByUserId: "user-1",
    createdAt: personalSummary.createdAt
  },
  providerRecords: [
    {
      id: "provider-record-openalex",
      literatureId: personalSummary.id,
      providerKey: "openalex",
      recordKey: "W1234567890",
      createdByUserId: "user-1",
      createdAt: personalSummary.createdAt
    },
    {
      id: "provider-record-crossref",
      literatureId: personalSummary.id,
      providerKey: "crossref",
      recordKey: "10.1000/crossref-record",
      createdByUserId: "user-1",
      createdAt: personalSummary.createdAt
    }
  ],
  projection: {
    title: {
      current: { assertionId: "title-current", providerRecordId: "provider-record-crossref", ordinal: 2, value: personalSummary.title ?? "" },
      history: [{ assertionId: "title-openalex", providerRecordId: "provider-record-openalex", ordinal: 1, value: "Evidence synthesis for persistent pain" }],
      conflicts: []
    },
    abstract: {
      current: { assertionId: "abstract-current", providerRecordId: "provider-record-crossref", ordinal: 3, value: "A server-provided abstract." },
      history: [],
      conflicts: []
    },
    publicationYear: {
      current: { assertionId: "year-current", providerRecordId: "provider-record-crossref", ordinal: 4, value: 2026 },
      history: [],
      conflicts: []
    },
    doi: {
      current: { assertionId: "doi-current", providerRecordId: "provider-record-crossref", ordinal: 5, value: "10.1000/evidence-synthesis" },
      history: [{ assertionId: "doi-history", providerRecordId: "provider-record-openalex", ordinal: 6, value: "10.1000/evidence-synthesis" }],
      conflicts: [{ assertionId: "doi-conflict", providerRecordId: "provider-record-openalex", ordinal: 7, value: "10.1000/conflicting-doi" }]
    },
    publicationDate: {
      current: { assertionId: "date-current", providerRecordId: "provider-record-crossref", ordinal: 8, value: "2026-06-18" },
      history: [],
      conflicts: []
    },
    venue: {
      current: { assertionId: "venue-current", providerRecordId: "provider-record-crossref", ordinal: 9, value: "Jixia Journal" },
      history: [],
      conflicts: []
    },
    publicationType: {
      current: { assertionId: "type-current", providerRecordId: "provider-record-crossref", ordinal: 10, value: "journal-article" },
      history: [],
      conflicts: []
    },
    authors: {
      current: { assertionId: "authors-current", providerRecordId: "provider-record-openalex", ordinal: 11, value: personalSummary.authors },
      history: [],
      conflicts: []
    },
    identifiers: {
      current: {
        assertionId: "identifiers-current",
        providerRecordId: "provider-record-openalex",
        ordinal: 12,
        value: [
          { scheme: "doi", value: "10.1000/evidence-synthesis" },
          { scheme: "pmid", value: "12345678" }
        ]
      },
      history: [],
      conflicts: []
    },
    openAccess: {
      current: { assertionId: "open-access-current", providerRecordId: "provider-record-openalex", ordinal: 13, value: personalSummary.openAccess ?? { isOpenAccess: false } },
      history: [],
      conflicts: [{
        assertionId: "open-access-conflict",
        providerRecordId: "provider-record-crossref",
        ordinal: 14,
        value: {
          isOpenAccess: true,
          bestUrl: "https://example.test/open/evidence-synthesis",
          license: "CC BY-NC 4.0",
          version: "accepted",
          hostType: "repository"
        }
      }]
    },
    publisher: {
      current: { assertionId: "publisher-current", providerRecordId: "provider-record-crossref", ordinal: 15, value: personalSummary.publisher ?? { name: "" } },
      history: [],
      conflicts: []
    }
  },
  conflictKinds: ["doi", "openAccess"],
  assertions: [
    { assertionId: "history-title", providerRecordId: "provider-record-openalex", ordinal: 1, kind: "title", value: "Evidence synthesis for persistent pain" },
    { assertionId: "history-abstract", providerRecordId: "provider-record-crossref", ordinal: 2, kind: "abstract", value: "A server-provided abstract." },
    { assertionId: "history-doi", providerRecordId: "provider-record-crossref", ordinal: 3, kind: "doi", value: "10.1000/evidence-synthesis" },
    { assertionId: "history-date", providerRecordId: "provider-record-crossref", ordinal: 4, kind: "publicationDate", value: "2026-06-18" },
    { assertionId: "history-venue", providerRecordId: "provider-record-crossref", ordinal: 5, kind: "venue", value: "Jixia Journal" },
    { assertionId: "history-type", providerRecordId: "provider-record-crossref", ordinal: 6, kind: "publicationType", value: "journal-article" },
    { assertionId: "history-year", providerRecordId: "provider-record-crossref", ordinal: 7, kind: "publicationYear", value: 2026 },
    { assertionId: "history-authors", providerRecordId: "provider-record-openalex", ordinal: 8, kind: "authors", value: personalSummary.authors },
    { assertionId: "history-identifiers", providerRecordId: "provider-record-openalex", ordinal: 9, kind: "identifiers", value: [{ scheme: "doi", value: "10.1000/evidence-synthesis" }, { scheme: "pmid", value: "12345678" }] },
    { assertionId: "history-open-access", providerRecordId: "provider-record-openalex", ordinal: 10, kind: "openAccess", value: personalSummary.openAccess ?? { isOpenAccess: false } },
    { assertionId: "history-publisher", providerRecordId: "provider-record-crossref", ordinal: 11, kind: "publisher", value: personalSummary.publisher ?? { name: "" } }
  ]
} satisfies GetLiteratureResponse;

export function listResponse(literature: readonly LiteratureSummaryDTO[], nextCursor: string | null = null): ListLiteratureResponse {
  return { literature, nextCursor };
}

export function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    status,
    headers: { "Content-Type": "application/json" }
  });
}

export function deferred<T>(): { readonly promise: Promise<T>; readonly resolve: (value: T) => void } {
  let resolve = (_value: T): void => {
    throw new Error("Deferred promise resolver unavailable.");
  };
  const promise = new Promise<T>((fulfill) => {
    resolve = fulfill;
  });
  return { promise, resolve };
}
