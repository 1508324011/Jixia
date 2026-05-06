import {
  type Prisma,
  type Project,
  type ProjectMember,
  type ProjectRole,
  type ProjectStatus,
} from '@prisma/client';

import type { JixiaPrismaClient } from '../client';

export interface CreateProjectParams {
  description?: string;
  id?: string;
  name: string;
  spaceId: string;
  status?: PersistedProjectStatus;
}

export interface AddProjectMemberParams {
  role: PersistedProjectRole;
  userId: string;
}

export type PersistedProjectStatus = 'active' | 'archived';

export type PersistedProjectRole = 'owner' | 'editor' | 'viewer';

export interface PersistedProjectRecord {
  createdAt: string;
  createdByUserId: string;
  description?: string;
  id: string;
  name: string;
  spaceId: string;
  status: PersistedProjectStatus;
  updatedAt: string;
}

export interface PersistedProjectMemberRecord {
  joinedAt: string;
  projectId: string;
  role: PersistedProjectRole;
  userId: string;
}

export interface PersistedProjectWithMembership {
  membership: PersistedProjectMemberRecord;
  project: PersistedProjectRecord;
}

export interface ProjectRepository {
  addProjectMember(
    projectId: string,
    input: AddProjectMemberParams,
  ): Promise<PersistedProjectMemberRecord>;
  createProject(
    input: CreateProjectParams,
    actorUserId: string,
  ): Promise<PersistedProjectWithMembership>;
  findProject(projectId: string): Promise<PersistedProjectRecord | null>;
  getProjectForActor(
    projectId: string,
    actorUserId: string,
  ): Promise<PersistedProjectWithMembership | null>;
  getProjectMember(
    projectId: string,
    userId: string,
  ): Promise<PersistedProjectMemberRecord | null>;
  listProjectMembers(projectId: string): Promise<PersistedProjectMemberRecord[]>;
  listProjectsForActor(
    actorUserId: string,
  ): Promise<PersistedProjectWithMembership[]>;
}

type TransactionClient = Prisma.TransactionClient;

type ProjectClient = JixiaPrismaClient | TransactionClient;

const PROJECT_INCLUDE_MEMBERS = {
  members: true,
} satisfies Prisma.ProjectInclude;

type ProjectWithMembers = Prisma.ProjectGetPayload<{
  include: typeof PROJECT_INCLUDE_MEMBERS;
}>;

function toIsoString(value: Date): string {
  return value.toISOString();
}

function mapProject(project: Project): PersistedProjectRecord {
  return {
    createdAt: toIsoString(project.createdAt),
    createdByUserId: project.createdByUserId,
    description: project.description ?? undefined,
    id: project.id,
    name: project.name,
    spaceId: project.spaceId,
    status: project.status,
    updatedAt: toIsoString(project.updatedAt),
  };
}

function mapProjectMember(
  membership: ProjectMember,
): PersistedProjectMemberRecord {
  return {
    joinedAt: toIsoString(membership.joinedAt),
    projectId: membership.projectId,
    role: membership.role,
    userId: membership.userId,
  };
}

function mapProjectWithMembership(
  project: ProjectWithMembers,
  userId: string,
): PersistedProjectWithMembership | null {
  const membership = project.members.find(
    (candidate) => candidate.userId === userId,
  );

  if (!membership) {
    return null;
  }

  return {
    membership: mapProjectMember(membership),
    project: mapProject(project),
  };
}

async function ensureUser(
  prisma: ProjectClient,
  userId: string,
): Promise<void> {
  await prisma.user.upsert({
    create: {
      displayName: userId,
      email: `${userId}@jixia.local`,
      id: userId,
    },
    update: {},
    where: { id: userId },
  });
}

async function ensureSpace(
  prisma: ProjectClient,
  spaceId: string,
): Promise<void> {
  await prisma.space.upsert({
    create: {
      id: spaceId,
      kind: 'shared',
      name: spaceId,
    },
    update: {},
    where: { id: spaceId },
  });
}

async function ensureProjectRelations(
  prisma: ProjectClient,
  input: { spaceId: string; userId: string },
): Promise<void> {
  await ensureUser(prisma, input.userId);
  await ensureSpace(prisma, input.spaceId);
}

export async function initializeProjectPersistence(
  prisma: JixiaPrismaClient,
): Promise<void> {
  await prisma.$executeRawUnsafe('PRAGMA foreign_keys = ON');
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "User" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "email" TEXT NOT NULL,
      "displayName" TEXT NOT NULL,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await prisma.$executeRawUnsafe(`
    CREATE UNIQUE INDEX IF NOT EXISTS "User_email_key" ON "User"("email")
  `);
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "Space" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "name" TEXT NOT NULL,
      "description" TEXT,
      "kind" TEXT NOT NULL,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "Project" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "spaceId" TEXT NOT NULL,
      "name" TEXT NOT NULL,
      "description" TEXT,
      "status" TEXT NOT NULL DEFAULT 'active',
      "createdByUserId" TEXT NOT NULL,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" DATETIME NOT NULL,
      CONSTRAINT "Project_spaceId_fkey" FOREIGN KEY ("spaceId") REFERENCES "Space" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
      CONSTRAINT "Project_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
    )
  `);
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "ProjectMember" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "projectId" TEXT NOT NULL,
      "userId" TEXT NOT NULL,
      "role" TEXT NOT NULL,
      "joinedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "ProjectMember_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
      CONSTRAINT "ProjectMember_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
    )
  `);
  await prisma.$executeRawUnsafe(`
    CREATE UNIQUE INDEX IF NOT EXISTS "ProjectMember_projectId_userId_key" ON "ProjectMember"("projectId", "userId")
  `);
}

export function createProjectRepository(
  prisma: JixiaPrismaClient,
): ProjectRepository {
  let initialized: Promise<void> | null = null;

  async function ensureInitialized(): Promise<void> {
    initialized ??= initializeProjectPersistence(prisma);

    await initialized;
  }

  return {
    async addProjectMember(
      projectId: string,
      input: AddProjectMemberParams,
    ): Promise<PersistedProjectMemberRecord> {
      await ensureInitialized();

      return prisma.$transaction(async (transaction) => {
        const project = await transaction.project.findUnique({
          where: { id: projectId },
        });

        if (!project) {
          throw new Error(`Project ${projectId} does not exist.`);
        }

        await ensureUser(transaction, input.userId);

        const membership = await transaction.projectMember.upsert({
          create: {
            projectId,
            role: input.role as ProjectRole,
            userId: input.userId,
          },
          update: {},
          where: {
            projectId_userId: {
              projectId,
              userId: input.userId,
            },
          },
        });

        return mapProjectMember(membership);
      });
    },
    async createProject(
      input: CreateProjectParams,
      actorUserId: string,
    ): Promise<PersistedProjectWithMembership> {
      await ensureInitialized();

      return prisma.$transaction(async (transaction) => {
        await ensureProjectRelations(transaction, {
          spaceId: input.spaceId,
          userId: actorUserId,
        });

        const project = await transaction.project.create({
          data: {
            createdByUserId: actorUserId,
            description: input.description,
            id: input.id,
            members: {
              create: {
                role: 'owner',
                userId: actorUserId,
              },
            },
            name: input.name,
            spaceId: input.spaceId,
            status: (input.status ?? 'active') as ProjectStatus,
          },
          include: PROJECT_INCLUDE_MEMBERS,
        });
        const created = mapProjectWithMembership(project, actorUserId);

        if (!created) {
          throw new Error('Created project is missing its owner membership.');
        }

        return created;
      });
    },
    async findProject(projectId: string): Promise<PersistedProjectRecord | null> {
      await ensureInitialized();

      const project = await prisma.project.findUnique({ where: { id: projectId } });

      return project ? mapProject(project) : null;
    },
    async getProjectForActor(
      projectId: string,
      actorUserId: string,
    ): Promise<PersistedProjectWithMembership | null> {
      await ensureInitialized();

      const project = await prisma.project.findFirst({
        include: PROJECT_INCLUDE_MEMBERS,
        where: {
          id: projectId,
          members: {
            some: {
              userId: actorUserId,
            },
          },
        },
      });

      return project ? mapProjectWithMembership(project, actorUserId) : null;
    },
    async getProjectMember(
      projectId: string,
      userId: string,
    ): Promise<PersistedProjectMemberRecord | null> {
      await ensureInitialized();

      const membership = await prisma.projectMember.findUnique({
        where: {
          projectId_userId: {
            projectId,
            userId,
          },
        },
      });

      return membership ? mapProjectMember(membership) : null;
    },
    async listProjectMembers(
      projectId: string,
    ): Promise<PersistedProjectMemberRecord[]> {
      await ensureInitialized();

      const memberships = await prisma.projectMember.findMany({
        orderBy: { joinedAt: 'asc' },
        where: { projectId },
      });

      return memberships.map(mapProjectMember);
    },
    async listProjectsForActor(
      actorUserId: string,
    ): Promise<PersistedProjectWithMembership[]> {
      await ensureInitialized();

      const projects = await prisma.project.findMany({
        include: PROJECT_INCLUDE_MEMBERS,
        orderBy: { createdAt: 'asc' },
        where: {
          members: {
            some: {
              userId: actorUserId,
            },
          },
        },
      });

      return projects.flatMap((project) => {
        const listItem = mapProjectWithMembership(project, actorUserId);

        return listItem ? [listItem] : [];
      });
    },
  };
}
