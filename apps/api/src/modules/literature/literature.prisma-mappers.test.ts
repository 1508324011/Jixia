import { describe, expect, it } from "vitest";

import {
  appendAssertionsAuditMetadata,
  createLiteratureAuditMetadata,
  toAssertionCreateData
} from "./literature.prisma-mappers.js";

describe("literature Prisma mapping", () => {
  it("builds an allowlisted personal creation audit payload", () => {
    const metadata = createLiteratureAuditMetadata({
      literatureId: "literature-1",
      scope: { kind: "personal", ownerUserId: "user-1" }
    });

    expect(metadata).toEqual({
      literatureId: "literature-1",
      scopeKind: "personal",
      ownerUserId: "user-1"
    });
  });

  it("builds an allowlisted project creation audit payload", () => {
    const metadata = createLiteratureAuditMetadata({
      literatureId: "literature-1",
      scope: { kind: "project", projectId: "project-1" }
    });

    expect(metadata).toEqual({
      literatureId: "literature-1",
      scopeKind: "project",
      projectId: "project-1"
    });
  });

  it("builds append audit metadata without asserted values or provider identity", () => {
    const metadata = appendAssertionsAuditMetadata({
      literatureId: "literature-1",
      providerRecordId: "provider-record-1",
      assertionKinds: ["title", "doi"],
      firstOrdinal: 3
    });

    expect(metadata).toEqual({
      literatureId: "literature-1",
      providerRecordId: "provider-record-1",
      assertionCount: 2,
      assertionKinds: ["title", "doi"],
      firstOrdinal: 3,
      lastOrdinal: 4
    });
  });

  it("maps typed assertions to mutually exclusive persistence columns", () => {
    const common = {
      literatureId: "literature-1",
      providerRecordId: "provider-record-1",
      createdByUserId: "user-1"
    };

    expect(
      toAssertionCreateData({
        ...common,
        ordinal: 1,
        assertion: { kind: "title", value: "A title" }
      })
    ).toEqual({
      ...common,
      ordinal: 1,
      kind: "title",
      textValue: "A title",
      integerValue: null
    });
    expect(
      toAssertionCreateData({
        ...common,
        ordinal: 2,
        assertion: { kind: "publicationYear", value: 2026 }
      })
    ).toEqual({
      ...common,
      ordinal: 2,
      kind: "publicationYear",
      textValue: null,
      integerValue: 2026
    });
  });
});
