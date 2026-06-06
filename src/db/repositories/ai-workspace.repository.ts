import {
  type AiContextItem,
  type AiContextPack,
  type AiSession,
  type Prisma,
} from '@prisma/client';

import type { JixiaPrismaClient } from '../client';
import { initializeProjectPersistence } from './project.repository';

export type PersistedAiWorkspaceScopeType = 'user' | 'project';

export type PersistedAiContextSourceType =
  | 'generatedInsight'
  | 'projectDocCitation'
  | 'projectDocVersion'
  | 'projectLibraryEntry'
  | 'readerExcerpt';

export interface PersistedAiWorkspaceScopeRef {
  id: string;
  type: PersistedAiWorkspaceScopeType;
}

export interface CreateAiSessionParams {
  createdByUserId: string;
  id?: string;
  scope: PersistedAiWorkspaceScopeRef;
  title: string;
}

export interface CreateAiContextPackParams {
  createdByUserId: string;
  id?: string;
  sessionId: string;
  title: string;
}

export interface CreateAiContextItemParams {
  contextPackId: string;
  createdByUserId: string;
  id?: string;
  sourceDocumentId?: string;
  sourceId: string;
  sourceLibraryEntryId?: string;
  sourceType: PersistedAiContextSourceType;
  sourceVersionId?: string;
}

export interface PersistedAiSessionRecord {
  createdAt: string;
  createdByUserId: string;
  id: string;
  scope: PersistedAiWorkspaceScopeRef;
  title: string;
  updatedAt: string;
}

export interface PersistedAiContextPackRecord {
  createdAt: string;
  createdByUserId: string;
  id: string;
  itemCount: number;
  sessionId: string;
  title: string;
  updatedAt: string;
}

export interface PersistedAiContextItemRecord {
  contextPackId: string;
  createdAt: string;
  createdByUserId: string;
  id: string;
  sourceDocumentId?: string;
  sourceId: string;
  sourceLibraryEntryId?: string;
  sourceType: PersistedAiContextSourceType;
  sourceVersionId?: string;
}

export interface PersistedAiContextPackWithSession {
  pack: PersistedAiContextPackRecord;
  session: PersistedAiSessionRecord;
}

export interface PersistedAiContextPackDetail extends PersistedAiContextPackWithSession {
  items: PersistedAiContextItemRecord[];
}

export interface AiWorkspaceRepository {
  createContextItem(input: CreateAiContextItemParams): Promise<PersistedAiContextItemRecord>;
  createContextPack(input: CreateAiContextPackParams): Promise<PersistedAiContextPackRecord>;
  createSession(input: CreateAiSessionParams): Promise<PersistedAiSessionRecord>;
  getContextPack(contextPackId: string): Promise<PersistedAiContextPackWithSession | null>;
  getContextPackDetail(contextPackId: string): Promise<PersistedAiContextPackDetail | null>;
  getSession(sessionId: string): Promise<PersistedAiSessionRecord | null>;
  listContextPacks(sessionId: string): Promise<PersistedAiContextPackRecord[]>;
  listContextItems(contextPackId: string): Promise<PersistedAiContextItemRecord[]>;
  listSessionsForScope(scope: PersistedAiWorkspaceScopeRef): Promise<PersistedAiSessionRecord[]>;
}

type TransactionClient = Prisma.TransactionClient;

type AiWorkspaceClient = JixiaPrismaClient | TransactionClient;

type AiContextPackWithCount = AiContextPack & {
  _count?: { items: number };
};

type AiContextPackWithSession = AiContextPackWithCount & {
  session: AiSession;
};

function toIsoString(value: Date): string {
  return value.toISOString();
}

function normalizeScopeType(rawScopeType: string): PersistedAiWorkspaceScopeType {
  if (rawScopeType === 'user' || rawScopeType === 'project') {
    return rawScopeType;
  }

  throw new Error(`AI Workspace scope type ${rawScopeType} is not supported.`);
}

function normalizeSourceType(rawSourceType: string): PersistedAiContextSourceType {
  if (
    rawSourceType === 'generatedInsight' ||
    rawSourceType === 'projectDocCitation' ||
    rawSourceType === 'projectDocVersion' ||
    rawSourceType === 'projectLibraryEntry' ||
    rawSourceType === 'readerExcerpt'
  ) {
    return rawSourceType;
  }

  throw new Error(`AI Workspace context source type ${rawSourceType} is not supported.`);
}

function mapSession(session: AiSession): PersistedAiSessionRecord {
  return {
    createdAt: toIsoString(session.createdAt),
    createdByUserId: session.createdByUserId,
    id: session.id,
    scope: {
      id: session.scopeId,
      type: normalizeScopeType(session.scopeType),
    },
    title: session.title,
    updatedAt: toIsoString(session.updatedAt),
  };
}

function mapPack(pack: AiContextPackWithCount): PersistedAiContextPackRecord {
  return {
    createdAt: toIsoString(pack.createdAt),
    createdByUserId: pack.createdByUserId,
    id: pack.id,
    itemCount: pack._count?.items ?? 0,
    sessionId: pack.sessionId,
    title: pack.title,
    updatedAt: toIsoString(pack.updatedAt),
  };
}

function mapItem(item: AiContextItem): PersistedAiContextItemRecord {
  return {
    contextPackId: item.contextPackId,
    createdAt: toIsoString(item.createdAt),
    createdByUserId: item.createdByUserId,
    id: item.id,
    sourceDocumentId: item.sourceDocumentId ?? undefined,
    sourceId: item.sourceId,
    sourceLibraryEntryId: item.sourceLibraryEntryId ?? undefined,
    sourceType: normalizeSourceType(item.sourceType),
    sourceVersionId: item.sourceVersionId ?? undefined,
  };
}

async function ensureUser(
  prisma: AiWorkspaceClient,
  userId: string,
): Promise<void> {
  await prisma.user.upsert({
    create: {
      displayName: userId,
      email: `${userId}@jixia.local`,
      id: userId,
    },
    update: { updatedAt: new Date() },
    where: { id: userId },
  });
}

export async function initializeAiWorkspacePersistence(
  prisma: JixiaPrismaClient,
): Promise<void> {
  await initializeProjectPersistence(prisma);
  await prisma.$executeRawUnsafe('PRAGMA foreign_keys = ON');
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "AiSession" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "scopeType" TEXT NOT NULL,
      "scopeId" TEXT NOT NULL,
      "title" TEXT NOT NULL,
      "createdByUserId" TEXT NOT NULL,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "AiSession_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
    )
  `);
  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "AiSession_scopeType_scopeId_createdAt_idx" ON "AiSession"("scopeType", "scopeId", "createdAt")
  `);
  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "AiSession_createdByUserId_idx" ON "AiSession"("createdByUserId")
  `);
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "AiContextPack" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "sessionId" TEXT NOT NULL,
      "title" TEXT NOT NULL,
      "createdByUserId" TEXT NOT NULL,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "AiContextPack_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "AiSession" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
      CONSTRAINT "AiContextPack_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
    )
  `);
  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "AiContextPack_sessionId_createdAt_idx" ON "AiContextPack"("sessionId", "createdAt")
  `);
  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "AiContextPack_createdByUserId_idx" ON "AiContextPack"("createdByUserId")
  `);
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "AiContextItem" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "contextPackId" TEXT NOT NULL,
      "sourceType" TEXT NOT NULL,
      "sourceId" TEXT NOT NULL,
      "sourceVersionId" TEXT,
      "sourceDocumentId" TEXT,
      "sourceLibraryEntryId" TEXT,
      "createdByUserId" TEXT NOT NULL,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "AiContextItem_contextPackId_fkey" FOREIGN KEY ("contextPackId") REFERENCES "AiContextPack" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
      CONSTRAINT "AiContextItem_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
    )
  `);
  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "AiContextItem_contextPackId_createdAt_idx" ON "AiContextItem"("contextPackId", "createdAt")
  `);
  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "AiContextItem_sourceType_sourceId_idx" ON "AiContextItem"("sourceType", "sourceId")
  `);
  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "AiContextItem_createdByUserId_idx" ON "AiContextItem"("createdByUserId")
  `);
}

export function createAiWorkspaceRepository(
  prisma: JixiaPrismaClient,
): AiWorkspaceRepository {
  let initialized: Promise<void> | null = null;

  async function ensureInitialized(): Promise<void> {
    initialized ??= initializeAiWorkspacePersistence(prisma);

    await initialized;
  }

  return {
    async createContextItem(
      input: CreateAiContextItemParams,
    ): Promise<PersistedAiContextItemRecord> {
      await ensureInitialized();
      await ensureUser(prisma, input.createdByUserId);

      const item = await prisma.aiContextItem.create({
        data: {
          contextPackId: input.contextPackId,
          createdByUserId: input.createdByUserId,
          id: input.id,
          sourceDocumentId: input.sourceDocumentId,
          sourceId: input.sourceId,
          sourceLibraryEntryId: input.sourceLibraryEntryId,
          sourceType: input.sourceType,
          sourceVersionId: input.sourceVersionId,
        },
      });

      return mapItem(item);
    },
    async createContextPack(
      input: CreateAiContextPackParams,
    ): Promise<PersistedAiContextPackRecord> {
      await ensureInitialized();
      await ensureUser(prisma, input.createdByUserId);

      const pack = await prisma.aiContextPack.create({
        data: {
          createdByUserId: input.createdByUserId,
          id: input.id,
          sessionId: input.sessionId,
          title: input.title,
        },
      });

      return mapPack(pack);
    },
    async createSession(
      input: CreateAiSessionParams,
    ): Promise<PersistedAiSessionRecord> {
      await ensureInitialized();
      await ensureUser(prisma, input.createdByUserId);

      const session = await prisma.aiSession.create({
        data: {
          createdByUserId: input.createdByUserId,
          id: input.id,
          scopeId: input.scope.id,
          scopeType: input.scope.type,
          title: input.title,
        },
      });

      return mapSession(session);
    },
    async getContextPack(
      contextPackId: string,
    ): Promise<PersistedAiContextPackWithSession | null> {
      await ensureInitialized();

      const pack = await prisma.aiContextPack.findUnique({
        include: {
          _count: { select: { items: true } },
          session: true,
        },
        where: { id: contextPackId },
      });

      return pack
        ? {
            pack: mapPack(pack as AiContextPackWithSession),
            session: mapSession(pack.session),
          }
        : null;
    },
    async getContextPackDetail(
      contextPackId: string,
    ): Promise<PersistedAiContextPackDetail | null> {
      await ensureInitialized();

      const pack = await prisma.aiContextPack.findUnique({
        include: {
          _count: { select: { items: true } },
          items: {
            orderBy: { createdAt: 'asc' },
          },
          session: true,
        },
        where: { id: contextPackId },
      });

      return pack
        ? {
            items: pack.items.map(mapItem),
            pack: mapPack(pack as AiContextPackWithSession),
            session: mapSession(pack.session),
          }
        : null;
    },
    async getSession(sessionId: string): Promise<PersistedAiSessionRecord | null> {
      await ensureInitialized();

      const session = await prisma.aiSession.findUnique({ where: { id: sessionId } });

      return session ? mapSession(session) : null;
    },
    async listContextItems(
      contextPackId: string,
    ): Promise<PersistedAiContextItemRecord[]> {
      await ensureInitialized();

      const items = await prisma.aiContextItem.findMany({
        orderBy: { createdAt: 'asc' },
        where: { contextPackId },
      });

      return items.map(mapItem);
    },
    async listContextPacks(
      sessionId: string,
    ): Promise<PersistedAiContextPackRecord[]> {
      await ensureInitialized();

      const packs = await prisma.aiContextPack.findMany({
        include: { _count: { select: { items: true } } },
        orderBy: { createdAt: 'asc' },
        where: { sessionId },
      });

      return packs.map((pack) => mapPack(pack as AiContextPackWithCount));
    },
    async listSessionsForScope(
      scope: PersistedAiWorkspaceScopeRef,
    ): Promise<PersistedAiSessionRecord[]> {
      await ensureInitialized();

      const sessions = await prisma.aiSession.findMany({
        orderBy: { createdAt: 'asc' },
        where: {
          scopeId: scope.id,
          scopeType: scope.type,
        },
      });

      return sessions.map(mapSession);
    },
  };
}
