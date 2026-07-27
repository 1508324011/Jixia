import { describe, expect, it } from "vitest";

import { projectLiteratureHistory } from "./literature.history-projection.js";
import {
  historyLiteratureId,
  historyProviderRecords,
  storedHistoryAssertion
} from "./literature.history.test-fixture.js";
import { LiteratureProjectionError } from "./literature.projection.js";
import type { StoredCanonicalLiteratureAssertion } from "./literature.stored-assertion.js";

function completeHistory(): StoredCanonicalLiteratureAssertion[] {
  return [
    storedHistoryAssertion({ id: "title-1", ordinal: 1, assertion: { kind: "title", value: "Old title" } }),
    storedHistoryAssertion({
      id: "title-2",
      ordinal: 2,
      providerRecordId: "provider-2",
      assertion: { kind: "title", value: "Old title" }
    }),
    storedHistoryAssertion({ id: "title-3", ordinal: 3, assertion: { kind: "title", value: "Current title" } }),
    storedHistoryAssertion({ id: "abstract-1", ordinal: 4, assertion: { kind: "abstract", value: "Abstract" } }),
    storedHistoryAssertion({ id: "year-1", ordinal: 5, assertion: { kind: "publicationYear", value: 2026 } }),
    storedHistoryAssertion({ id: "doi-1", ordinal: 6, assertion: { kind: "doi", value: "10.1000/history" } }),
    storedHistoryAssertion({ id: "date-1", ordinal: 7, assertion: { kind: "publicationDate", value: "2026-07" } }),
    storedHistoryAssertion({ id: "venue-1", ordinal: 8, assertion: { kind: "venue", value: "Jixia Journal" } }),
    storedHistoryAssertion({ id: "type-1", ordinal: 9, assertion: { kind: "publicationType", value: "journal-article" } }),
    storedHistoryAssertion({
      id: "authors-1",
      ordinal: 10,
      assertion: {
        kind: "authors",
        value: [{ displayName: "Ada Lovelace", orcid: "0000-0001-2345-678X" }]
      }
    }),
    storedHistoryAssertion({
      id: "authors-2",
      ordinal: 11,
      providerRecordId: "provider-2",
      assertion: {
        kind: "authors",
        value: [{ displayName: "Ada Lovelace", orcid: "0000-0001-2345-678X" }]
      }
    }),
    storedHistoryAssertion({
      id: "identifiers-1",
      ordinal: 12,
      assertion: {
        kind: "identifiers",
        value: [
          { scheme: "doi", value: "10.1000/history" },
          { scheme: "pmid", value: "12345678" }
        ]
      }
    }),
    storedHistoryAssertion({
      id: "oa-1",
      ordinal: 13,
      assertion: {
        kind: "openAccess",
        value: {
          isOpenAccess: true,
          bestUrl: "https://example.test/article",
          license: "cc-by",
          version: "published",
          hostType: "publisher"
        }
      }
    }),
    storedHistoryAssertion({
      id: "publisher-1",
      ordinal: 14,
      assertion: {
        kind: "publisher",
        value: { name: "Jixia Press", landingPageUrl: "https://example.test" }
      }
    })
  ];
}

function project(assertions: readonly StoredCanonicalLiteratureAssertion[]) {
  return projectLiteratureHistory({
    literatureId: historyLiteratureId,
    providerRecords: historyProviderRecords,
    assertions
  });
}

describe("complete literature history projection", () => {
  it("decodes all eleven kinds and treats equal observations as corroboration", () => {
    const result = project(completeHistory());

    expect(result.assertions).toHaveLength(14);
    expect(result.assertions.map((assertion) => assertion.kind)).toContain("publisher");
    expect(result.projection.title.current?.value).toBe("Current title");
    expect(result.projection.title.conflicts.map((assertion) => assertion.value)).toEqual([
      "Old title",
      "Old title"
    ]);
    expect(result.projection.abstract.current?.value).toBe("Abstract");
    expect(result.projection.publicationYear.current?.value).toBe(2026);
    expect(result.projection.doi.current?.value).toBe("10.1000/history");
    expect(result.projection.publicationDate.current?.value).toBe("2026-07");
    expect(result.projection.venue.current?.value).toBe("Jixia Journal");
    expect(result.projection.publicationType.current?.value).toBe("journal-article");
    expect(result.projection.authors.current?.value).toEqual([
      { displayName: "Ada Lovelace", orcid: "0000-0001-2345-678X" }
    ]);
    expect(result.projection.authors.history).toHaveLength(2);
    expect(result.projection.authors.conflicts).toEqual([]);
    expect(result.projection.identifiers.current?.value).toEqual([
      { scheme: "doi", value: "10.1000/history" },
      { scheme: "pmid", value: "12345678" }
    ]);
    expect(result.projection.openAccess.current?.value).toEqual({
      isOpenAccess: true,
      bestUrl: "https://example.test/article",
      license: "cc-by",
      version: "published",
      hostType: "publisher"
    });
    expect(result.projection.publisher.current?.value).toEqual({
      name: "Jixia Press",
      landingPageUrl: "https://example.test"
    });
    expect(result.conflictKinds).toEqual(["title"]);
  });

  it.each([
    ["duplicate ordinal", (assertion: StoredCanonicalLiteratureAssertion) => ({ ...assertion, ordinal: 1 })],
    ["wrong literature", (assertion: StoredCanonicalLiteratureAssertion) => ({ ...assertion, literatureId: "other" })],
    ["unknown provider", (assertion: StoredCanonicalLiteratureAssertion) => ({ ...assertion, providerRecordId: "missing" })],
    ["wrong item count", (assertion: StoredCanonicalLiteratureAssertion) => ({ ...assertion, structuredItemCount: 2 })],
    ["wrong fingerprint", (assertion: StoredCanonicalLiteratureAssertion) => ({ ...assertion, valueFingerprint: "0".repeat(64) })],
    ["position gap", (assertion: StoredCanonicalLiteratureAssertion) => ({
      ...assertion,
      authors: assertion.authors.map((author) => ({ ...author, position: 1 }))
    })]
  ])("rejects a persisted %s", (_label, corrupt) => {
    const title = storedHistoryAssertion({
      id: "title",
      ordinal: 1,
      assertion: { kind: "title", value: "Title" }
    });
    const authors = storedHistoryAssertion({
      id: "authors",
      ordinal: 2,
      assertion: { kind: "authors", value: [{ displayName: "Ada Lovelace" }] }
    });
    const target = _label === "duplicate ordinal" ? title : authors;
    const assertions = target === title ? [title, corrupt(authors)] : [title, corrupt(authors)];

    expect(() => project(assertions)).toThrow(LiteratureProjectionError);
  });

  it.each([
    ["first ordinal greater than one", 2, 3],
    ["gap between ordinals", 1, 3]
  ])("rejects a persisted %s", (_label, firstOrdinal, secondOrdinal) => {
    const assertions = [
      storedHistoryAssertion({
        id: "title",
        ordinal: firstOrdinal,
        assertion: { kind: "title", value: "Title" }
      }),
      storedHistoryAssertion({
        id: "abstract",
        ordinal: secondOrdinal,
        assertion: { kind: "abstract", value: "Abstract" }
      })
    ];

    expect(() => project(assertions)).toThrow(LiteratureProjectionError);
  });
});
