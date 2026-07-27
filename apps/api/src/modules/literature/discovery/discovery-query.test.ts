import { describe, expect, it } from "vitest";

import { normalizeLiteratureDiscoveryQuery } from "./discovery-query.js";

describe("literature discovery query normalization", () => {
  it("normalizes compatibility characters and collapses internal whitespace", () => {
    // Given
    const query = " \uFF27\uFF4C\uFF49\uFF4F\uFF42\uFF4C\uFF41\uFF53\uFF54\uFF4F\uFF4D\uFF41\t\n  therapy ";

    // When
    const normalized = normalizeLiteratureDiscoveryQuery(query);

    // Then
    expect(normalized).toBe("Glioblastoma therapy");
  });

  it("keeps canonical glioblastoma unchanged", () => {
    // Given
    const query = "glioblastoma";

    // When
    const normalized = normalizeLiteratureDiscoveryQuery(query);

    // Then
    expect(normalized).toBe(query);
  });
});
