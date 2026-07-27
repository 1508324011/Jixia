import { describe, expect, it } from "vitest";

import {
  LiteratureProjectionError,
  replayLiteratureAssertions,
  type StoredLiteratureAssertion
} from "./literature.projection";

describe("replayLiteratureAssertions", () => {
  it("produces the same projection for every permutation of stored rows", () => {
    // Given
    const assertions: readonly StoredLiteratureAssertion[] = [
      {
        id: "assertion-title",
        providerRecordId: "provider-a",
        ordinal: 1,
        kind: "title",
        textValue: "A title",
        integerValue: null
      },
      {
        id: "assertion-year",
        providerRecordId: "provider-a",
        ordinal: 2,
        kind: "publicationYear",
        textValue: null,
        integerValue: 2025
      },
      {
        id: "assertion-doi-old",
        providerRecordId: "provider-a",
        ordinal: 3,
        kind: "doi",
        textValue: "10.1000/old",
        integerValue: null
      },
      {
        id: "assertion-doi-current",
        providerRecordId: "provider-b",
        ordinal: 4,
        kind: "doi",
        textValue: "10.1000/current",
        integerValue: null
      }
    ];
    let permutations: readonly (readonly StoredLiteratureAssertion[])[] = [[]];
    for (const assertion of assertions) {
      permutations = permutations.flatMap((permutation) =>
        Array.from({ length: permutation.length + 1 }, (_, index) => [
          ...permutation.slice(0, index),
          assertion,
          ...permutation.slice(index)
        ])
      );
    }

    // When
    const serialized = permutations.map((permutation) =>
      JSON.stringify(replayLiteratureAssertions(permutation))
    );

    // Then
    expect(new Set(serialized)).toEqual(new Set([serialized[0]]));
  });

  it("keeps complete history while separating conflicts from corroboration", () => {
    // Given
    const assertions: readonly StoredLiteratureAssertion[] = [
      {
        id: "assertion-old",
        providerRecordId: "provider-a",
        ordinal: 1,
        kind: "title",
        textValue: "Old title",
        integerValue: null
      },
      {
        id: "assertion-corroborating",
        providerRecordId: "provider-b",
        ordinal: 2,
        kind: "title",
        textValue: "Current title",
        integerValue: null
      },
      {
        id: "assertion-current",
        providerRecordId: "provider-c",
        ordinal: 3,
        kind: "title",
        textValue: "Current title",
        integerValue: null
      }
    ];

    // When
    const projection = replayLiteratureAssertions(assertions);

    // Then
    expect(projection.title).toEqual({
      current: {
        assertionId: "assertion-current",
        providerRecordId: "provider-c",
        ordinal: 3,
        value: "Current title"
      },
      history: [
        {
          assertionId: "assertion-old",
          providerRecordId: "provider-a",
          ordinal: 1,
          value: "Old title"
        },
        {
          assertionId: "assertion-corroborating",
          providerRecordId: "provider-b",
          ordinal: 2,
          value: "Current title"
        },
        {
          assertionId: "assertion-current",
          providerRecordId: "provider-c",
          ordinal: 3,
          value: "Current title"
        }
      ],
      conflicts: [
        {
          assertionId: "assertion-old",
          providerRecordId: "provider-a",
          ordinal: 1,
          value: "Old title"
        }
      ]
    });
  });

  it("rejects an impossible persisted assertion variant", () => {
    // Given
    const malformed: readonly StoredLiteratureAssertion[] = [
      {
        id: "assertion-malformed",
        providerRecordId: "provider-a",
        ordinal: 1,
        kind: "publicationYear",
        textValue: "2025",
        integerValue: null
      }
    ];

    // When
    const replay = () => replayLiteratureAssertions(malformed);

    // Then
    expect(replay).toThrow(LiteratureProjectionError);
  });

  it.each([
    ["title", "  A title"],
    ["abstract", "Abstract  with repeated whitespace"],
    ["doi", "https://doi.org/10.1000/EXAMPLE"]
  ] as const)("rejects noncanonical persisted %s values", (kind, textValue) => {
    // Given
    const malformed: readonly StoredLiteratureAssertion[] = [
      {
        id: `assertion-malformed-${kind}`,
        providerRecordId: "provider-a",
        ordinal: 1,
        kind,
        textValue,
        integerValue: null
      }
    ];

    // When
    const replay = () => replayLiteratureAssertions(malformed);

    // Then
    expect(replay).toThrow(LiteratureProjectionError);
  });
});
