import type { LiteratureRepository, LiteratureSnapshot } from "./literature.repository.js";
import { createLiteratureService, LiteratureError } from "./literature.service.js";
import { describe, expect, it } from "vitest";

const snapshot: LiteratureSnapshot = {
  literature: {
    id: "literature-1",
    ownerUserId: "user-1",
    projectId: null,
    createdByUserId: "user-1",
    createdAt: new Date("2026-07-20T00:00:00.000Z")
  },
  providerRecords: [
    {
      id: "provider-1",
      literatureId: "literature-1",
      providerKey: "crossref",
      recordKey: "10.1000/example",
      createdByUserId: "user-1",
      createdAt: new Date("2026-07-20T00:00:01.000Z")
    }
  ],
  assertions: [
    {
      id: "assertion-1",
      literatureId: "literature-1",
      providerRecordId: "provider-1",
      ordinal: 1,
      kind: "title",
      textValue: "A complete history",
      integerValue: null,
      structuredItemCount: null,
      valueFingerprint: null,
      createdAt: new Date("2026-07-20T00:00:02.000Z"),
      authors: [],
      identifiers: [],
      openAccess: null,
      publisher: null
    },
    {
      id: "assertion-2",
      literatureId: "literature-1",
      providerRecordId: "provider-1",
      ordinal: 2,
      kind: "publicationDate",
      textValue: "2020",
      integerValue: null,
      structuredItemCount: null,
      valueFingerprint: null,
      createdAt: new Date("2026-07-20T00:00:03.000Z"),
      authors: [],
      identifiers: [],
      openAccess: null,
      publisher: null
    }
  ]
};

function createSnapshotRepository(): LiteratureRepository {
  return {
    async createLiterature() {
      throw new LiteratureError("Not used", 500);
    },
    async appendLiteratureAssertions() {
      throw new LiteratureError("Not used", 500);
    },
    async getLiteratureSnapshot() {
      return snapshot;
    },
    async listLiteraturePage() {
      throw new LiteratureError("Not used", 500);
    }
  };
}

describe("literature detail history", () => {
  it("returns the complete typed assertion history alongside the Phase 1 projection", async () => {
    // Given
    const service = createLiteratureService(createSnapshotRepository());

    // When
    const response = await service.getLiterature({
      actor: { userId: "user-1", spaceId: "space-1", spaceRole: "SpaceMember" },
      literatureId: "literature-1"
    });

    // Then
    expect(response.assertions).toEqual([
      {
        assertionId: "assertion-1",
        providerRecordId: "provider-1",
        ordinal: 1,
        kind: "title",
        value: "A complete history"
      },
      {
        assertionId: "assertion-2",
        providerRecordId: "provider-1",
        ordinal: 2,
        kind: "publicationDate",
        value: "2020"
      }
    ]);
    expect(response.projection.title.current?.value).toBe("A complete history");
    expect(response.projection.publicationDate.current?.value).toBe("2020");
  });
});
