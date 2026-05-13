import { type Prisma, type User, type UserSession } from "@prisma/client";

import type { JixiaPrismaClient } from "../client";
import { initializeProjectPersistence } from "./project.repository";

export interface PersistedSessionUserRecord {
  createdAt: string;
  displayName: string;
  email: string;
  id: string;
  updatedAt: string;
}

export interface PersistedUserSessionRecord {
  createdAt: string;
  expiresAt: string;
  id: string;
  lastSeenAt?: string;
  revokedAt?: string;
  tokenHash: string;
  userAgent?: string;
  userId: string;
}

export interface PersistedUserSessionWithUserRecord {
  session: PersistedUserSessionRecord;
  user: PersistedSessionUserRecord;
}

export interface CreateUserSessionParams {
  expiresAt: string;
  id?: string;
  lastSeenAt?: string;
  tokenHash: string;
  userAgent?: string;
  userId: string;
}

export interface SeedUserParams {
  displayName: string;
  email: string;
  id: string;
}

export interface SessionRepository {
  createSession(input: CreateUserSessionParams): Promise<PersistedUserSessionRecord>;
  findSessionByTokenHash(
    tokenHash: string,
  ): Promise<PersistedUserSessionWithUserRecord | null>;
  findUserById(userId: string): Promise<PersistedSessionUserRecord | null>;
  revokeSessionByTokenHash(tokenHash: string, revokedAt?: string): Promise<void>;
  seedUsers(users: SeedUserParams[]): Promise<void>;
  touchSession(sessionId: string, lastSeenAt?: string): Promise<PersistedUserSessionRecord>;
}

type TransactionClient = Prisma.TransactionClient;
type SessionClient = JixiaPrismaClient | TransactionClient;

function toIsoString(value: Date): string {
  return value.toISOString();
}

function optionalDate(value: string | undefined): Date | undefined {
  return value ? new Date(value) : undefined;
}

function mapUser(user: User): PersistedSessionUserRecord {
  return {
    createdAt: toIsoString(user.createdAt),
    displayName: user.displayName,
    email: user.email,
    id: user.id,
    updatedAt: toIsoString(user.updatedAt),
  };
}

function mapSession(session: UserSession): PersistedUserSessionRecord {
  return {
    createdAt: toIsoString(session.createdAt),
    expiresAt: toIsoString(session.expiresAt),
    id: session.id,
    lastSeenAt: session.lastSeenAt ? toIsoString(session.lastSeenAt) : undefined,
    revokedAt: session.revokedAt ? toIsoString(session.revokedAt) : undefined,
    tokenHash: session.tokenHash,
    userAgent: session.userAgent ?? undefined,
    userId: session.userId,
  };
}

export async function initializeSessionPersistence(
  prisma: JixiaPrismaClient,
): Promise<void> {
  await initializeProjectPersistence(prisma);
  await prisma.$executeRawUnsafe("PRAGMA foreign_keys = ON");
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "UserSession" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "userId" TEXT NOT NULL,
      "tokenHash" TEXT NOT NULL,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "expiresAt" DATETIME NOT NULL,
      "revokedAt" DATETIME,
      "lastSeenAt" DATETIME,
      "userAgent" TEXT,
      CONSTRAINT "UserSession_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
    )
  `);
  await prisma.$executeRawUnsafe(`
    CREATE UNIQUE INDEX IF NOT EXISTS "UserSession_tokenHash_key" ON "UserSession"("tokenHash")
  `);
  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "UserSession_userId_idx" ON "UserSession"("userId")
  `);
  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "UserSession_expiresAt_idx" ON "UserSession"("expiresAt")
  `);
  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "UserSession_revokedAt_idx" ON "UserSession"("revokedAt")
  `);
}

export function createSessionRepository(
  prisma: JixiaPrismaClient,
): SessionRepository {
  let initialized: Promise<void> | null = null;

  async function ensureInitialized(): Promise<void> {
    initialized ??= initializeSessionPersistence(prisma);
    await initialized;
  }

  return {
    async createSession(input: CreateUserSessionParams): Promise<PersistedUserSessionRecord> {
      await ensureInitialized();

      const session = await prisma.userSession.create({
        data: {
          expiresAt: new Date(input.expiresAt),
          id: input.id,
          lastSeenAt: optionalDate(input.lastSeenAt),
          tokenHash: input.tokenHash,
          userAgent: input.userAgent,
          userId: input.userId,
        },
      });

      return mapSession(session);
    },
    async findSessionByTokenHash(
      tokenHash: string,
    ): Promise<PersistedUserSessionWithUserRecord | null> {
      await ensureInitialized();

      const session = await prisma.userSession.findUnique({
        include: { user: true },
        where: { tokenHash },
      });

      if (!session) {
        return null;
      }

      return {
        session: mapSession(session),
        user: mapUser(session.user),
      };
    },
    async findUserById(userId: string): Promise<PersistedSessionUserRecord | null> {
      await ensureInitialized();

      const user = await prisma.user.findUnique({ where: { id: userId } });

      return user ? mapUser(user) : null;
    },
    async revokeSessionByTokenHash(tokenHash: string, revokedAt?: string): Promise<void> {
      await ensureInitialized();

      await prisma.userSession.updateMany({
        data: { revokedAt: optionalDate(revokedAt) ?? new Date() },
        where: { tokenHash },
      });
    },
    async seedUsers(users: SeedUserParams[]): Promise<void> {
      await ensureInitialized();

      for (const user of users) {
        await prisma.user.upsert({
          create: {
            displayName: user.displayName,
            email: user.email,
            id: user.id,
          },
          update: {
            displayName: user.displayName,
            email: user.email,
            updatedAt: new Date(),
          },
          where: { id: user.id },
        });
      }
    },
    async touchSession(
      sessionId: string,
      lastSeenAt?: string,
    ): Promise<PersistedUserSessionRecord> {
      await ensureInitialized();

      const session = await prisma.userSession.update({
        data: {
          lastSeenAt: optionalDate(lastSeenAt) ?? new Date(),
        },
        where: { id: sessionId },
      });

      return mapSession(session);
    },
  };
}
