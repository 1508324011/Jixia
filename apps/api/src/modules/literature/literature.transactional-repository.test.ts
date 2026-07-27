import { describe, expect, it } from "vitest";

import { actor, FakeTransactionRunner } from "./literature.transactional-repository.test-fixture.js";
import { TransactionalLiteratureRepository } from "./literature.transactional-repository.js";

describe("TransactionalLiteratureRepository", () => {
  it("requests mutation-safe project access before project literature creation", async () => {
    // Given
    const runner = new FakeTransactionRunner();
    runner.projectAccess = {
      kind: "project",
      projectId: "project-1",
      projectSpaceId: actor.spaceId,
      activeSpaceMember: true,
      projectRole: "ProjectOwner"
    };
    const repository = new TransactionalLiteratureRepository(runner);

    // When
    await repository.createLiterature({
      actor,
      scope: { kind: "project", projectId: "project-1" }
    });

    // Then
    expect(runner.lastProjectAccessMode).toBe("mutation");
  });

  it("rolls back personal creation when its audit write fails", async () => {
    // Given
    const runner = new FakeTransactionRunner();
    runner.failAudit = true;
    const repository = new TransactionalLiteratureRepository(runner);

    // When
    const result = repository.createLiterature({ actor, scope: { kind: "personal" } });

    // Then
    await expect(result).rejects.toThrow("audit unavailable");
    expect(runner.state.literatures).toEqual([]);
    expect(runner.state.audits).toEqual([]);
  });

  it("rolls back provider, assertions, and ordinal allocation when append audit fails", async () => {
    // Given
    const runner = new FakeTransactionRunner();
    const repository = new TransactionalLiteratureRepository(runner);
    const literature = await repository.createLiterature({ actor, scope: { kind: "personal" } });
    runner.failAudit = true;

    // When
    const result = repository.appendLiteratureAssertions({
      actor,
      literatureId: literature.id,
      provider: { providerKey: "crossref", recordKey: "record-1" },
      assertions: [{ kind: "title", value: "A title" }]
    });

    // Then
    await expect(result).rejects.toThrow("audit unavailable");
    expect(runner.state.providerRecords).toEqual([]);
    expect(runner.state.assertions).toEqual([]);
    expect(runner.state.nextOrdinals.get(literature.id)).toBe(1);
  });

  it("reuses aggregate-local providers and allocates contiguous assertion ordinals", async () => {
    // Given
    const runner = new FakeTransactionRunner();
    const repository = new TransactionalLiteratureRepository(runner);
    const literature = await repository.createLiterature({ actor, scope: { kind: "personal" } });
    const provider = { providerKey: "crossref", recordKey: "record-1" };

    // When
    const first = await repository.appendLiteratureAssertions({
      actor,
      literatureId: literature.id,
      provider,
      assertions: [
        { kind: "title", value: "A title" },
        { kind: "publicationYear", value: 2026 }
      ]
    });
    const second = await repository.appendLiteratureAssertions({
      actor,
      literatureId: literature.id,
      provider,
      assertions: [{ kind: "doi", value: "10.1000/example" }]
    });

    // Then
    expect(runner.lastLiteratureAccessMode).toBe("mutation");
    expect(first.providerRecord.id).toBe(second.providerRecord.id);
    expect(runner.state.providerRecords).toHaveLength(1);
    expect(runner.state.assertions.map((assertion) => assertion.ordinal)).toEqual([1, 2, 3]);
    expect(runner.state.nextOrdinals.get(literature.id)).toBe(4);
  });

  it("reads an authorized snapshot with repeatable-read isolation", async () => {
    // Given
    const runner = new FakeTransactionRunner();
    const repository = new TransactionalLiteratureRepository(runner);
    const literature = await repository.createLiterature({ actor, scope: { kind: "personal" } });
    await repository.appendLiteratureAssertions({
      actor,
      literatureId: literature.id,
      provider: { providerKey: "crossref", recordKey: "record-1" },
      assertions: [{ kind: "title", value: "A title" }]
    });

    // When
    const snapshot = await repository.getLiteratureSnapshot({ actor, literatureId: literature.id });

    // Then
    expect(runner.lastIsolationLevel).toBe("RepeatableRead");
    expect(runner.lastLiteratureAccessMode).toBe("read");
    expect(snapshot.providerRecords).toHaveLength(1);
    expect(snapshot.assertions).toHaveLength(1);
  });

  it("lists a personal library with descending keyset pagination in repeatable-read", async () => {
    const runner = new FakeTransactionRunner();
    const repository = new TransactionalLiteratureRepository(runner);
    await repository.createLiterature({ actor, scope: { kind: "personal" } });
    await repository.createLiterature({ actor, scope: { kind: "personal" } });
    await repository.createLiterature({ actor, scope: { kind: "personal" } });

    const firstPage = await repository.listLiteraturePage({
      actor,
      scope: { kind: "personal" },
      limit: 2,
      anchor: null
    });
    const anchorRecord = firstPage[1];
    if (anchorRecord === undefined) {
      throw new Error("Expected a personal keyset anchor");
    }
    const secondPage = await repository.listLiteraturePage({
      actor,
      scope: { kind: "personal" },
      limit: 2,
      anchor: {
        createdAt: anchorRecord.literature.createdAt,
        id: anchorRecord.literature.id
      }
    });

    expect(runner.lastIsolationLevel).toBe("RepeatableRead");
    expect(firstPage.map((record) => record.literature.id)).toEqual([
      "literature-3",
      "literature-2"
    ]);
    expect(secondPage.map((record) => record.literature.id)).toEqual(["literature-1"]);
  });

  it("allows project viewers to list and conceals inaccessible project scopes", async () => {
    const runner = new FakeTransactionRunner();
    runner.projectAccess = {
      kind: "project",
      projectId: "project-1",
      projectSpaceId: actor.spaceId,
      activeSpaceMember: true,
      projectRole: "ProjectOwner"
    };
    const repository = new TransactionalLiteratureRepository(runner);
    await repository.createLiterature({
      actor,
      scope: { kind: "project", projectId: "project-1" }
    });
    runner.projectAccess = {
      kind: "project",
      projectId: "project-1",
      projectSpaceId: actor.spaceId,
      activeSpaceMember: true,
      projectRole: "ProjectViewer"
    };

    await expect(repository.listLiteraturePage({
      actor,
      scope: { kind: "project", projectId: "project-1" },
      limit: 20,
      anchor: null
    })).resolves.toHaveLength(1);
    expect(runner.lastProjectAccessMode).toBe("read");

    runner.projectAccess = null;
    await expect(repository.listLiteraturePage({
      actor,
      scope: { kind: "project", projectId: "project-1" },
      limit: 20,
      anchor: null
    })).rejects.toMatchObject({ statusCode: 404 });
  });
});
