import { describe, expect, it } from "vitest";
import { providerKeyMaxLength, providerRecordKeyMaxLength } from "@jixia/shared";

import {
  createLiteratureService,
  LiteratureError,
  type AppendLiteratureRepositoryInput,
  type AppendLiteratureRepositoryResult,
  type CreateLiteratureRepositoryInput,
  type LiteratureActor,
  type LiteratureRecord,
  type LiteratureRepository,
  type LiteratureSnapshot
} from "./literature.service";

const personalActor: LiteratureActor = {
  userId: "user-1",
  spaceId: "space-1",
  spaceRole: "SpaceMember"
};

class RecordingLiteratureRepository implements LiteratureRepository {
  createInput: CreateLiteratureRepositoryInput | null = null;
  appendInput: AppendLiteratureRepositoryInput | null = null;
  snapshot: LiteratureSnapshot | null = null;

  async createLiterature(input: CreateLiteratureRepositoryInput): Promise<LiteratureRecord> {
    this.createInput = input;
    return {
      id: "literature-1",
      ownerUserId: input.scope.kind === "personal" ? input.actor.userId : null,
      projectId: input.scope.kind === "project" ? input.scope.projectId : null,
      createdByUserId: input.actor.userId,
      createdAt: new Date("2026-07-17T00:00:00.000Z")
    };
  }

  async appendLiteratureAssertions(
    input: AppendLiteratureRepositoryInput
  ): Promise<AppendLiteratureRepositoryResult> {
    this.appendInput = input;
    return {
      literatureId: input.literatureId,
      providerRecord: {
        id: "provider-record-1",
        literatureId: input.literatureId,
        providerKey: input.provider.providerKey,
        recordKey: input.provider.recordKey,
        createdByUserId: input.actor.userId,
        createdAt: new Date("2026-07-17T00:00:00.000Z")
      },
      assertions: []
    };
  }

  async getLiteratureSnapshot(): Promise<LiteratureSnapshot> {
    if (this.snapshot === null) {
      throw new LiteratureError("Literature not found", 404);
    }
    return this.snapshot;
  }

  async listLiteraturePage() {
    return [];
  }
}

describe("literature service", () => {
  it("derives personal ownership from the authenticated actor", async () => {
    // Given
    const repository = new RecordingLiteratureRepository();
    const service = createLiteratureService(repository);

    // When
    const response = await service.createLiterature({
      actor: personalActor,
      request: { scope: "personal" }
    });

    // Then
    expect(repository.createInput).toEqual({
      actor: personalActor,
      scope: { kind: "personal" }
    });
    expect(response.literature.scope).toEqual({ kind: "personal", ownerUserId: "user-1" });
  });

  it("normalizes and canonically orders assertion batches before persistence", async () => {
    // Given
    const repository = new RecordingLiteratureRepository();
    const service = createLiteratureService(repository);

    // When
    await service.appendAssertions({
      actor: personalActor,
      literatureId: "literature-1",
      request: {
        provider: {
          providerKey: "  CROSSREF  ",
          recordKey: "  Work/1  "
        },
        assertions: [
          { kind: "doi", value: "https://doi.org/10.1000/ABC.Def" },
          { kind: "publicationYear", value: 2025 },
          { kind: "title", value: "  A   normalized\n title  " }
        ]
      }
    });

    // Then
    expect(repository.appendInput).toEqual({
      actor: personalActor,
      literatureId: "literature-1",
      provider: {
        providerKey: "crossref",
        recordKey: "Work/1"
      },
      assertions: [
        { kind: "title", value: "A normalized title" },
        { kind: "publicationYear", value: 2025 },
        { kind: "doi", value: "10.1000/abc.def" }
      ]
    });
  });

  it("rejects duplicate assertion kinds before persistence", async () => {
    // Given
    const repository = new RecordingLiteratureRepository();
    const service = createLiteratureService(repository);

    // When
    const append = service.appendAssertions({
      actor: personalActor,
      literatureId: "literature-1",
      request: {
        provider: { providerKey: "crossref", recordKey: "work-1" },
        assertions: [
          { kind: "title", value: "First" },
          { kind: "title", value: "Second" }
        ]
      }
    });

    // Then
    await expect(append).rejects.toMatchObject({ statusCode: 400 });
    expect(repository.appendInput).toBeNull();
  });

  it("accepts provider identity values at the shared maximum lengths", async () => {
    // Given
    const repository = new RecordingLiteratureRepository();
    const service = createLiteratureService(repository);
    const providerKey = "p".repeat(providerKeyMaxLength);
    const recordKey = "r".repeat(providerRecordKeyMaxLength);

    // When
    await service.appendAssertions({
      actor: personalActor,
      literatureId: "literature-1",
      request: {
        provider: { providerKey, recordKey },
        assertions: [{ kind: "title", value: "A title" }]
      }
    });

    // Then
    expect(repository.appendInput?.provider).toEqual({ providerKey, recordKey });
  });

  it.each([
    ["provider key", { providerKey: "p".repeat(providerKeyMaxLength + 1), recordKey: "record" }],
    ["record key", { providerKey: "provider", recordKey: "r".repeat(providerRecordKeyMaxLength + 1) }]
  ])("rejects an oversized %s before persistence", async (_label, provider) => {
    // Given
    const repository = new RecordingLiteratureRepository();
    const service = createLiteratureService(repository);

    // When
    const append = service.appendAssertions({
      actor: personalActor,
      literatureId: "literature-1",
      request: { provider, assertions: [{ kind: "title", value: "A title" }] }
    });

    // Then
    await expect(append).rejects.toMatchObject({ statusCode: 400 });
    expect(repository.appendInput).toBeNull();
  });

  it("returns a deterministic projection with provider provenance", async () => {
    // Given
    const repository = new RecordingLiteratureRepository();
    repository.snapshot = {
      literature: {
        id: "literature-1",
        ownerUserId: "user-1",
        projectId: null,
        createdByUserId: "user-1",
        createdAt: new Date("2026-07-17T00:00:00.000Z")
      },
      providerRecords: [
        {
          id: "provider-record-1",
          literatureId: "literature-1",
          providerKey: "crossref",
          recordKey: "work-1",
          createdByUserId: "user-1",
          createdAt: new Date("2026-07-17T00:00:00.000Z")
        }
      ],
      assertions: [
        {
          id: "assertion-current",
          literatureId: "literature-1",
          providerRecordId: "provider-record-1",
          ordinal: 2,
          kind: "title",
          textValue: "Current title",
          integerValue: null,
          structuredItemCount: null,
          valueFingerprint: null,
          createdAt: new Date("2026-07-17T00:00:02.000Z"),
          authors: [],
          identifiers: [],
          openAccess: null,
          publisher: null
        },
        {
          id: "assertion-old",
          literatureId: "literature-1",
          providerRecordId: "provider-record-1",
          ordinal: 1,
          kind: "title",
          textValue: "Old title",
          integerValue: null,
          structuredItemCount: null,
          valueFingerprint: null,
          createdAt: new Date("2026-07-17T00:00:01.000Z"),
          authors: [],
          identifiers: [],
          openAccess: null,
          publisher: null
        }
      ]
    };
    const service = createLiteratureService(repository);

    // When
    const response = await service.getLiterature({
      actor: personalActor,
      literatureId: "literature-1"
    });

    // Then
    expect(response.projection.title.current).toEqual({
      assertionId: "assertion-current",
      providerRecordId: "provider-record-1",
      ordinal: 2,
      value: "Current title"
    });
    expect(response.projection.title.conflicts).toHaveLength(1);
    expect(response.providerRecords[0]?.providerKey).toBe("crossref");
  });
});
