import {
  type Membership,
  type Prisma,
  type Space,
  type SpaceKind,
  type SpaceRole,
} from '@prisma/client';

import type { JixiaPrismaClient } from '../client';
import { initializeProjectPersistence } from './project.repository';

export interface CreateSpaceParams {
  description?: string;
  id?: string;
  kind: PersistedSpaceKind;
  name: string;
}

export interface MembershipLookup {
  spaceId: string;
}

export interface AddSpaceMembershipParams {
  role?: PersistedSpaceRole;
  userId: string;
}

export type PersistedSpaceKind = 'personal' | 'shared';

export type PersistedSpaceRole = 'owner' | 'editor' | 'viewer';

export interface PersistedSpaceRecord {
  createdAt: string;
  description?: string;
  id: string;
  kind: PersistedSpaceKind;
  name: string;
  updatedAt: string;
}

export interface PersistedSpaceMembershipRecord {
  joinedAt: string;
  role: PersistedSpaceRole;
  spaceId: string;
  userId: string;
}

export interface SpaceRepository {
  addMembership(
    spaceId: string,
    input: AddSpaceMembershipParams,
  ): Promise<PersistedSpaceMembershipRecord>;
  createSpace(
    input: CreateSpaceParams,
    actorUserId: string,
  ): Promise<PersistedSpaceRecord>;
  denyNonMember(spaceId: string, actorUserId: string): Promise<void>;
  findSpace(spaceId: string): Promise<PersistedSpaceRecord | null>;
  getMembership(
    spaceId: string,
    userId: string,
  ): Promise<PersistedSpaceMembershipRecord | null>;
  listMemberships(
    query: MembershipLookup,
  ): Promise<PersistedSpaceMembershipRecord[]>;
  listSpacesForActor(actorUserId: string): Promise<PersistedSpaceRecord[]>;
}

type TransactionClient = Prisma.TransactionClient;

type SpaceClient = JixiaPrismaClient | TransactionClient;

function toIsoString(value: Date): string {
  return value.toISOString();
}

function mapSpace(space: Space): PersistedSpaceRecord {
  return {
    createdAt: toIsoString(space.createdAt),
    description: space.description ?? undefined,
    id: space.id,
    kind: space.kind,
    name: space.name,
    updatedAt: toIsoString(space.updatedAt),
  };
}

function mapMembership(
  membership: Membership,
): PersistedSpaceMembershipRecord {
  return {
    joinedAt: toIsoString(membership.joinedAt),
    role: membership.role,
    spaceId: membership.spaceId,
    userId: membership.userId,
  };
}

async function ensureUser(prisma: SpaceClient, userId: string): Promise<void> {
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

async function requireSpace(
  prisma: SpaceClient,
  spaceId: string,
): Promise<Space> {
  const space = await prisma.space.findUnique({ where: { id: spaceId } });

  if (!space) {
    throw new Error(`Space ${spaceId} does not exist.`);
  }

  return space;
}

export async function initializeSpacePersistence(
  prisma: JixiaPrismaClient,
): Promise<void> {
  await initializeProjectPersistence(prisma);
  await prisma.$executeRawUnsafe('PRAGMA foreign_keys = ON');
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "Membership" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "spaceId" TEXT NOT NULL,
      "userId" TEXT NOT NULL,
      "role" TEXT NOT NULL,
      "joinedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "Membership_spaceId_fkey" FOREIGN KEY ("spaceId") REFERENCES "Space" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
      CONSTRAINT "Membership_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
    )
  `);
  await prisma.$executeRawUnsafe(`
    CREATE UNIQUE INDEX IF NOT EXISTS "Membership_spaceId_userId_key" ON "Membership"("spaceId", "userId")
  `);
}

export function createSpaceRepository(
  prisma: JixiaPrismaClient,
): SpaceRepository {
  let initialized: Promise<void> | null = null;

  async function ensureInitialized(): Promise<void> {
    initialized ??= initializeSpacePersistence(prisma);

    await initialized;
  }

  return {
    async addMembership(
      spaceId: string,
      input: AddSpaceMembershipParams,
    ): Promise<PersistedSpaceMembershipRecord> {
      await ensureInitialized();

      return prisma.$transaction(async (transaction) => {
        await requireSpace(transaction, spaceId);
        await ensureUser(transaction, input.userId);

        const membership = await transaction.membership.upsert({
          create: {
            role: (input.role ?? 'viewer') as SpaceRole,
            spaceId,
            userId: input.userId,
          },
          update: {},
          where: {
            spaceId_userId: {
              spaceId,
              userId: input.userId,
            },
          },
        });

        return mapMembership(membership);
      });
    },
    async createSpace(
      input: CreateSpaceParams,
      actorUserId: string,
    ): Promise<PersistedSpaceRecord> {
      await ensureInitialized();

      return prisma.$transaction(async (transaction) => {
        await ensureUser(transaction, actorUserId);

        const space = await transaction.space.create({
          data: {
            description: input.description,
            id: input.id,
            kind: input.kind as SpaceKind,
            memberships: {
              create: {
                role: 'owner',
                userId: actorUserId,
              },
            },
            name: input.name,
          },
        });

        return mapSpace(space);
      });
    },
    async denyNonMember(spaceId: string, actorUserId: string): Promise<void> {
      await ensureInitialized();
      await requireSpace(prisma, spaceId);

      const membership = await prisma.membership.findUnique({
        where: {
          spaceId_userId: {
            spaceId,
            userId: actorUserId,
          },
        },
      });

      if (!membership) {
        throw new Error('Access denied for the requested space resource.');
      }
    },
    async findSpace(spaceId: string): Promise<PersistedSpaceRecord | null> {
      await ensureInitialized();

      const space = await prisma.space.findUnique({ where: { id: spaceId } });

      return space ? mapSpace(space) : null;
    },
    async getMembership(
      spaceId: string,
      userId: string,
    ): Promise<PersistedSpaceMembershipRecord | null> {
      await ensureInitialized();

      const membership = await prisma.membership.findUnique({
        where: {
          spaceId_userId: {
            spaceId,
            userId,
          },
        },
      });

      return membership ? mapMembership(membership) : null;
    },
    async listMemberships(
      query: MembershipLookup,
    ): Promise<PersistedSpaceMembershipRecord[]> {
      await ensureInitialized();

      const memberships = await prisma.membership.findMany({
        orderBy: { joinedAt: 'asc' },
        where: { spaceId: query.spaceId },
      });

      return memberships.map(mapMembership);
    },
    async listSpacesForActor(
      actorUserId: string,
    ): Promise<PersistedSpaceRecord[]> {
      await ensureInitialized();

      const spaces = await prisma.space.findMany({
        orderBy: { createdAt: 'asc' },
        where: {
          memberships: {
            some: {
              userId: actorUserId,
            },
          },
        },
      });

      return spaces.map(mapSpace);
    },
  };
}
