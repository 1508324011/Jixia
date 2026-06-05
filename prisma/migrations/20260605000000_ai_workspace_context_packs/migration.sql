-- AI Workspace context packs are server-owned references, not browser-authored
-- raw context blobs. Session scope is the authorization boundary; packs inherit
-- it; items point at existing Jixia objects through explicit reference columns.
CREATE TABLE IF NOT EXISTS "AiSession" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "scopeType" TEXT NOT NULL,
  "scopeId" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "createdByUserId" TEXT NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AiSession_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "AiSession_scopeType_scopeId_createdAt_idx" ON "AiSession"("scopeType", "scopeId", "createdAt");
CREATE INDEX IF NOT EXISTS "AiSession_createdByUserId_idx" ON "AiSession"("createdByUserId");

CREATE TABLE IF NOT EXISTS "AiContextPack" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "sessionId" TEXT NOT NULL,
  "title" TEXT NOT NULL,
  "createdByUserId" TEXT NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AiContextPack_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "AiSession" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "AiContextPack_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "AiContextPack_sessionId_createdAt_idx" ON "AiContextPack"("sessionId", "createdAt");
CREATE INDEX IF NOT EXISTS "AiContextPack_createdByUserId_idx" ON "AiContextPack"("createdByUserId");

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
);

CREATE INDEX IF NOT EXISTS "AiContextItem_contextPackId_createdAt_idx" ON "AiContextItem"("contextPackId", "createdAt");
CREATE INDEX IF NOT EXISTS "AiContextItem_sourceType_sourceId_idx" ON "AiContextItem"("sourceType", "sourceId");
CREATE INDEX IF NOT EXISTS "AiContextItem_createdByUserId_idx" ON "AiContextItem"("createdByUserId");
