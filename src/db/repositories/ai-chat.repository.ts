import type { JixiaPrismaClient } from '../client';
import { initializeReadingPersistence } from './reading.repository';

const aiChatPersistenceInitializers = new WeakMap<
  JixiaPrismaClient,
  Promise<void>
>();

async function initializeAiChatPersistenceTables(
  prisma: JixiaPrismaClient,
): Promise<void> {
  await initializeReadingPersistence(prisma);
  await prisma.$executeRawUnsafe('PRAGMA foreign_keys = ON');
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "AiChatSession" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "ownerUserId" TEXT NOT NULL,
      "sourceContextType" TEXT,
      "sourceContextId" TEXT,
      "sourceContextVersionId" TEXT,
      "title" TEXT NOT NULL,
      "lifecycleStatus" TEXT NOT NULL DEFAULT 'active',
      "archivedAt" DATETIME,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "AiChatSession_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
    )
  `);
  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "AiChatSession_ownerUserId_updatedAt_idx" ON "AiChatSession"("ownerUserId", "updatedAt")
  `);
  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "AiChatSession_sourceContextType_sourceContextId_updatedAt_idx" ON "AiChatSession"("sourceContextType", "sourceContextId", "updatedAt")
  `);
  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "AiChatSession_lifecycleStatus_updatedAt_idx" ON "AiChatSession"("lifecycleStatus", "updatedAt")
  `);
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "AiChatMessage" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "sessionId" TEXT NOT NULL,
      "role" TEXT NOT NULL,
      "body" TEXT NOT NULL,
      "safeMetadataJson" TEXT,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "AiChatMessage_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "AiChatSession" ("id") ON DELETE CASCADE ON UPDATE CASCADE
    )
  `);
  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "AiChatMessage_sessionId_createdAt_idx" ON "AiChatMessage"("sessionId", "createdAt")
  `);
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "AiChatRequest" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "sessionId" TEXT NOT NULL,
      "requestedMessageId" TEXT,
      "responseMessageId" TEXT,
      "status" TEXT NOT NULL DEFAULT 'queued',
      "promptBuildVersion" TEXT NOT NULL,
      "contextTokenEstimate" INTEGER,
      "responseTokenEstimate" INTEGER,
      "costEstimate" REAL,
      "budgetLimit" INTEGER,
      "overBudgetDecision" TEXT,
      "safeMetadataJson" TEXT,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "AiChatRequest_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "AiChatSession" ("id") ON DELETE CASCADE ON UPDATE CASCADE
    )
  `);
  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "AiChatRequest_sessionId_createdAt_idx" ON "AiChatRequest"("sessionId", "createdAt")
  `);
  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "AiChatRequest_status_createdAt_idx" ON "AiChatRequest"("status", "createdAt")
  `);
  await prisma.$executeRawUnsafe(`
    CREATE TABLE IF NOT EXISTS "AiChatRequestContextRef" (
      "id" TEXT NOT NULL PRIMARY KEY,
      "requestId" TEXT NOT NULL,
      "sourceType" TEXT NOT NULL,
      "sourceId" TEXT NOT NULL,
      "sourceVersionId" TEXT,
      "sourceDocumentId" TEXT,
      "sourceLibraryEntryId" TEXT,
      "readerAnnotationId" TEXT,
      "sourceTextArtifactId" TEXT,
      "paperAssetId" TEXT,
      "rangeStartOffset" INTEGER,
      "rangeEndOffset" INTEGER,
      "locatorJson" TEXT,
      "chipLabel" TEXT NOT NULL,
      "tokenEstimate" INTEGER,
      "omittedReason" TEXT,
      "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
      CONSTRAINT "AiChatRequestContextRef_requestId_fkey" FOREIGN KEY ("requestId") REFERENCES "AiChatRequest" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
      CONSTRAINT "AiChatRequestContextRef_sourceLibraryEntryId_fkey" FOREIGN KEY ("sourceLibraryEntryId") REFERENCES "LibraryEntry" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
      CONSTRAINT "AiChatRequestContextRef_readerAnnotationId_fkey" FOREIGN KEY ("readerAnnotationId") REFERENCES "ReaderAnnotation" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
      CONSTRAINT "AiChatRequestContextRef_sourceTextArtifactId_fkey" FOREIGN KEY ("sourceTextArtifactId") REFERENCES "SourceTextArtifact" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
      CONSTRAINT "AiChatRequestContextRef_paperAssetId_fkey" FOREIGN KEY ("paperAssetId") REFERENCES "PaperAsset" ("id") ON DELETE SET NULL ON UPDATE CASCADE
    )
  `);
  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "AiChatRequestContextRef_requestId_sourceType_idx" ON "AiChatRequestContextRef"("requestId", "sourceType")
  `);
  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "AiChatRequestContextRef_sourceType_sourceId_idx" ON "AiChatRequestContextRef"("sourceType", "sourceId")
  `);
  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "AiChatRequestContextRef_sourceLibraryEntryId_idx" ON "AiChatRequestContextRef"("sourceLibraryEntryId")
  `);
  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "AiChatRequestContextRef_readerAnnotationId_idx" ON "AiChatRequestContextRef"("readerAnnotationId")
  `);
  await prisma.$executeRawUnsafe(`
    CREATE INDEX IF NOT EXISTS "AiChatRequestContextRef_sourceTextArtifactId_idx" ON "AiChatRequestContextRef"("sourceTextArtifactId")
  `);
}

export async function initializeAiChatPersistence(
  prisma: JixiaPrismaClient,
): Promise<void> {
  const existingInitializer = aiChatPersistenceInitializers.get(prisma);

  if (existingInitializer) {
    await existingInitializer;
    return;
  }

  const initializer = initializeAiChatPersistenceTables(prisma);
  aiChatPersistenceInitializers.set(prisma, initializer);

  try {
    await initializer;
  } catch (error) {
    aiChatPersistenceInitializers.delete(prisma);
    throw error;
  }
}
