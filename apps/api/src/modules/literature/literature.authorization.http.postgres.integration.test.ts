import type { PrismaClient } from "@jixia/db";
import type { CreateLiteratureResponse } from "@jixia/shared";
import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  createLiteratureHttpPostgresFixture,
  type LiteratureHttpPostgresFixture
} from "./literature.http.postgres-fixture.js";
import { requireLiteraturePostgresEnvironment } from "./literature.postgres-environment.js";

const runPostgresIntegration = process.env.JIXIA_RUN_POSTGRES_INTEGRATION === "1";
const runPrefix = `t25a${process.pid}${Date.now()}`;

let fixture: LiteratureHttpPostgresFixture | undefined;
let prisma: PrismaClient | undefined;
let projectLiteratureId: string | undefined;

function requireFixture(): LiteratureHttpPostgresFixture {
  if (!fixture) {
    throw new Error("Literature authorization PostgreSQL fixture is not configured");
  }
  return fixture;
}

function requirePrisma(): PrismaClient {
  if (!prisma) {
    throw new Error("Literature authorization PostgreSQL Prisma client is not connected");
  }
  return prisma;
}

function requireProjectLiteratureId(): string {
  if (!projectLiteratureId) {
    throw new Error("Project Literature setup is missing");
  }
  return projectLiteratureId;
}

describe.skipIf(!runPostgresIntegration)("Literature HTTP PostgreSQL authorization", () => {
  beforeAll(async () => {
    requireLiteraturePostgresEnvironment();
    const database = await import("@jixia/db");
    prisma = database.prisma;
    fixture = await createLiteratureHttpPostgresFixture(database.prisma, runPrefix);
    const setup = requireFixture();
    const response = await setup.app.inject({
      method: "POST",
      url: "/literature",
      headers: { cookie: setup.cookies.owner },
      payload: { scope: "project", projectId: setup.ids.projectId }
    });
    if (response.statusCode !== 201) {
      throw new Error("Project Literature setup failed");
    }
    projectLiteratureId = response.json<CreateLiteratureResponse>().literature.id;
  });

  afterAll(async () => {
    await fixture?.app.close();
    await prisma?.$disconnect();
  });

  it.each(["owner", "editor"] as const)("allows a project %s to create Literature", async (actor) => {
    // Given
    const { app, cookies, ids } = requireFixture();

    // When
    const response = await app.inject({
      method: "POST",
      url: "/literature",
      headers: { cookie: cookies[actor] },
      payload: { scope: "project", projectId: ids.projectId }
    });

    // Then
    expect(response.statusCode).toBe(201);
    expect(response.json<CreateLiteratureResponse>().literature.scope).toEqual({
      kind: "project",
      projectId: ids.projectId
    });
  });

  it.each([
    ["viewer", 403],
    ["missingMember", 404],
    ["admin", 404],
    ["wrongSpace", 404]
  ] as const)("rejects project creation for %s", async (actor, expectedStatus) => {
    // Given
    const { app, cookies, ids } = requireFixture();

    // When
    const response = await app.inject({
      method: "POST",
      url: "/literature",
      headers: { cookie: cookies[actor] },
      payload: { scope: "project", projectId: ids.projectId }
    });

    // Then
    expect(response.statusCode).toBe(expectedStatus);
  });

  it("allows an explicit project Viewer to read", async () => {
    // Given
    const { app, cookies } = requireFixture();

    // When
    const response = await app.inject({
      method: "GET",
      url: `/literature/${requireProjectLiteratureId()}`,
      headers: { cookie: cookies.viewer }
    });

    // Then
    expect(response.statusCode).toBe(200);
  });

  it("forbids a project Viewer from appending", async () => {
    // Given
    const { app, cookies } = requireFixture();

    // When
    const response = await app.inject({
      method: "POST",
      url: `/literature/${requireProjectLiteratureId()}/assertions`,
      headers: { cookie: cookies.viewer },
      payload: {
        provider: { providerKey: "crossref", recordKey: "viewer-record" },
        assertions: [{ kind: "title", value: "Rejected Viewer write" }]
      }
    });

    // Then
    expect(response.statusCode).toBe(403);
  });

  it.each(["owner", "editor"] as const)("allows a project %s to append", async (actor) => {
    // Given
    const { app, cookies } = requireFixture();

    // When
    const response = await app.inject({
      method: "POST",
      url: `/literature/${requireProjectLiteratureId()}/assertions`,
      headers: { cookie: cookies[actor] },
      payload: {
        provider: { providerKey: "crossref", recordKey: `${actor}-record` },
        assertions: [{ kind: "title", value: `${actor} title` }]
      }
    });

    // Then
    expect(response.statusCode).toBe(201);
  });

  it.each(["missingMember", "otherUser", "admin", "wrongSpace"] as const)(
    "fails closed on read for %s",
    async (actor) => {
      // Given
      const { app, cookies } = requireFixture();

      // When
      const response = await app.inject({
        method: "GET",
        url: `/literature/${requireProjectLiteratureId()}`,
        headers: { cookie: cookies[actor] }
      });

      // Then
      expect(response.statusCode).toBe(404);
      expect(response.json()).toEqual({ error: "Not found" });
    }
  );

  it("fails closed on wrong-space append without any mutation", async () => {
    // Given
    const { app, cookies } = requireFixture();
    const database = requirePrisma();
    const literatureId = requireProjectLiteratureId();
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
      headers: { cookie: cookies.wrongSpace },
      payload: {
        provider: { providerKey: "crossref", recordKey: "wrong-space-record" },
        assertions: [{ kind: "title", value: "Rejected wrong-space write" }]
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

  it("fails closed after the actor's project-space membership is removed", async () => {
    // Given
    const { app, cookies, ids } = requireFixture();
    await requirePrisma().spaceMember.delete({
      where: {
        spaceId_userId: { spaceId: ids.spaceId, userId: ids.removableUserId }
      }
    });

    // When
    const response = await app.inject({
      method: "POST",
      url: `/literature/${requireProjectLiteratureId()}/assertions`,
      headers: { cookie: cookies.removableMember },
      payload: {
        provider: { providerKey: "crossref", recordKey: "removed-record" },
        assertions: [{ kind: "title", value: "Rejected removed write" }]
      }
    });

    // Then
    expect(response.statusCode).toBe(404);
    expect(response.json()).toEqual({ error: "Not found" });
  });
});
