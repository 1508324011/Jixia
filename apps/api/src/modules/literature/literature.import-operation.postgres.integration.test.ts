import type { PrismaClient } from "@jixia/db";
import { createPostgresIntegrationMigrationClient } from "@jixia/db/postgres-integration-environment";
import { afterAll, afterEach, beforeAll, describe, expect, it } from "vitest";

import {
  installImportAuditFailure,
  removeImportAuditFailure,
  seedImportActors
} from "./literature.import.postgres-fixture.js";
import type { LiteratureImportRepository } from "./literature.import-repository.js";
import { requireLiteraturePostgresEnvironment } from "./literature.postgres-environment.js";
import { createPrismaLiteratureImportRepository } from "./literature.prisma-import-repository.js";

const runPostgresIntegration = process.env.JIXIA_RUN_POSTGRES_INTEGRATION === "1";
const runPrefix = `task25-import-op-${process.pid}-${Date.now()}`;
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

describe.skipIf(!runPostgresIntegration)("literature import operation repository", () => {
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

  it("replays one actor key and rejects a different immutable request", async () => {
    // Given
    const database = requirePrisma();
    const imports = requireRepository();
    const fixture = await seedImportActors(database, `${runPrefix}-idempotency`);
    const request = {
      actor: fixture.owner,
      target: { scope: "personal" },
      seed: { providerKey: "openalex", recordKey: "W1" },
      idempotencyKey: "d9b3dc84-1f51-41d5-9bd8-0cab8e900001"
    } as const;

    // When
    const admitted = await imports.admitImport(request);
    const replayed = await imports.admitImport(request);
    const conflict = imports.admitImport({
      ...request,
      seed: { providerKey: "openalex", recordKey: "W2" }
    });

    // Then
    expect(admitted.kind).toBe("admitted");
    expect(replayed).toMatchObject({ kind: "replayed", operation: { id: admitted.operation.id } });
    await expect(conflict).rejects.toMatchObject({ code: "idempotency_conflict" });
    expect(
      await database.importOperation.count({
        where: { createdByUserId: fixture.owner.userId }
      })
    ).toBe(1);
    const audits = await database.auditEvent.findMany({
      where: { targetId: admitted.operation.id },
      select: { action: true, metadata: true }
    });
    expect(audits).toEqual([
      {
        action: "literature.import_started",
        metadata: {
          operationId: admitted.operation.id,
          scopeKind: "personal",
          providerKey: "openalex",
          attemptCount: 1,
          outcome: "started"
        }
      }
    ]);
    expect(JSON.stringify(audits)).not.toContain(request.idempotencyKey);
    expect(JSON.stringify(audits)).not.toContain(request.seed.recordKey);
  });

  it("allows project members to read while denying viewer and inaccessible mutations", async () => {
    // Given
    const imports = requireRepository();
    const fixture = await seedImportActors(requirePrisma(), `${runPrefix}-authorization`);
    const admitted = await imports.admitImport({
      actor: fixture.editor,
      target: { scope: "project", projectId: fixture.projectId },
      seed: { providerKey: "pubmed", recordKey: "2" },
      idempotencyKey: "d9b3dc84-1f51-41d5-9bd8-0cab8e900002"
    });

    // When
    const viewerRead = await imports.getImportOperation({
      actor: fixture.viewer,
      operationId: admitted.operation.id
    });

    // Then
    expect(viewerRead).toMatchObject({ id: admitted.operation.id });
    await expect(
      imports.retryImport({ actor: fixture.viewer, operationId: admitted.operation.id })
    ).rejects.toMatchObject({ code: "forbidden" });
    await expect(
      imports.getImportOperation({ actor: fixture.outsider, operationId: admitted.operation.id })
    ).rejects.toMatchObject({ code: "not_found" });
  });

  it("claims failed or expired work and rejects stale, active, and succeeded attempts", async () => {
    // Given
    const database = requirePrisma();
    const imports = requireRepository();
    const fixture = await seedImportActors(database, `${runPrefix}-retry`);
    const failedAdmission = await imports.admitImport({
      actor: fixture.editor,
      target: { scope: "project", projectId: fixture.projectId },
      seed: { providerKey: "crossref", recordKey: "10.1000/failed" },
      idempotencyKey: "d9b3dc84-1f51-41d5-9bd8-0cab8e900003"
    });
    await imports.failImport({
      actor: fixture.editor,
      operationId: failedAdmission.operation.id,
      attemptCount: 1,
      warningCodes: [],
      failureCode: "seed_unavailable"
    });
    const expired = await database.importOperation.create({
      data: {
        projectId: fixture.projectId,
        createdByUserId: fixture.editor.userId,
        idempotencyKey: "d9b3dc84-1f51-41d5-9bd8-0cab8e900004",
        requestFingerprint: "a".repeat(64),
        sourceProviderKey: "openalex",
        sourceRecordKey: "W-expired",
        status: "running",
        attemptCount: 1,
        attemptStartedAt: new Date(Date.now() - 60_000),
        takeoverAfter: new Date(Date.now() - 30_000)
      }
    });

    // When
    const failedRetry = await imports.retryImport({
      actor: fixture.owner,
      operationId: failedAdmission.operation.id
    });
    const expiredRetry = await imports.retryImport({
      actor: fixture.editor,
      operationId: expired.id
    });
    await expect(
      imports.retryImport({ actor: fixture.owner, operationId: failedAdmission.operation.id })
    ).rejects.toMatchObject({ code: "operation_conflict" });
    await expect(
      imports.failImport({
        actor: fixture.editor,
        operationId: expired.id,
        attemptCount: 1,
        warningCodes: [],
        failureCode: "seed_unavailable"
      })
    ).rejects.toMatchObject({ code: "stale_attempt" });
    await imports.failImport({
      actor: fixture.editor,
      operationId: expired.id,
      attemptCount: 2,
      warningCodes: [],
      failureCode: "seed_unavailable"
    });
    const succeededLiterature = await database.literature.create({
      data: {
        ownerUserId: fixture.owner.userId,
        createdByUserId: fixture.owner.userId
      }
    });
    const succeeded = await database.importOperation.create({
      data: {
        ownerUserId: fixture.owner.userId,
        createdByUserId: fixture.owner.userId,
        idempotencyKey: "d9b3dc84-1f51-41d5-9bd8-0cab8e900005",
        requestFingerprint: "b".repeat(64),
        sourceProviderKey: "pubmed",
        sourceRecordKey: "5",
        status: "succeeded",
        attemptCount: 1,
        attemptStartedAt: new Date(),
        takeoverAfter: null,
        finishedAttemptCount: 1,
        finishedAt: new Date(),
        literatureId: succeededLiterature.id
      }
    });
    // Then
    expect(failedRetry.attemptCount).toBe(2);
    expect(expiredRetry.attemptCount).toBe(2);
    await expect(
      imports.retryImport({ actor: fixture.owner, operationId: succeeded.id })
    ).rejects.toMatchObject({ code: "operation_conflict" });
  });

  it("rolls back a failure transition when its audit insert fails", async () => {
    // Given
    const database = requirePrisma();
    const imports = requireRepository();
    const fixture = await seedImportActors(database, `${runPrefix}-failure-audit`);
    const admitted = await imports.admitImport({
      actor: fixture.owner,
      target: { scope: "personal" },
      seed: { providerKey: "pubmed", recordKey: "8" },
      idempotencyKey: "d9b3dc84-1f51-41d5-9bd8-0cab8e900006"
    });
    await installImportAuditFailure(requireMigrationPrisma(), "literature.import_failed");

    // When
    const failure = imports.failImport({
      actor: fixture.owner,
      operationId: admitted.operation.id,
      attemptCount: 1,
      warningCodes: [],
      failureCode: "seed_unavailable"
    });

    // Then
    await expect(failure).rejects.toThrow("forced import audit failure");
    await expect(
      imports.getImportOperation({ actor: fixture.owner, operationId: admitted.operation.id })
    ).resolves.toMatchObject({ status: "running", attemptCount: 1 });
  });
});
