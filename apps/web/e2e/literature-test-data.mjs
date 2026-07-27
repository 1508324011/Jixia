const createdAt = "2026-07-20T08:00:00.000Z";
const canonicalDoi = "10.1000/alpha";

const sourceMatches = [
  { providerKey: "pubmed", recordKey: "98765432", providerRank: 1 },
  { providerKey: "openalex", recordKey: "WALPHA", providerRank: 2 },
  { providerKey: "crossref", recordKey: canonicalDoi, providerRank: 3 }
];

const leaseRecoverySourceMatches = [
  { providerKey: "crossref", recordKey: "lease-expired", providerRank: 1 },
  { providerKey: "pubmed", recordKey: "98765432", providerRank: 2 },
  { providerKey: "openalex", recordKey: "WALPHA", providerRank: 3 }
];

const authors = [
  { displayName: "Lin Qiao", orcid: "0000-0002-1825-0097" },
  { displayName: "Mira Chen" }
];

const openAccess = {
  isOpenAccess: true,
  bestUrl: "https://example.test/task25/open",
  license: "CC BY 4.0",
  version: "published",
  hostType: "publisher"
};

const publisher = {
  name: "Jixia Evidence Press",
  landingPageUrl: "https://example.test/task25"
};

export function literatureSearchFixture(query = "") {
  const isLeaseRecovery = query.trim().toLowerCase() === "lease recovery";
  const title = isLeaseRecovery ? "Lease recovery evidence" : "Glioblastoma evidence synthesis";
  return {
    candidates: [{
      title,
      abstract: "A deterministic multi-provider evidence record for browser verification.",
      publicationYear: 2026,
      publicationDate: "2026-07-20",
      venue: "Journal of Reproducible Evidence",
      publicationType: "journal-article",
      doi: canonicalDoi,
      authors,
      identifiers: [
        { scheme: "doi", value: canonicalDoi },
        { scheme: "pmid", value: "98765432" }
      ],
      openAccess,
      publisher,
      sourceMatches: isLeaseRecovery ? leaseRecoverySourceMatches : sourceMatches
    }],
    providerStatuses: [
      { providerKey: "openalex", status: "succeeded", resultCount: 1 },
      { providerKey: "crossref", status: "rate_limited", retryAfterSeconds: 30 },
      { providerKey: "pubmed", status: "succeeded", resultCount: 1 }
    ],
    nextCursor: null
  };
}

export function importedLiteratureFixture({ createdByUserId, id, scope, title }) {
  const recordIds = {
    openalex: `${id}-openalex`,
    crossref: `${id}-crossref`,
    pubmed: `${id}-pubmed`
  };
  const providerRecords = sourceMatches.map((source) => ({
    id: recordIds[source.providerKey],
    literatureId: id,
    providerKey: source.providerKey,
    recordKey: source.recordKey,
    createdByUserId,
    createdAt
  }));
  const projection = {
    title: projected(recordIds.openalex, "title", title),
    abstract: projected(recordIds.pubmed, "abstract", "A deterministic server-provided abstract."),
    publicationYear: projected(recordIds.crossref, "year", 2026),
    doi: {
      current: provenance(recordIds.crossref, "doi-current", 4, canonicalDoi),
      history: [provenance(recordIds.openalex, "doi-history", 5, canonicalDoi)],
      conflicts: [provenance(recordIds.pubmed, "doi-conflict", 6, "10.9999/conflicting-task25")]
    },
    publicationDate: projected(recordIds.crossref, "date", "2026-07-20"),
    venue: projected(recordIds.openalex, "venue", "Journal of Reproducible Evidence"),
    publicationType: projected(recordIds.crossref, "type", "journal-article"),
    authors: projected(recordIds.openalex, "authors", authors),
    identifiers: projected(recordIds.pubmed, "identifiers", [
      { scheme: "doi", value: canonicalDoi },
      { scheme: "pmid", value: "98765432" }
    ]),
    openAccess: projected(recordIds.openalex, "open-access", openAccess),
    publisher: projected(recordIds.crossref, "publisher", publisher)
  };
  const assertions = [
    assertion(recordIds.openalex, 1, "title", title),
    assertion(recordIds.pubmed, 2, "abstract", "A deterministic server-provided abstract."),
    assertion(recordIds.crossref, 3, "doi", canonicalDoi),
    assertion(recordIds.crossref, 4, "publicationDate", "2026-07-20"),
    assertion(recordIds.openalex, 5, "venue", "Journal of Reproducible Evidence"),
    assertion(recordIds.crossref, 6, "publicationType", "journal-article"),
    assertion(recordIds.crossref, 7, "publicationYear", 2026),
    assertion(recordIds.openalex, 8, "authors", authors),
    assertion(recordIds.pubmed, 9, "identifiers", [
      { scheme: "doi", value: canonicalDoi },
      { scheme: "pmid", value: "98765432" }
    ]),
    assertion(recordIds.openalex, 10, "openAccess", openAccess),
    assertion(recordIds.crossref, 11, "publisher", publisher)
  ];
  const literature = { id, scope, createdByUserId, createdAt };
  const summary = {
    id,
    scope,
    title,
    authors,
    publicationYear: 2026,
    publicationDate: "2026-07-20",
    venue: "Journal of Reproducible Evidence",
    doi: canonicalDoi,
    openAccess,
    publisher,
    provenanceCount: providerRecords.length,
    conflictKinds: ["doi"],
    createdAt,
    updatedAt: createdAt
  };

  return {
    detail: {
      literature,
      providerRecords,
      projection,
      conflictKinds: ["doi"],
      assertions
    },
    summary
  };
}

function projected(providerRecordId, name, value) {
  return {
    current: provenance(providerRecordId, `${name}-current`, 1, value),
    history: [],
    conflicts: []
  };
}

function provenance(providerRecordId, assertionId, ordinal, value) {
  return { assertionId, providerRecordId, ordinal, value };
}

function assertion(providerRecordId, ordinal, kind, value) {
  return { assertionId: `history-${kind}`, providerRecordId, ordinal, kind, value };
}
