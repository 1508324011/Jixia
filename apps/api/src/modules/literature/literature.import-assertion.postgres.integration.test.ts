import type { PrismaClient } from "@jixia/db";
import { createPostgresIntegrationMigrationClient } from "@jixia/db/postgres-integration-environment";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

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
const runPrefix = `task25-import-assertion-${process.pid}-${Date.now()}`;
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

describe.skipIf(!runPostgresIntegration)("literature import assertion persistence", () => {
  beforeAll(async () => {
    requireLiteraturePostgresEnvironment();
    const database = await import("@jixia/db");
    prisma = database.prisma;
    migrationPrisma = createPostgresIntegrationMigrationClient();
    repository = createPrismaLiteratureImportRepository(database.prisma);
    await removeImportAuditFailure(migrationPrisma);
  });

  afterEach(async () => {
    await removeImportAuditFailure(requireMigrationPrisma());
  });

  afterAll(async () => {
    await migrationPrisma?.$disconnect();
    await prisma?.$disconnect();
  });

  it("reuses one provider and appends repeated-equal complete contiguous batches", async () => {
    // Given
    const database = requirePrisma();
    const imports = requireRepository();
    const fixture = await seedImportActors(database, `${runPrefix}-repeat`);
    const first = await imports.admitImport({
      actor: fixture.owner,
      target: { scope: "personal" },
      seed: { providerKey: "crossref", recordKey: "10.1000/repeat" },
      idempotencyKey: "b9b3dc84-1f51-41d5-9bd8-0cab8e900001"
    });
    const second = await imports.admitImport({
      actor: fixture.owner,
      target: { scope: "personal" },
      seed: { providerKey: "crossref", recordKey: "10.1000/repeat" },
      idempotencyKey: "b9b3dc84-1f51-41d5-9bd8-0cab8e900002"
    });
    const batch = completeImportBatch({
      providerKey: "crossref",
      recordKey: "10.1000/repeat",
      doi: "10.1000/repeat"
    });

    // When
    const firstResult = await imports.finalizeImport({
      actor: fixture.owner,
      operationId: first.operation.id,
      attemptCount: 1,
      warningCodes: [],
      batches: [batch]
    });
    const secondResult = await imports.finalizeImport({
      actor: fixture.owner,
      operationId: second.operation.id,
      attemptCount: 1,
      warningCodes: ["unpaywall_enrichment_unavailable"],
      batches: [batch]
    });

    // Then
    expect(secondResult.literatureId).toBe(firstResult.literatureId);
    expect(await database.providerRecord.count({ where: { literatureId: firstResult.literatureId } })).toBe(1);
    const assertions = await database.assertion.findMany({
      where: { literatureId: firstResult.literatureId },
      orderBy: { ordinal: "asc" },
      select: { kind: true, ordinal: true, valueFingerprint: true }
    });
    expect(assertions.map(({ ordinal }) => ordinal)).toEqual(
      Array.from({ length: 22 }, (_, index) => index + 1)
    );
    expect(assertions.filter(({ kind }) => kind === "authors")).toHaveLength(2);
    expect(new Set(
      assertions.filter(({ kind }) => kind === "authors").map(({ valueFingerprint }) => valueFingerprint)
    ).size).toBe(1);
    expect(await database.assertionAuthor.count()).toBeGreaterThanOrEqual(4);
    expect(await database.assertionIdentifier.count()).toBeGreaterThanOrEqual(4);
    expect(await database.assertionOpenAccess.count()).toBeGreaterThanOrEqual(2);
    expect(await database.assertionPublisher.count()).toBeGreaterThanOrEqual(2);
    const successAudit = await database.auditEvent.findFirstOrThrow({
      where: { targetId: second.operation.id, action: "literature.import_succeeded" },
      select: { metadata: true }
    });
    expect(successAudit.metadata).toEqual({
      operationId: second.operation.id,
      literatureId: firstResult.literatureId,
      scopeKind: "personal",
      providerKey: "crossref",
      attemptCount: 1,
      outcome: "succeeded",
      assertionCount: 11,
      warningCodes: ["unpaywall_enrichment_unavailable"]
    });
    const auditText = JSON.stringify(successAudit);
    expect(auditText).not.toContain("10.1000/repeat");
    expect(auditText).not.toContain("https://");
  });

  it("rolls back the complete winning aggregate when success audit persistence fails", async () => {
    // Given
    const database = requirePrisma();
    const imports = requireRepository();
    const fixture = await seedImportActors(database, `${runPrefix}-audit`);
    const admitted = await imports.admitImport({
      actor: fixture.owner,
      target: { scope: "personal" },
      seed: { providerKey: "openalex", recordKey: "W-audit" },
      idempotencyKey: "b9b3dc84-1f51-41d5-9bd8-0cab8e900003"
    });
    await installImportAuditFailure(requireMigrationPrisma(), "literature.import_succeeded");

    // When
    const finalization = imports.finalizeImport({
      actor: fixture.owner,
      operationId: admitted.operation.id,
      attemptCount: 1,
      warningCodes: [],
      batches: [
        completeImportBatch({
          providerKey: "openalex",
          recordKey: "W-audit",
          doi: "10.1000/audit"
        })
      ]
    });

    // Then
    await expect(finalization).rejects.toThrow("forced import audit failure");
    await expect(
      imports.getImportOperation({ actor: fixture.owner, operationId: admitted.operation.id })
    ).resolves.toMatchObject({ status: "running" });
    expect(await database.literature.count({ where: { ownerUserId: fixture.owner.userId } })).toBe(0);
    expect(await database.literatureIdentity.count({ where: { ownerUserId: fixture.owner.userId } })).toBe(0);
  });
});
