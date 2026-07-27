import { describe, expect, it } from "vitest";

import {
  historyLiteratureId
} from "./literature.history.test-fixture.js";
import { createLiteratureLibraryCursorCodec } from "./literature.library-cursor.js";
import type {
  AppendLiteratureRepositoryInput,
  AppendLiteratureRepositoryResult,
  CreateLiteratureRepositoryInput,
  LiteratureActor,
  LiteratureLibraryRecord,
  LiteratureRecord,
  LiteratureRepository,
  LiteratureSnapshot
} from "./literature.repository.js";
import { createLiteratureService, LiteratureError } from "./literature.service.js";

const actor: LiteratureActor = {
  userId: "user-1",
  spaceId: "space-1",
  spaceRole: "SpaceMember"
};
const nowMs = Date.parse("2026-07-20T12:00:00.000Z");

class RecordingLibraryRepository implements LiteratureRepository {
  readonly listCalls: Parameters<LiteratureRepository["listLiteraturePage"]>[0][] = [];
  page: readonly LiteratureLibraryRecord[] = [];

  async createLiterature(input: CreateLiteratureRepositoryInput): Promise<LiteratureRecord> {
    return {
      id: "created-literature",
      ownerUserId: input.scope.kind === "personal" ? input.actor.userId : null,
      projectId: input.scope.kind === "project" ? input.scope.projectId : null,
      createdByUserId: input.actor.userId,
      createdAt: new Date(nowMs)
    };
  }

  async appendLiteratureAssertions(
    _input: AppendLiteratureRepositoryInput
  ): Promise<AppendLiteratureRepositoryResult> {
    throw new LiteratureError("Not used", 500);
  }

  async getLiteratureSnapshot(): Promise<LiteratureSnapshot> {
    throw new LiteratureError("Not used", 500);
  }

  async listLiteraturePage(
    input: Parameters<LiteratureRepository["listLiteraturePage"]>[0]
  ): Promise<readonly LiteratureLibraryRecord[]> {
    this.listCalls.push(input);
    return this.page;
  }
}

function libraryRecord(): LiteratureLibraryRecord {
  return {
    literature: {
      id: historyLiteratureId,
      ownerUserId: actor.userId,
      projectId: null,
      createdByUserId: actor.userId,
      createdAt: new Date("2026-07-20T00:00:00.000Z")
    },
    current: {
      title: "Current title",
      authors: [{ displayName: "Ada Lovelace" }],
      publicationYear: 2026,
      publicationDate: "2026",
      venue: "Jixia Journal",
      doi: "10.1000/history",
      openAccess: { isOpenAccess: true },
      publisher: { name: "Jixia Press" }
    },
    providerRecordCount: 2,
    latestAssertionCreatedAt: new Date("2026-07-20T00:00:09.000Z"),
    conflictKinds: ["title"]
  };
}

describe("literature library service", () => {
  it("derives a canonical summary and emits a cursor from limit-plus-one results", async () => {
    const repository = new RecordingLibraryRepository();
    const record = libraryRecord();
    repository.page = [record, record];
    const codec = createLiteratureLibraryCursorCodec({
      secret: "library-service-secret-that-is-at-least-32-bytes",
      now: () => nowMs
    });
    const service = createLiteratureService(repository, { libraryCursorCodec: codec });

    const response = await service.listLiterature({
      actor,
      request: { scope: "personal", limit: 1 }
    });

    expect(repository.listCalls).toEqual([{
      actor,
      scope: { kind: "personal" },
      limit: 2,
      anchor: null
    }]);
    expect(response.literature).toEqual([{
      id: historyLiteratureId,
      scope: { kind: "personal", ownerUserId: actor.userId },
      title: "Current title",
      authors: [{ displayName: "Ada Lovelace" }],
      publicationYear: 2026,
      publicationDate: "2026",
      venue: "Jixia Journal",
      doi: "10.1000/history",
      openAccess: { isOpenAccess: true },
      publisher: { name: "Jixia Press" },
      provenanceCount: 2,
      conflictKinds: ["title"],
      createdAt: "2026-07-20T00:00:00.000Z",
      updatedAt: "2026-07-20T00:00:09.000Z"
    }]);
    expect(response.nextCursor).not.toBeNull();
    if (response.nextCursor === null) {
      throw new LiteratureError("Expected next cursor", 500);
    }

    repository.page = [];
    await service.listLiterature({
      actor,
      request: { scope: "personal", limit: 1, cursor: response.nextCursor }
    });
    expect(repository.listCalls[1]?.anchor).toEqual({
      createdAt: record.literature.createdAt,
      id: record.literature.id
    });
  });

  it("rejects a tampered cursor before repository access", async () => {
    const repository = new RecordingLibraryRepository();
    const codec = createLiteratureLibraryCursorCodec({
      secret: "library-service-secret-that-is-at-least-32-bytes",
      now: () => nowMs
    });
    const service = createLiteratureService(repository, { libraryCursorCodec: codec });

    const listing = service.listLiterature({
      actor,
      request: { scope: "personal", cursor: "tampered" }
    });

    await expect(listing).rejects.toMatchObject({ statusCode: 400, message: "invalid_cursor" });
    expect(repository.listCalls).toHaveLength(0);
  });

  it("keeps Phase 1 creation available when the cursor secret is absent", async () => {
    const repository = new RecordingLibraryRepository();
    const service = createLiteratureService(repository);

    await expect(service.createLiterature({
      actor,
      request: { scope: "personal" }
    })).resolves.toMatchObject({ literature: { id: "created-literature" } });
    await expect(service.listLiterature({
      actor,
      request: { scope: "personal" }
    })).rejects.toMatchObject({ statusCode: 503 });
    expect(repository.listCalls).toHaveLength(0);
  });
});
