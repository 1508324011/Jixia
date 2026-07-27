import type { PrismaClient } from "@jixia/db";
import { Prisma } from "@jixia/db/generated";
import { createPostgresIntegrationMigrationClient } from "@jixia/db/postgres-integration-environment";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  expectProjectMutationBlocked,
  seedProjectLiterature
} from "./literature.postgres.integration-fixture.js";
import { requireLiteraturePostgresEnvironment } from "./literature.postgres-environment.js";
import { createPrismaLiteratureRepository } from "./literature.prisma-repository.js";
import { createLiteratureService, type LiteratureService } from "./literature.service.js";

const runPostgresIntegration = process.env.JIXIA_RUN_POSTGRES_INTEGRATION === "1";
const runPrefix = `task25-api-${process.pid}-${Date.now()}`;

let prisma: PrismaClient | undefined;
let migrationPrisma: PrismaClient | undefined;
let service: LiteratureService | undefined;

function requirePrisma(): PrismaClient {
  if (!prisma) {
    throw new Error("PostgreSQL integration Prisma client is not connected");
  }
  return prisma;
}

function requireService(): LiteratureService {
  if (!service) {
    throw new Error("PostgreSQL integration Literature service is not configured");
  }
  return service;
}

function requireMigrationPrisma(): PrismaClient {
  if (!migrationPrisma) {
    throw new Error("PostgreSQL integration migration Prisma client is not connected");
  }
  return migrationPrisma;
}

describe.skipIf(!runPostgresIntegration)("Literature Prisma repository", () => {
  beforeAll(async () => {
    requireLiteraturePostgresEnvironment();
    const database = await import("@jixia/db");
    prisma = database.prisma;
    migrationPrisma = createPostgresIntegrationMigrationClient();
    service = createLiteratureService(createPrismaLiteratureRepository(database.prisma));
  });

  afterAll(async () => {
    await migrationPrisma?.$disconnect();
    if (prisma) {
      await prisma.$disconnect();
    }
  });

  it("allocates disjoint concurrent ordinals and reuses the provider record", async () => {
    // Given
    const database = requirePrisma();
    const literatureService = requireService();
    const fixture = await seedProjectLiterature(database, `${runPrefix}-concurrent`);

    // When
    const results = await Promise.all([
      literatureService.appendAssertions({
        actor: fixture.actor,
        literatureId: fixture.literatureId,
        request: {
          provider: { providerKey: "CrossRef", recordKey: "record-1" },
          assertions: [
            { kind: "doi", value: "https://doi.org/10.1000/EXAMPLE" },
            { kind: "title", value: "First  title" }
          ]
        }
      }),
      literatureService.appendAssertions({
        actor: fixture.actor,
        literatureId: fixture.literatureId,
        request: {
          provider: { providerKey: "crossref", recordKey: "record-1" },
          assertions: [
            { kind: "publicationYear", value: 2026 },
            { kind: "abstract", value: "Second  abstract" }
          ]
        }
      })
    ]);

    // Then
    const ranges = results
      .map((result) => result.assertions.map((assertion) => assertion.ordinal))
      .sort((left, right) => (left[0] ?? 0) - (right[0] ?? 0));
    expect(ranges).toEqual([
      [1, 2],
      [3, 4]
    ]);
    const assertions = await database.assertion.findMany({
      where: { literatureId: fixture.literatureId },
      orderBy: { ordinal: "asc" },
      select: { ordinal: true }
    });
    const literature = await database.literature.findUniqueOrThrow({
      where: { id: fixture.literatureId },
      select: { nextAssertionOrdinal: true }
    });
    expect(assertions.map((assertion) => assertion.ordinal)).toEqual([1, 2, 3, 4]);
    expect(literature.nextAssertionOrdinal).toBe(5);
    expect(await database.providerRecord.count({ where: { literatureId: fixture.literatureId } })).toBe(1);
    expect(
      await database.auditEvent.count({
        where: { targetId: fixture.literatureId, action: "literature.assertions_appended" }
      })
    ).toBe(2);
  });

  it("rolls back provider, assertions, and ordinal allocation when audit persistence fails", async () => {
    // Given
    const database = requirePrisma();
    const migrationDatabase = requireMigrationPrisma();
    const literatureService = requireService();
    const fixture = await seedProjectLiterature(database, `${runPrefix}-audit`);
    await migrationDatabase.$executeRaw(Prisma.sql`
      CREATE FUNCTION task25_reject_literature_audit() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        IF NEW."action" = 'literature.assertions_appended' THEN
          RAISE EXCEPTION 'forced literature audit failure';
        END IF;
        RETURN NEW;
      END;
      $$
    `);
    await migrationDatabase.$executeRaw(Prisma.sql`
      CREATE TRIGGER task25_reject_literature_audit_trigger
      BEFORE INSERT ON "AuditEvent"
      FOR EACH ROW EXECUTE FUNCTION task25_reject_literature_audit()
    `);

    // When
    const append = literatureService.appendAssertions({
      actor: fixture.actor,
      literatureId: fixture.literatureId,
      request: {
        provider: { providerKey: "crossref", recordKey: "record-1" },
        assertions: [{ kind: "title", value: "Must roll back" }]
      }
    });

    // Then
    await expect(append).rejects.toThrow("forced literature audit failure");
    await migrationDatabase.$executeRaw(
      Prisma.sql`DROP TRIGGER task25_reject_literature_audit_trigger ON "AuditEvent"`
    );
    await migrationDatabase.$executeRaw(Prisma.sql`DROP FUNCTION task25_reject_literature_audit()`);
    expect(await database.providerRecord.count({ where: { literatureId: fixture.literatureId } })).toBe(0);
    expect(await database.assertion.count({ where: { literatureId: fixture.literatureId } })).toBe(0);
    const literature = await database.literature.findUniqueOrThrow({
      where: { id: fixture.literatureId },
      select: { nextAssertionOrdinal: true }
    });
    expect(literature.nextAssertionOrdinal).toBe(1);
  });

  it("serializes member removal and downgrade before failing closed", async () => {
    // Given
    const database = requirePrisma();
    const literatureService = requireService();
    const fixture = await seedProjectLiterature(database, `${runPrefix}-revocation`);

    // When
    await expectProjectMutationBlocked(database, fixture, async (transaction) => {
      await transaction.projectMember.delete({
        where: {
          projectId_userId: { projectId: fixture.projectId, userId: fixture.editorUserId }
        }
      });
    });
    await database.projectMember.update({
      where: {
        projectId_userId: { projectId: fixture.projectId, userId: fixture.editorUserId }
      },
      data: { role: "ProjectViewer" }
    });
    const rejectedAsViewer = literatureService.appendAssertions({
      actor: fixture.actor,
      literatureId: fixture.literatureId,
      request: {
        provider: { providerKey: "crossref", recordKey: "record-1" },
        assertions: [{ kind: "title", value: "Rejected viewer write" }]
      }
    });
    await expect(rejectedAsViewer).rejects.toMatchObject({ statusCode: 403 });
    await database.projectMember.update({
      where: {
        projectId_userId: { projectId: fixture.projectId, userId: fixture.editorUserId }
      },
      data: { role: "ProjectEditor" }
    });
    await expectProjectMutationBlocked(database, fixture, async (transaction) => {
      await transaction.projectMember.update({
        where: {
          projectId_userId: { projectId: fixture.projectId, userId: fixture.editorUserId }
        },
        data: { role: "ProjectViewer" }
      });
    });
    await database.projectMember.delete({
      where: {
        projectId_userId: { projectId: fixture.projectId, userId: fixture.editorUserId }
      }
    });
    const rejectedAfterRemoval = literatureService.appendAssertions({
      actor: fixture.actor,
      literatureId: fixture.literatureId,
      request: {
        provider: { providerKey: "crossref", recordKey: "record-1" },
        assertions: [{ kind: "title", value: "Rejected removed member write" }]
      }
    });

    // Then
    await expect(rejectedAfterRemoval).rejects.toMatchObject({ statusCode: 404 });
    const literature = await database.literature.findUniqueOrThrow({
      where: { id: fixture.literatureId },
      select: { nextAssertionOrdinal: true }
    });
    expect(literature.nextAssertionOrdinal).toBe(1);
  });
});
