import type { PrismaClient } from "@jixia/db";
import { createPostgresIntegrationMigrationClient } from "@jixia/db/postgres-integration-environment";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  completeImportBatch,
  installImportAuditFailure,
  removeImportAuditFailure,
  seedImportActors
} from "./literature.import.postgres-fixture.js";
import type { LiteratureImportRepository } from "./literature.import-repository.js";
import { requireLiteraturePostgresEnvironment } from "./literature.postgres-environment.js";
import { createPrismaLiteratureImportRepository } from "./literature.prisma-import-repository.js";

const runPostgresIntegration = process.env.JIXIA_RUN_POSTGRES_INTEGRATION === "1";
const runPrefix = `task25-import-identity-${process.pid}-${Date.now()}`;
let prisma: PrismaClient | undefined;
let migrationPrisma: PrismaClient | undefined;
let repository: LiteratureImportRepository | undefined;

function requirePrisma(): PrismaClient {
  if (prisma === undefined) {
    throw new Error("PostgreSQL integration Prisma client is not connected");
  }
  return prisma;
}

function requireRepository(): LiteratureImportRepository {
  if (repository === undefined) {
    throw new Error("Import repository is not configured");
  }
  return repository;
}

function requireMigrationPrisma(): PrismaClient {
  if (migrationPrisma === undefined) {
    throw new Error("PostgreSQL integration migration Prisma client is not connected");
  }
  return migrationPrisma;
}

describe.skipIf(!runPostgresIntegration)("literature import exact identity resolution", () => {
  beforeAll(async () => {
    requireLiteraturePostgresEnvironment();
    const database = await import("@jixia/db");
    prisma = database.prisma;
    migrationPrisma = createPostgresIntegrationMigrationClient();
    repository = createPrismaLiteratureImportRepository(database.prisma);
    await installImportAuditFailure(migrationPrisma, "literature.import_succeeded");
    await removeImportAuditFailure(requireMigrationPrisma());
  });

  afterAll(async () => {
    if (migrationPrisma !== undefined) {
      await removeImportAuditFailure(migrationPrisma);
      await migrationPrisma.$disconnect();
    }
    await prisma?.$disconnect();
  });

  it("converges concurrent same-scope imports and rolls back the losing aggregate", async () => {
    // Given
    const database = requirePrisma();
    const imports = requireRepository();
    const fixture = await seedImportActors(database, `${runPrefix}-race`);
    const first = await imports.admitImport({
      actor: fixture.editor,
      target: { scope: "project", projectId: fixture.projectId },
      seed: { providerKey: "openalex", recordKey: "W-race" },
      idempotencyKey: "a9b3dc84-1f51-41d5-9bd8-0cab8e900001"
    });
    const second = await imports.admitImport({
      actor: fixture.owner,
      target: { scope: "project", projectId: fixture.projectId },
      seed: { providerKey: "crossref", recordKey: "10.1000/race" },
      idempotencyKey: "a9b3dc84-1f51-41d5-9bd8-0cab8e900002"
    });

    // When
    const [firstResult, secondResult] = await Promise.all([
      imports.finalizeImport({
        actor: fixture.editor,
        operationId: first.operation.id,
        attemptCount: 1,
        warningCodes: [],
        batches: [
          completeImportBatch({
            providerKey: "openalex",
            recordKey: "W-race",
            doi: "10.1000/race"
          })
        ]
      }),
      imports.finalizeImport({
        actor: fixture.owner,
        operationId: second.operation.id,
        attemptCount: 1,
        warningCodes: [],
        batches: [
          completeImportBatch({
            providerKey: "crossref",
            recordKey: "10.1000/race",
            doi: "10.1000/race"
          })
        ]
      })
    ]);

    // Then
    expect(firstResult.literatureId).toBe(secondResult.literatureId);
    expect(await database.literature.count({ where: { projectId: fixture.projectId } })).toBe(1);
    expect(await database.providerRecord.count({ where: { literatureId: firstResult.literatureId } })).toBe(2);
    expect(await database.assertion.count({ where: { literatureId: firstResult.literatureId } })).toBe(22);
    expect(await database.literatureIdentity.count({ where: { literatureId: firstResult.literatureId } })).toBe(3);
    expect(
      await database.importOperation.count({
        where: { projectId: fixture.projectId, status: "succeeded" }
      })
    ).toBe(2);
  });

  it("keeps the same exact DOI separate across personal and project scopes", async () => {
    // Given
    const imports = requireRepository();
    const fixture = await seedImportActors(requirePrisma(), `${runPrefix}-scope`);
    const personal = await imports.admitImport({
      actor: fixture.owner,
      target: { scope: "personal" },
      seed: { providerKey: "pubmed", recordKey: "31" },
      idempotencyKey: "a9b3dc84-1f51-41d5-9bd8-0cab8e900003"
    });
    const project = await imports.admitImport({
      actor: fixture.owner,
      target: { scope: "project", projectId: fixture.projectId },
      seed: { providerKey: "pubmed", recordKey: "31" },
      idempotencyKey: "a9b3dc84-1f51-41d5-9bd8-0cab8e900004"
    });

    // When
    const personalResult = await imports.finalizeImport({
      actor: fixture.owner,
      operationId: personal.operation.id,
      attemptCount: 1,
      warningCodes: [],
      batches: [completeImportBatch({ providerKey: "pubmed", recordKey: "31", doi: "10.1000/scope" })]
    });
    const projectResult = await imports.finalizeImport({
      actor: fixture.owner,
      operationId: project.operation.id,
      attemptCount: 1,
      warningCodes: [],
      batches: [completeImportBatch({ providerKey: "pubmed", recordKey: "31", doi: "10.1000/scope" })]
    });

    // Then
    expect(personalResult.literatureId).not.toBe(projectResult.literatureId);
  });

  it("rejects DOI and provider claims that resolve to different aggregates", async () => {
    // Given
    const imports = requireRepository();
    const fixture = await seedImportActors(requirePrisma(), `${runPrefix}-contradiction`);
    const first = await imports.admitImport({
      actor: fixture.owner,
      target: { scope: "project", projectId: fixture.projectId },
      seed: { providerKey: "crossref", recordKey: "10.1000/alpha" },
      idempotencyKey: "a9b3dc84-1f51-41d5-9bd8-0cab8e900005"
    });
    const second = await imports.admitImport({
      actor: fixture.owner,
      target: { scope: "project", projectId: fixture.projectId },
      seed: { providerKey: "openalex", recordKey: "W-beta" },
      idempotencyKey: "a9b3dc84-1f51-41d5-9bd8-0cab8e900006"
    });
    await imports.finalizeImport({
      actor: fixture.owner,
      operationId: first.operation.id,
      attemptCount: 1,
      warningCodes: [],
      batches: [
        completeImportBatch({
          providerKey: "crossref",
          recordKey: "10.1000/alpha",
          doi: "10.1000/alpha"
        })
      ]
    });
    await imports.finalizeImport({
      actor: fixture.owner,
      operationId: second.operation.id,
      attemptCount: 1,
      warningCodes: [],
      batches: [
        completeImportBatch({ providerKey: "openalex", recordKey: "W-beta", doi: "10.1000/beta" })
      ]
    });
    const contradictory = await imports.admitImport({
      actor: fixture.editor,
      target: { scope: "project", projectId: fixture.projectId },
      seed: { providerKey: "openalex", recordKey: "W-beta" },
      idempotencyKey: "a9b3dc84-1f51-41d5-9bd8-0cab8e900007"
    });

    // When
    const finalization = imports.finalizeImport({
      actor: fixture.editor,
      operationId: contradictory.operation.id,
      attemptCount: 1,
      warningCodes: [],
      batches: [
        completeImportBatch({ providerKey: "openalex", recordKey: "W-beta", doi: "10.1000/alpha" })
      ]
    });

    // Then
    await expect(finalization).rejects.toMatchObject({ code: "identity_conflict" });
    await expect(
      imports.getImportOperation({ actor: fixture.editor, operationId: contradictory.operation.id })
    ).resolves.toMatchObject({ status: "running" });
  });

  it("routes through unambiguous current Phase 1 DOI and provider rows", async () => {
    // Given
    const database = requirePrisma();
    const imports = requireRepository();
    const fixture = await seedImportActors(database, `${runPrefix}-legacy`);
    const literature = await database.literature.create({
      data: {
        projectId: fixture.projectId,
        createdByUserId: fixture.owner.userId,
        nextAssertionOrdinal: 2
      }
    });
    const provider = await database.providerRecord.create({
      data: {
        literatureId: literature.id,
        providerKey: "crossref",
        recordKey: "10.1000/legacy",
        createdByUserId: fixture.owner.userId
      }
    });
    await database.assertion.create({
      data: {
        literatureId: literature.id,
        providerRecordId: provider.id,
        createdByUserId: fixture.owner.userId,
        ordinal: 1,
        kind: "doi",
        textValue: "10.1000/legacy"
      }
    });
    const admitted = await imports.admitImport({
      actor: fixture.editor,
      target: { scope: "project", projectId: fixture.projectId },
      seed: { providerKey: "crossref", recordKey: "10.1000/legacy" },
      idempotencyKey: "a9b3dc84-1f51-41d5-9bd8-0cab8e900008"
    });

    // When
    const result = await imports.finalizeImport({
      actor: fixture.editor,
      operationId: admitted.operation.id,
      attemptCount: 1,
      warningCodes: [],
      batches: [
        completeImportBatch({
          providerKey: "crossref",
          recordKey: "10.1000/legacy",
          doi: "10.1000/legacy"
        })
      ]
    });

    // Then
    expect(result.literatureId).toBe(literature.id);
    expect(await database.literatureIdentity.count({ where: { literatureId: literature.id } })).toBe(2);
  });
});
