import { describe, expect, it } from "vitest";

import {
  canonicalImportAssertionsEqual,
  fingerprintStructuredImportAssertion,
  prepareProviderAssertionBatch
} from "./literature.import-assertions.js";

describe("literature import assertion values", () => {
  it("computes the canonical SHA-256 fingerprint for ordered authors", () => {
    // Given
    const assertion = {
      kind: "authors",
      value: [
        { displayName: "Ada Lovelace", orcid: "0000-0000-0000-0001" },
        { displayName: "Grace Hopper" }
      ]
    } as const;
    // When
    const fingerprint = fingerprintStructuredImportAssertion(assertion);

    // Then
    expect(fingerprint).toBe("1e832a7b485ee6eb9017889ac2a09f784bf31cf846dd4902318fc2720f5e2efa");
  });

  it("normalizes identifiers before persistence and exact comparison", () => {
    // Given
    const batch = {
      source: { providerKey: "openalex", recordKey: "W1" },
      assertions: [
        {
          kind: "identifiers",
          value: [
            { scheme: "pmid", value: "2" },
            { scheme: "doi", value: "10.1000/alpha" },
            { scheme: "pmid", value: "2" }
          ]
        }
      ]
    } as const;

    // When
    const prepared = prepareProviderAssertionBatch(batch);

    // Then
    expect(prepared.assertions).toEqual([
      {
        kind: "identifiers",
        value: [
          { scheme: "doi", value: "10.1000/alpha" },
          { scheme: "pmid", value: "2" }
        ]
      }
    ]);
    expect(
      canonicalImportAssertionsEqual(prepared.assertions[0] ?? batch.assertions[0], {
        kind: "identifiers",
        value: [
          { scheme: "doi", value: "10.1000/alpha" },
          { scheme: "pmid", value: "2" }
        ]
      })
    ).toBe(true);
  });

  it.each(["2026", "2026-07", "2026-07-20"])(
    "preserves a canonical publication date with provider precision: %s",
    (value) => {
      // Given
      const batch = {
        source: { providerKey: "crossref", recordKey: "10.1000/date" },
        assertions: [{ kind: "publicationDate", value }]
      } as const;

      // When
      const prepared = prepareProviderAssertionBatch(batch);

      // Then
      expect(prepared.assertions).toEqual([{ kind: "publicationDate", value }]);
    }
  );

  it.each([
    "0999",
    "10000",
    "2026-00",
    "2026-13",
    "2026-02-30",
    "2026-7",
    "2026-07-2"
  ])("rejects an invalid canonical publication date before persistence: %s", (value) => {
    // Given
    const batch = {
      source: { providerKey: "pubmed", recordKey: "12345678" },
      assertions: [{ kind: "publicationDate", value }]
    } as const;

    // When
    const prepare = () => prepareProviderAssertionBatch(batch);

    // Then
    expect(prepare).toThrow(expect.objectContaining({ code: "invalid_batch" }));
  });

  it.each([1000, 2026, 9999])(
    "accepts a canonical publication year before persistence: %s",
    (value) => {
      // Given
      const batch = {
        source: { providerKey: "openalex", recordKey: "W-year" },
        assertions: [{ kind: "publicationYear", value }]
      } as const;

      // When
      const prepared = prepareProviderAssertionBatch(batch);

      // Then
      expect(prepared.assertions).toEqual([{ kind: "publicationYear", value }]);
    }
  );

  it.each([0, 999, 10000, -1])(
    "rejects a non-canonical publication year before persistence: %s",
    (value) => {
      // Given
      const batch = {
        source: { providerKey: "openalex", recordKey: "W-invalid-year" },
        assertions: [{ kind: "publicationYear", value }]
      } as const;

      // When
      const prepare = () => prepareProviderAssertionBatch(batch);

      // Then
      expect(prepare).toThrow(expect.objectContaining({ code: "invalid_batch" }));
    }
  );

  it.each([
    { publicationYear: 2026, publicationDate: "2026" },
    { publicationYear: 2026, publicationDate: "2026-07" },
    { publicationYear: 2026, publicationDate: "2026-07-20" }
  ])("accepts matching publication year and date precision: $publicationDate", (values) => {
    // Given
    const batch = {
      source: { providerKey: "crossref", recordKey: "10.1000/year-date" },
      assertions: [
        { kind: "publicationYear", value: values.publicationYear },
        { kind: "publicationDate", value: values.publicationDate }
      ]
    } as const;

    // When
    const prepared = prepareProviderAssertionBatch(batch);

    // Then
    expect(prepared.assertions).toEqual(batch.assertions);
  });

  it("rejects a publication year and date with different years before persistence", () => {
    // Given
    const batch = {
      source: { providerKey: "crossref", recordKey: "10.1000/mismatched-year" },
      assertions: [
        { kind: "publicationYear", value: 2025 },
        { kind: "publicationDate", value: "2024-03-01" }
      ]
    } as const;

    // When
    const prepare = () => prepareProviderAssertionBatch(batch);

    // Then
    expect(prepare).toThrow(expect.objectContaining({ code: "invalid_batch" }));
  });

  it("preserves repeated equal batches but rejects duplicate kinds within one provider batch", () => {
    // Given
    const repeatedTitleBatch = {
      source: { providerKey: "crossref", recordKey: "10.1000/alpha" },
      assertions: [
        { kind: "title", value: "A title" },
        { kind: "title", value: "A title" }
      ]
    } as const;

    // When
    const prepare = () => prepareProviderAssertionBatch(repeatedTitleBatch);

    // Then
    expect(prepare).toThrow(expect.objectContaining({ code: "invalid_batch" }));
    expect(
      canonicalImportAssertionsEqual(
        { kind: "authors", value: [{ displayName: "A" }, { displayName: "B" }] },
        { kind: "authors", value: [{ displayName: "B" }, { displayName: "A" }] }
      )
    ).toBe(false);
  });
});
