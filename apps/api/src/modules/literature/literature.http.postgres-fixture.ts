import type { PrismaClient } from "@jixia/db";
import type { FastifyInstance } from "fastify";

import { createTestApiApp } from "../../test-utils/app.js";
import { PrismaAuthRepository } from "../auth/prisma-repository.js";
import { hashPassword } from "../auth/passwords.js";
import { createAuthService } from "../auth/service.js";
import type { AuditService } from "../audit/audit.service.js";
import type { LiteratureDiscoveryService } from "./discovery/discovery.service.js";
import { createPrismaLiteratureRepository } from "./literature.prisma-repository.js";
import { createLiteratureLibraryCursorCodec } from "./literature.library-cursor.js";
import type { LiteratureImportService } from "./literature.import-service.js";
import { createLiteratureService } from "./literature.service.js";

const sessionCookieName = "task25_http_session";
const password = "task25-http-password";

export type LiteratureHttpPostgresFixture = {
  readonly app: FastifyInstance;
  readonly cookies: {
    readonly admin: string;
    readonly editor: string;
    readonly missingMember: string;
    readonly otherUser: string;
    readonly owner: string;
    readonly removableMember: string;
    readonly viewer: string;
    readonly wrongSpace: string;
  };
  readonly ids: {
    readonly projectId: string;
    readonly ownerUserId: string;
    readonly otherUserId: string;
    readonly removableUserId: string;
    readonly spaceId: string;
  };
};

export type LiteratureHttpPostgresServices = {
  readonly auditService?: AuditService;
  readonly discoveryService?: LiteratureDiscoveryService;
  readonly importService?: LiteratureImportService;
};

function emailFor(prefix: string, label: string): string {
  return `${label}.${prefix}@example.test`;
}

async function loginCookie(app: FastifyInstance, email: string): Promise<string> {
  const response = await app.inject({
    method: "POST",
    url: "/auth/login",
    payload: { email, password }
  });
  if (response.statusCode !== 200) {
    throw new Error(`PostgreSQL HTTP fixture login failed for ${email}`);
  }
  const header = response.headers["set-cookie"];
  const cookieHeader = Array.isArray(header) ? header[0] : header;
  const cookie = typeof cookieHeader === "string" ? (cookieHeader.split(";")[0] ?? "") : "";
  if (!cookie) {
    throw new Error(`PostgreSQL HTTP fixture login did not set a cookie for ${email}`);
  }
  return cookie;
}

export async function createLiteratureHttpPostgresFixture(
  prisma: PrismaClient,
  prefix: string,
  services: LiteratureHttpPostgresServices = {}
): Promise<LiteratureHttpPostgresFixture> {
  const ids = {
    spaceId: `${prefix}-space-a`,
    otherSpaceId: `${prefix}-space-b`,
    projectId: `${prefix}-project-a`,
    otherProjectId: `${prefix}-project-b`,
    ownerUserId: `${prefix}-user-owner`,
    editorUserId: `${prefix}-user-editor`,
    viewerUserId: `${prefix}-user-viewer`,
    missingUserId: `${prefix}-user-missing`,
    adminUserId: `${prefix}-user-admin`,
    wrongSpaceUserId: `${prefix}-user-wrong-space`,
    removableUserId: `${prefix}-user-removable`,
    otherUserId: `${prefix}-user-other`
  };
  const passwordHash = await hashPassword(password);
  const firstMembershipAt = new Date("2026-07-17T00:00:00.000Z");
  const secondMembershipAt = new Date("2026-07-17T00:01:00.000Z");

  await prisma.user.createMany({
    data: [
      { id: ids.ownerUserId, email: emailFor(prefix, "owner"), displayName: "Owner", passwordHash },
      { id: ids.editorUserId, email: emailFor(prefix, "editor"), displayName: "Editor", passwordHash },
      { id: ids.viewerUserId, email: emailFor(prefix, "viewer"), displayName: "Viewer", passwordHash },
      { id: ids.missingUserId, email: emailFor(prefix, "missing"), displayName: "Missing", passwordHash },
      { id: ids.adminUserId, email: emailFor(prefix, "admin"), displayName: "Admin", passwordHash },
      {
        id: ids.wrongSpaceUserId,
        email: emailFor(prefix, "wrong-space"),
        displayName: "Wrong Space",
        passwordHash
      },
      {
        id: ids.removableUserId,
        email: emailFor(prefix, "removable"),
        displayName: "Removable",
        passwordHash
      },
      { id: ids.otherUserId, email: emailFor(prefix, "other"), displayName: "Other", passwordHash }
    ]
  });
  await prisma.space.createMany({
    data: [
      { id: ids.spaceId, name: "Task25 Space A" },
      { id: ids.otherSpaceId, name: "Task25 Space B" }
    ]
  });
  await prisma.spaceMember.createMany({
    data: [
      { id: `${prefix}-sm-owner`, spaceId: ids.spaceId, userId: ids.ownerUserId, role: "SpaceMember", createdAt: firstMembershipAt },
      { id: `${prefix}-sm-editor`, spaceId: ids.spaceId, userId: ids.editorUserId, role: "SpaceMember", createdAt: firstMembershipAt },
      { id: `${prefix}-sm-viewer`, spaceId: ids.spaceId, userId: ids.viewerUserId, role: "SpaceMember", createdAt: firstMembershipAt },
      { id: `${prefix}-sm-missing`, spaceId: ids.spaceId, userId: ids.missingUserId, role: "SpaceMember", createdAt: firstMembershipAt },
      { id: `${prefix}-sm-admin`, spaceId: ids.spaceId, userId: ids.adminUserId, role: "SpaceAdmin", createdAt: firstMembershipAt },
      { id: `${prefix}-sm-wrong`, spaceId: ids.otherSpaceId, userId: ids.wrongSpaceUserId, role: "SpaceMember", createdAt: firstMembershipAt },
      { id: `${prefix}-sm-removable-a`, spaceId: ids.spaceId, userId: ids.removableUserId, role: "SpaceMember", createdAt: firstMembershipAt },
      { id: `${prefix}-sm-removable-b`, spaceId: ids.otherSpaceId, userId: ids.removableUserId, role: "SpaceMember", createdAt: secondMembershipAt },
      { id: `${prefix}-sm-other`, spaceId: ids.spaceId, userId: ids.otherUserId, role: "SpaceMember", createdAt: firstMembershipAt }
    ]
  });
  await prisma.project.createMany({
    data: [
      { id: ids.projectId, spaceId: ids.spaceId, name: "Task25 Project A", createdByUserId: ids.ownerUserId },
      { id: ids.otherProjectId, spaceId: ids.spaceId, name: "Task25 Project B", createdByUserId: ids.otherUserId }
    ]
  });
  await prisma.projectMember.createMany({
    data: [
      { id: `${prefix}-pm-owner`, projectId: ids.projectId, userId: ids.ownerUserId, role: "ProjectOwner" },
      { id: `${prefix}-pm-editor`, projectId: ids.projectId, userId: ids.editorUserId, role: "ProjectEditor" },
      { id: `${prefix}-pm-viewer`, projectId: ids.projectId, userId: ids.viewerUserId, role: "ProjectViewer" },
      { id: `${prefix}-pm-wrong`, projectId: ids.projectId, userId: ids.wrongSpaceUserId, role: "ProjectEditor" },
      { id: `${prefix}-pm-removable`, projectId: ids.projectId, userId: ids.removableUserId, role: "ProjectEditor" },
      { id: `${prefix}-pm-other`, projectId: ids.otherProjectId, userId: ids.otherUserId, role: "ProjectOwner" }
    ]
  });

  const authService = createAuthService(new PrismaAuthRepository(prisma));
  const literatureService = createLiteratureService(createPrismaLiteratureRepository(prisma), {
    libraryCursorCodec: createLiteratureLibraryCursorCodec({
      secret: "task25-http-library-cursor-secret-32-bytes"
    })
  });
  const app = await createTestApiApp({
    audit: {
      authService,
      nodeEnv: "test",
      sessionCookieName,
      ...(services.auditService === undefined ? {} : { auditService: services.auditService })
    },
    auth: { nodeEnv: "test", service: authService, sessionCookieName },
    literature: {
      authService,
      literatureService,
      nodeEnv: "test",
      sessionCookieName,
      ...(services.discoveryService === undefined
        ? {}
        : { discoveryService: services.discoveryService }),
      ...(services.importService === undefined ? {} : { importService: services.importService })
    }
  });

  return {
    app,
    cookies: {
      admin: await loginCookie(app, emailFor(prefix, "admin")),
      editor: await loginCookie(app, emailFor(prefix, "editor")),
      missingMember: await loginCookie(app, emailFor(prefix, "missing")),
      otherUser: await loginCookie(app, emailFor(prefix, "other")),
      owner: await loginCookie(app, emailFor(prefix, "owner")),
      removableMember: await loginCookie(app, emailFor(prefix, "removable")),
      viewer: await loginCookie(app, emailFor(prefix, "viewer")),
      wrongSpace: await loginCookie(app, emailFor(prefix, "wrong-space"))
    },
    ids: {
      projectId: ids.projectId,
      ownerUserId: ids.ownerUserId,
      otherUserId: ids.otherUserId,
      removableUserId: ids.removableUserId,
      spaceId: ids.spaceId
    }
  };
}
