import type { PrismaClient } from "@jixia/db";
import { Prisma } from "@jixia/db/generated";

import type { ProviderAssertionBatch } from "./literature.import-repository.js";
import type { LiteratureActor } from "./literature.repository.js";
import type { LiteratureImportAuditAction } from "./literature.import-audit.js";

export type ImportActorFixture = {
  readonly owner: LiteratureActor;
  readonly editor: LiteratureActor;
  readonly viewer: LiteratureActor;
  readonly outsider: LiteratureActor;
  readonly projectId: string;
  readonly spaceId: string;
};

export async function seedImportActors(
  prisma: PrismaClient,
  prefix: string
): Promise<ImportActorFixture> {
  const ownerUserId = `${prefix}-owner`;
  const editorUserId = `${prefix}-editor`;
  const viewerUserId = `${prefix}-viewer`;
  const outsiderUserId = `${prefix}-outsider`;
  const spaceId = `${prefix}-space`;
  const outsiderSpaceId = `${prefix}-outsider-space`;
  const projectId = `${prefix}-project`;
  const updatedAt = new Date();
  await prisma.user.createMany({
    data: [ownerUserId, editorUserId, viewerUserId, outsiderUserId].map((userId) => ({
      id: userId,
      email: `${userId}@task25.test`,
      displayName: userId,
      passwordHash: "hash",
      updatedAt
    }))
  });
  await prisma.space.createMany({
    data: [
      { id: spaceId, name: prefix, updatedAt },
      { id: outsiderSpaceId, name: `${prefix}-outsider`, updatedAt }
    ]
  });
  await prisma.spaceMember.createMany({
    data: [
      { id: `${prefix}-sm-owner`, spaceId, userId: ownerUserId, role: "SpaceMember" },
      { id: `${prefix}-sm-editor`, spaceId, userId: editorUserId, role: "SpaceMember" },
      { id: `${prefix}-sm-viewer`, spaceId, userId: viewerUserId, role: "SpaceMember" },
      {
        id: `${prefix}-sm-outsider`,
        spaceId: outsiderSpaceId,
        userId: outsiderUserId,
        role: "SpaceMember"
      }
    ]
  });
  await prisma.project.create({
    data: {
      id: projectId,
      spaceId,
      name: prefix,
      createdByUserId: ownerUserId,
      updatedAt
    }
  });
  await prisma.projectMember.createMany({
    data: [
      {
        id: `${prefix}-pm-owner`,
        projectId,
        userId: ownerUserId,
        role: "ProjectOwner"
      },
      {
        id: `${prefix}-pm-editor`,
        projectId,
        userId: editorUserId,
        role: "ProjectEditor"
      },
      {
        id: `${prefix}-pm-viewer`,
        projectId,
        userId: viewerUserId,
        role: "ProjectViewer"
      }
    ]
  });
  return {
    owner: { userId: ownerUserId, spaceId, spaceRole: "SpaceMember" },
    editor: { userId: editorUserId, spaceId, spaceRole: "SpaceMember" },
    viewer: { userId: viewerUserId, spaceId, spaceRole: "SpaceMember" },
    outsider: {
      userId: outsiderUserId,
      spaceId: outsiderSpaceId,
      spaceRole: "SpaceMember"
    },
    projectId,
    spaceId
  };
}

export function completeImportBatch(input: {
  readonly providerKey: "openalex" | "crossref" | "pubmed";
  readonly recordKey: string;
  readonly doi: string;
}): ProviderAssertionBatch {
  return {
    source: { providerKey: input.providerKey, recordKey: input.recordKey },
    assertions: [
      { kind: "title", value: "Canonical title" },
      { kind: "abstract", value: "Canonical abstract" },
      { kind: "publicationYear", value: 2026 },
      { kind: "doi", value: input.doi },
      { kind: "publicationDate", value: "2026-07-20" },
      { kind: "venue", value: "Canonical venue" },
      { kind: "publicationType", value: "article" },
      {
        kind: "authors",
        value: [
          { displayName: "Ada Lovelace", orcid: "0000-0000-0000-0001" },
          { displayName: "Grace Hopper" }
        ]
      },
      {
        kind: "identifiers",
        value: [
          { scheme: "pmid", value: "2" },
          { scheme: "doi", value: input.doi },
          { scheme: "pmid", value: "2" }
        ]
      },
      {
        kind: "openAccess",
        value: {
          isOpenAccess: true,
          bestUrl: "https://example.test/article",
          license: "cc-by",
          version: "published",
          hostType: "publisher"
        }
      },
      {
        kind: "publisher",
        value: { name: "Canonical publisher", landingPageUrl: "https://example.test" }
      }
    ]
  };
}

export async function installImportAuditFailure(
  prisma: PrismaClient,
  action: LiteratureImportAuditAction
): Promise<void> {
  await removeImportAuditFailure(prisma);
  const definition = auditFailureDefinition(action);
  await prisma.$executeRaw(definition);
  await prisma.$executeRaw(Prisma.sql`
    CREATE TRIGGER task25_reject_import_audit_trigger
    BEFORE INSERT ON "AuditEvent"
    FOR EACH ROW EXECUTE FUNCTION task25_reject_import_audit()
  `);
}

function auditFailureDefinition(action: LiteratureImportAuditAction): Prisma.Sql {
  switch (action) {
    case "literature.import_started":
      return Prisma.sql`
        CREATE FUNCTION task25_reject_import_audit() RETURNS trigger LANGUAGE plpgsql AS $$
        BEGIN
          IF NEW."action" = 'literature.import_started' THEN
            RAISE EXCEPTION 'forced import audit failure';
          END IF;
          RETURN NEW;
        END;
        $$
      `;
    case "literature.import_succeeded":
      return Prisma.sql`
        CREATE FUNCTION task25_reject_import_audit() RETURNS trigger LANGUAGE plpgsql AS $$
        BEGIN
          IF NEW."action" = 'literature.import_succeeded' THEN
            RAISE EXCEPTION 'forced import audit failure';
          END IF;
          RETURN NEW;
        END;
        $$
      `;
    case "literature.import_failed":
      return Prisma.sql`
        CREATE FUNCTION task25_reject_import_audit() RETURNS trigger LANGUAGE plpgsql AS $$
        BEGIN
          IF NEW."action" = 'literature.import_failed' THEN
            RAISE EXCEPTION 'forced import audit failure';
          END IF;
          RETURN NEW;
        END;
        $$
      `;
    default: {
      const unreachable: never = action;
      throw unreachable;
    }
  }
}

export async function removeImportAuditFailure(prisma: PrismaClient): Promise<void> {
  await prisma.$executeRaw(
    Prisma.sql`DROP TRIGGER IF EXISTS task25_reject_import_audit_trigger ON "AuditEvent"`
  );
  await prisma.$executeRaw(Prisma.sql`DROP FUNCTION IF EXISTS task25_reject_import_audit()`);
}
