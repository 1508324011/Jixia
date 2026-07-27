import type { PrismaClient } from "@jixia/db";
import { Prisma } from "@jixia/db/generated";
import { createPostgresIntegrationMigrationClient } from "@jixia/db/postgres-integration-environment";
import type {
  AppendLiteratureAssertionsResponse,
  CreateLiteratureResponse,
  GetLiteratureResponse
} from "@jixia/shared";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  createLiteratureHttpPostgresFixture,
  type LiteratureHttpPostgresFixture
} from "./literature.http.postgres-fixture.js";
import { requireLiteraturePostgresEnvironment } from "./literature.postgres-environment.js";

const runPostgresIntegration = process.env.JIXIA_RUN_POSTGRES_INTEGRATION === "1";
const runPrefix = `t25h${process.pid}${Date.now()}`;

let fixture: LiteratureHttpPostgresFixture | undefined;
let prisma: PrismaClient | undefined;
let migrationPrisma: PrismaClient | undefined;

function requireFixture(): LiteratureHttpPostgresFixture {
  if (!fixture) {
    throw new Error("Literature HTTP PostgreSQL fixture is not configured");
  }
  return fixture;
}

function requirePrisma(): PrismaClient {
  if (!prisma) {
    throw new Error("Literature HTTP PostgreSQL Prisma client is not connected");
  }
  return prisma;
}

function requireMigrationPrisma(): PrismaClient {
  if (!migrationPrisma) {
    throw new Error("Literature HTTP PostgreSQL migration Prisma client is not connected");
  }
  return migrationPrisma;
}

async function createPersonalLiterature(cookie: string): Promise<string> {
  const response = await requireFixture().app.inject({
    method: "POST",
    url: "/literature",
    headers: { cookie },
    payload: { scope: "personal" }
  });
  if (response.statusCode !== 201) {
    throw new Error("Personal Literature setup failed");
  }
  return response.json<CreateLiteratureResponse>().literature.id;
}

async function appendTitle(cookie: string, literatureId: string, value: string): Promise<void> {
  const response = await requireFixture().app.inject({
    method: "POST",
    url: `/literature/${literatureId}/assertions`,
    headers: { cookie },
    payload: {
      provider: { providerKey: "crossref", recordKey: "record-1" },
      assertions: [{ kind: "title", value }]
    }
  });
  if (response.statusCode !== 201) {
    throw new Error("Literature title setup failed");
  }
}

describe.skipIf(!runPostgresIntegration)("Literature HTTP PostgreSQL behavior", () => {
  beforeAll(async () => {
    requireLiteraturePostgresEnvironment();
    const database = await import("@jixia/db");
    prisma = database.prisma;
    migrationPrisma = createPostgresIntegrationMigrationClient();
    fixture = await createLiteratureHttpPostgresFixture(database.prisma, runPrefix);
  });

  afterAll(async () => {
    await fixture?.app.close();
    await migrationPrisma?.$disconnect();
    await prisma?.$disconnect();
  });

  it("requires a real authenticated session", async () => {
    // Given
    const app = requireFixture().app;

    // When
    const response = await app.inject({
      method: "POST",
      url: "/literature",
      payload: { scope: "personal" }
    });

    // Then
    expect(response.statusCode).toBe(401);
    expect(response.json()).toEqual({ error: "Authentication required" });
  });

  it("derives personal ownership from the logged-in user", async () => {
    // Given
    const { app, cookies } = requireFixture();

    // When
    const response = await app.inject({
      method: "POST",
      url: "/literature",
      headers: { cookie: cookies.owner },
      payload: { scope: "personal" }
    });

    // Then
    expect(response.statusCode).toBe(201);
    expect(response.json<CreateLiteratureResponse>().literature.scope).toEqual({
      kind: "personal",
      ownerUserId: `${runPrefix}-user-owner`
    });
  });

  it("normalizes and canonically orders assertions through HTTP", async () => {
    // Given
    const { app, cookies } = requireFixture();
    const literatureId = await createPersonalLiterature(cookies.owner);

    // When
    const response = await app.inject({
      method: "POST",
      url: `/literature/${literatureId}/assertions`,
      headers: { cookie: cookies.owner },
      payload: {
        provider: { providerKey: "CrossRef", recordKey: "record-1" },
        assertions: [
          { kind: "doi", value: "https://doi.org/10.1000/EXAMPLE" },
          { kind: "title", value: "First  title" }
        ]
      }
    });

    // Then
    expect(response.statusCode).toBe(201);
    const body = response.json<AppendLiteratureAssertionsResponse>();
    expect(body.providerRecord.providerKey).toBe("crossref");
    expect(body.assertions.map(({ kind, ordinal, value }) => ({ kind, ordinal, value }))).toEqual([
      { kind: "title", ordinal: 1, value: "First title" },
      { kind: "doi", ordinal: 2, value: "10.1000/example" }
    ]);
  });

  it("returns deterministic current, history, conflicts, and provenance", async () => {
    // Given
    const { app, cookies } = requireFixture();
    const literatureId = await createPersonalLiterature(cookies.owner);
    await appendTitle(cookies.owner, literatureId, "Earlier title");
    await appendTitle(cookies.owner, literatureId, "Current title");

    // When
    const response = await app.inject({
      method: "GET",
      url: `/literature/${literatureId}`,
      headers: { cookie: cookies.owner }
    });

    // Then
    expect(response.statusCode).toBe(200);
    const title = response.json<GetLiteratureResponse>().projection.title;
    expect(title.current).toMatchObject({ ordinal: 2, value: "Current title" });
    expect(title.history.map(({ ordinal, value }) => ({ ordinal, value }))).toEqual([
      { ordinal: 1, value: "Earlier title" },
      { ordinal: 2, value: "Current title" }
    ]);
    expect(title.conflicts).toHaveLength(1);
    expect(title.conflicts[0]).toMatchObject({ ordinal: 1, value: "Earlier title" });
  });

  it("fails closed for another personal owner", async () => {
    // Given
    const { app, cookies } = requireFixture();
    const literatureId = await createPersonalLiterature(cookies.owner);

    // When
    const response = await app.inject({
      method: "GET",
      url: `/literature/${literatureId}`,
      headers: { cookie: cookies.otherUser }
    });

    // Then
    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({ error: "Not found" });
  });

  it("fails closed on cross-owner append without any mutation", async () => {
    // Given
    const { app, cookies } = requireFixture();
    const database = requirePrisma();
    const literatureId = await createPersonalLiterature(cookies.owner);
    const before = await database.$transaction([
      database.providerRecord.count({ where: { literatureId } }),
      database.assertion.count({ where: { literatureId } }),
      database.auditEvent.count({ where: { targetId: literatureId } }),
      database.literature.findUniqueOrThrow({ where: { id: literatureId } })
    ]);

    // When
    const response = await app.inject({
      method: "POST",
      url: `/literature/${literatureId}/assertions`,
      headers: { cookie: cookies.otherUser },
      payload: {
        provider: { providerKey: "crossref", recordKey: "cross-owner-record" },
        assertions: [{ kind: "title", value: "Rejected cross-owner write" }]
      }
    });

    // Then
    const after = await database.$transaction([
      database.providerRecord.count({ where: { literatureId } }),
      database.assertion.count({ where: { literatureId } }),
      database.auditEvent.count({ where: { targetId: literatureId } }),
      database.literature.findUniqueOrThrow({ where: { id: literatureId } })
    ]);
    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({ error: "Not found" });
    expect(after).toEqual(before);
  });

  it("rejects provider-native payloads before persistence", async () => {
    // Given
    const { app, cookies } = requireFixture();
    const database = requirePrisma();
    const literatureId = await createPersonalLiterature(cookies.owner);

    // When
    const response = await app.inject({
      method: "POST",
      url: `/literature/${literatureId}/assertions`,
      headers: { cookie: cookies.owner },
      payload: {
        provider: { providerKey: "crossref", recordKey: "record-1", nativePayload: {} },
        assertions: [{ kind: "title", value: "Rejected" }]
      }
    });

    // Then
    expect(response.statusCode).toBe(400);
    expect(await database.providerRecord.count({ where: { literatureId } })).toBe(0);
    expect(await database.assertion.count({ where: { literatureId } })).toBe(0);
  });

  it("returns a generic 500 and rolls back when audit persistence fails", async () => {
    // Given
    const { app, cookies } = requireFixture();
    const database = requirePrisma();
    const migrationDatabase = requireMigrationPrisma();
    const literatureId = await createPersonalLiterature(cookies.owner);
    await migrationDatabase.$executeRaw(Prisma.sql`
      CREATE FUNCTION task25_http_reject_audit() RETURNS trigger LANGUAGE plpgsql AS $$
      BEGIN
        IF NEW."action" = 'literature.assertions_appended' THEN
          RAISE EXCEPTION 'forced HTTP audit failure';
        END IF;
        RETURN NEW;
      END;
      $$
    `);
    await migrationDatabase.$executeRaw(Prisma.sql`
      CREATE TRIGGER task25_http_reject_audit_trigger
      BEFORE INSERT ON "AuditEvent"
      FOR EACH ROW EXECUTE FUNCTION task25_http_reject_audit()
    `);

    // When
    const response = await app.inject({
      method: "POST",
      url: `/literature/${literatureId}/assertions`,
      headers: { cookie: cookies.owner },
      payload: {
        provider: { providerKey: "crossref", recordKey: "record-1" },
        assertions: [{ kind: "title", value: "Must roll back" }]
      }
    });

    // Then
    await migrationDatabase.$executeRaw(
      Prisma.sql`DROP TRIGGER task25_http_reject_audit_trigger ON "AuditEvent"`
    );
    await migrationDatabase.$executeRaw(Prisma.sql`DROP FUNCTION task25_http_reject_audit()`);
    expect(response.statusCode).toBe(500);
    expect(response.json()).toEqual({ error: "Internal Server Error" });
    expect(await database.providerRecord.count({ where: { literatureId } })).toBe(0);
    expect(await database.assertion.count({ where: { literatureId } })).toBe(0);
    expect(
      await database.literature.findUniqueOrThrow({
        where: { id: literatureId },
        select: { nextAssertionOrdinal: true }
      })
    ).toEqual({ nextAssertionOrdinal: 1 });
  });
});
