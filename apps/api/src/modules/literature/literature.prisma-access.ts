import { Prisma } from "@jixia/db/generated";

import type { LiteratureRecord } from "./literature.repository.js";
import type { ProjectAccessScope } from "./literature.transaction.js";

export async function findLockedLiterature(
  transaction: Prisma.TransactionClient,
  literatureId: string
): Promise<LiteratureRecord | null> {
  const [literature] = await transaction.$queryRaw<readonly LiteratureRecord[]>(Prisma.sql`
    SELECT "id", "ownerUserId", "projectId", "createdByUserId", "createdAt"
    FROM "Literature"
    WHERE "id" = ${literatureId}
    FOR UPDATE
  `);
  return literature ?? null;
}

export async function findLockedProjectAccess(
  transaction: Prisma.TransactionClient,
  input: { readonly projectId: string; readonly userId: string }
): Promise<ProjectAccessScope | null> {
  const [project] = await transaction.$queryRaw<
    readonly { readonly id: string; readonly spaceId: string }[]
  >(Prisma.sql`
    SELECT "id", "spaceId"
    FROM "Project"
    WHERE "id" = ${input.projectId}
    FOR UPDATE
  `);
  if (project === undefined) {
    return null;
  }

  const [spaceMember] = await transaction.$queryRaw<
    readonly { readonly userId: string }[]
  >(Prisma.sql`
    SELECT "userId"
    FROM "SpaceMember"
    WHERE "spaceId" = ${project.spaceId} AND "userId" = ${input.userId}
    FOR UPDATE
  `);
  const [projectMember] = await transaction.$queryRaw<
    readonly { readonly role: string }[]
  >(Prisma.sql`
    SELECT "role"::text AS "role"
    FROM "ProjectMember"
    WHERE "projectId" = ${project.id} AND "userId" = ${input.userId}
    FOR UPDATE
  `);

  return {
    kind: "project",
    projectId: project.id,
    projectSpaceId: project.spaceId,
    activeSpaceMember: spaceMember !== undefined,
    projectRole: projectMember === undefined ? null : parseProjectRole(projectMember.role)
  };
}

function parseProjectRole(role: string): ProjectAccessScope["projectRole"] {
  switch (role) {
    case "ProjectOwner":
    case "ProjectEditor":
    case "ProjectViewer":
      return role;
    default:
      return null;
  }
}
