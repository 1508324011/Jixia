import { describe, expect, it } from "vitest";

import type {
  AdmitImportInput,
  AdmitImportResult,
  FailImportInput,
  FinalizeImportInput,
  ImportOperationRecord,
  LiteratureImportRepository,
  RunningImportOperation
} from "./literature.import-repository.js";
import {
  createLiteratureImportService,
  type LiteratureImportProviders
} from "./literature.import-service.js";
import type { LiteratureActor } from "./literature.repository.js";

const actor: LiteratureActor = {
  userId: "user-1",
  spaceId: "space-1",
  spaceRole: "SpaceMember"
};

const startedAt = new Date("2026-07-20T00:00:00.000Z");

class RecordingImportRepository implements LiteratureImportRepository {
  readonly finalizeCalls: FinalizeImportInput[] = [];

  private readonly running: RunningImportOperation = {
    id: "operation-1",
    scope: { kind: "personal", ownerUserId: actor.userId },
    seed: { providerKey: "pubmed", recordKey: "42" },
    createdByUserId: actor.userId,
    status: "running",
    attemptCount: 1,
    attemptStartedAt: startedAt,
    takeoverAfter: new Date(startedAt.getTime() + 30_000),
    finishedAt: null,
    literatureId: null,
    warnings: [],
    failureCode: null,
    createdAt: startedAt,
    updatedAt: startedAt
  };

  async admitImport(_input: AdmitImportInput): Promise<AdmitImportResult> {
    return { kind: "admitted", operation: this.running };
  }

  async getImportOperation(): Promise<ImportOperationRecord> {
    return this.running;
  }

  async retryImport(): Promise<RunningImportOperation> {
    return this.running;
  }

  async finalizeImport(input: FinalizeImportInput) {
    this.finalizeCalls.push(input);
    return {
      ...this.running,
      status: "succeeded" as const,
      takeoverAfter: null,
      finishedAt: new Date("2026-07-20T00:00:01.000Z"),
      literatureId: "literature-1"
    };
  }

  async failImport(_input: FailImportInput) {
    return {
      ...this.running,
      status: "failed" as const,
      takeoverAfter: null,
      finishedAt: new Date("2026-07-20T00:00:01.000Z"),
      failureCode: "internal_error" as const
    };
  }
}

function createProviders(): LiteratureImportProviders {
  const noDoiArticle = {
    source: { providerKey: "pubmed", recordKey: "42" },
    title: "Seed title",
    abstract: null,
    publicationYear: 2026,
    publicationDate: "2026-07-20",
    venue: "Jixia Journal",
    publicationType: "journal article",
    doi: null,
    authors: [{ displayName: "Ada Lovelace" }],
    identifiers: [{ scheme: "pmid", value: "42" }],
    openAccess: null,
    publisher: null
  } as const;
  return {
    openalex: {
      async fetchSeed() {
        throw new Error("unexpected OpenAlex seed call");
      },
      async lookupDoi() {
        throw new Error("unexpected OpenAlex DOI call");
      }
    },
    crossref: {
      async fetchSeed() {
        throw new Error("unexpected Crossref seed call");
      },
      async lookupDoi() {
        throw new Error("unexpected Crossref DOI call");
      }
    },
    pubmed: {
      async fetchSeed() {
        return noDoiArticle;
      },
      async lookupDoi() {
        throw new Error("unexpected PubMed DOI call");
      }
    },
    pmc: {
      async lookup() {
        throw new Error("unexpected PMC call");
      }
    },
    unpaywall: {
      async enrichDoi() {
        throw new Error("unexpected Unpaywall call");
      }
    }
  };
}

describe("literature import service", () => {
  it("finalizes a no-DOI seed without invoking enrichment", async () => {
    // Given
    const repository = new RecordingImportRepository();
    const service = createLiteratureImportService({ repository, providers: createProviders() });

    // When
    const result = await service.createImport({
      actor,
      request: {
        target: { scope: "personal" },
        seed: { providerKey: "pubmed", recordKey: "42" }
      },
      idempotencyKey: "db96ec94-79a1-49b9-92af-b4dc2f20ca0a"
    });

    // Then
    expect(result.response.operation).toMatchObject({
      status: "succeeded",
      literatureId: "literature-1",
      warnings: []
    });
    expect(repository.finalizeCalls[0]?.batches).toEqual([
      {
        source: { providerKey: "pubmed", recordKey: "42" },
        assertions: [
          { kind: "title", value: "Seed title" },
          { kind: "publicationYear", value: 2026 },
          { kind: "publicationDate", value: "2026-07-20" },
          { kind: "venue", value: "Jixia Journal" },
          { kind: "publicationType", value: "journal article" },
          { kind: "authors", value: [{ displayName: "Ada Lovelace" }] },
          { kind: "identifiers", value: [{ scheme: "pmid", value: "42" }] }
        ]
      }
    ]);
  });
});
