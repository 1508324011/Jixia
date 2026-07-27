import type { PrismaClient } from "@jixia/db";
import { createPostgresIntegrationMigrationClient } from "@jixia/db/postgres-integration-environment";
import type {
  GetLiteratureResponse,
  ListLiteratureResponse
} from "@jixia/shared";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  createLiteratureHttpPostgresFixture,
  type LiteratureHttpPostgresFixture
} from "./literature.http.postgres-fixture.js";
import {
  corruptStructuredFingerprint,
  corruptStructuredPosition,
  seedStructuredLibraryAggregate
} from "./literature.library.postgres-fixture.js";
import { requireLiteraturePostgresEnvironment } from "./literature.postgres-environment.js";

const runPostgresIntegration = process.env.JIXIA_RUN_POSTGRES_INTEGRATION === "1";
const runPrefix = `t25l${process.pid}${Date.now()}`;
let fixture: LiteratureHttpPostgresFixture | undefined;
let prisma: PrismaClient | undefined;
let migrationPrisma: PrismaClient | undefined;

function requireFixture(): LiteratureHttpPostgresFixture {
  if (fixture === undefined) {
    throw new Error("Literature library HTTP fixture is not configured");
  }
  return fixture;
}

function requirePrisma(): PrismaClient {
  if (prisma === undefined) {
    throw new Error("Literature library Prisma client is not connected");
  }
  return prisma;
}

function requireMigrationPrisma(): PrismaClient {
  if (migrationPrisma === undefined) {
    throw new Error("Literature library migration client is not connected");
  }
  return migrationPrisma;
}

async function getLibrary(
  cookie: string,
  query: string
): Promise<{ readonly statusCode: number; readonly body: ListLiteratureResponse }> {
  const response = await requireFixture().app.inject({
    method: "GET",
    url: `/literature?${query}`,
    headers: { cookie }
  });
  return { statusCode: response.statusCode, body: response.json<ListLiteratureResponse>() };
}

describe.skipIf(!runPostgresIntegration)("Literature library HTTP PostgreSQL behavior", () => {
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

  it("paginates equal timestamps by descending id without duplicates or skips", async () => {
    const { cookies, ids } = requireFixture();
    const createdAt = new Date("2026-07-20T10:00:00.000Z");
    const literatureIds = ["a", "b", "c"].map((suffix) => `${runPrefix}-page-${suffix}`);
    await requirePrisma().literature.createMany({
      data: literatureIds.map((id) => ({
        id,
        ownerUserId: ids.ownerUserId,
        projectId: null,
        createdByUserId: ids.ownerUserId,
        createdAt
      }))
    });

    const first = await getLibrary(cookies.owner, "scope=personal&limit=2");
    expect(first.statusCode).toBe(200);
    expect(first.body.literature.map(({ id }) => id)).toEqual([
      `${runPrefix}-page-c`,
      `${runPrefix}-page-b`
    ]);
    expect(first.body.nextCursor).not.toBeNull();
    if (first.body.nextCursor === null) {
      throw new Error("Expected a PostgreSQL keyset cursor");
    }

    const second = await getLibrary(
      cookies.owner,
      `scope=personal&limit=2&cursor=${encodeURIComponent(first.body.nextCursor)}`
    );
    expect(second.statusCode).toBe(200);
    expect(second.body.literature.map(({ id }) => id)).toEqual([`${runPrefix}-page-a`]);
    expect(second.body.nextCursor).toBeNull();
    expect(new Set([
      ...first.body.literature.map(({ id }) => id),
      ...second.body.literature.map(({ id }) => id)
    ])).toEqual(new Set(literatureIds));

    const mismatched = await getLibrary(
      cookies.owner,
      `scope=personal&limit=1&cursor=${encodeURIComponent(first.body.nextCursor)}`
    );
    expect(mismatched.statusCode).toBe(400);
  });

  it("separates personal ownership and allows only active project members to list", async () => {
    const { cookies, ids } = requireFixture();
    const projectLiteratureId = `${runPrefix}-project-library`;
    await requirePrisma().literature.create({
      data: {
        id: projectLiteratureId,
        ownerUserId: null,
        projectId: ids.projectId,
        createdByUserId: ids.ownerUserId
      }
    });

    const personal = await getLibrary(cookies.owner, "scope=personal&limit=50");
    expect(personal.statusCode).toBe(200);
    expect(personal.body.literature.map(({ id }) => id)).not.toContain(projectLiteratureId);
    const viewer = await getLibrary(
      cookies.viewer,
      `scope=project&projectId=${encodeURIComponent(ids.projectId)}`
    );
    expect(viewer.statusCode).toBe(200);
    expect(viewer.body.literature.map(({ id }) => id)).toContain(projectLiteratureId);

    for (const cookie of [cookies.missingMember, cookies.wrongSpace, cookies.admin]) {
      const hidden = await getLibrary(
        cookie,
        `scope=project&projectId=${encodeURIComponent(ids.projectId)}`
      );
      expect(hidden.statusCode).toBe(404);
    }
    const otherPersonal = await getLibrary(cookies.otherUser, "scope=personal&limit=50");
    expect(otherPersonal.statusCode).toBe(200);
    expect(otherPersonal.body.literature).toEqual([]);
  });

  it("returns complete structured history and canonical conflict summaries", async () => {
    const { app, cookies, ids } = requireFixture();
    const literatureId = `${runPrefix}-structured`;
    await seedStructuredLibraryAggregate({
      prisma: requirePrisma(),
      literatureId,
      ownerUserId: ids.ownerUserId,
      prefix: `${runPrefix}-structured`
    });

    const listing = await getLibrary(cookies.owner, "scope=personal&limit=50");
    expect(listing.statusCode).toBe(200);
    const summary = listing.body.literature.find((item) => item.id === literatureId);
    expect(summary).toMatchObject({
      title: "Conflicting current title",
      authors: [
        { displayName: "Ada Lovelace", orcid: "0000-0000-0000-0001" },
        { displayName: "Grace Hopper" }
      ],
      provenanceCount: 3,
      conflictKinds: ["title"]
    });
    const response = await app.inject({
      method: "GET",
      url: `/literature/${literatureId}`,
      headers: { cookie: cookies.owner }
    });
    expect(response.statusCode).toBe(200);
    const detail = response.json<GetLiteratureResponse>();
    expect(detail.assertions).toHaveLength(14);
    expect(new Set(detail.assertions?.map(({ kind }) => kind))).toEqual(new Set([
      "title", "abstract", "publicationYear", "doi", "publicationDate", "venue",
      "publicationType", "authors", "identifiers", "openAccess", "publisher"
    ]));
    expect(detail.projection.title.current).toMatchObject({
      ordinal: 14,
      value: "Conflicting current title"
    });
  });

  it("sanitizes malformed structured fingerprints and child positions", async () => {
    const { app, cookies, ids } = requireFixture();
    const malformed = [
      {
        id: `${runPrefix}-bad-fingerprint`,
        corrupt: corruptStructuredFingerprint
      },
      {
        id: `${runPrefix}-bad-position`,
        corrupt: corruptStructuredPosition
      }
    ];
    for (const item of malformed) {
      await seedStructuredLibraryAggregate({
        prisma: requirePrisma(),
        literatureId: item.id,
        ownerUserId: ids.ownerUserId,
        prefix: item.id
      });
      await item.corrupt(requireMigrationPrisma(), item.id);
      const response = await app.inject({
        method: "GET",
        url: `/literature/${item.id}`,
        headers: { cookie: cookies.owner }
      });
      expect(response.statusCode).toBe(500);
      expect(response.json()).toEqual({ error: "Internal Server Error" });
    }
  });
});
