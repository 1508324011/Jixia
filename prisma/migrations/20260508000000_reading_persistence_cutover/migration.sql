-- Move reader notes, reading state, conversations, and generated insights
-- to Prisma/SQLite runtime authority.

CREATE TABLE IF NOT EXISTS "Note" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "libraryEntryId" TEXT NOT NULL,
    "authorUserId" TEXT NOT NULL,
    "visibility" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Note_libraryEntryId_fkey" FOREIGN KEY ("libraryEntryId") REFERENCES "LibraryEntry" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Note_authorUserId_fkey" FOREIGN KEY ("authorUserId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "Note_libraryEntryId_createdAt_idx" ON "Note"("libraryEntryId", "createdAt");

CREATE TABLE IF NOT EXISTS "ReadingState" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "libraryEntryId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "lastOpenedAt" DATETIME,
    "progress" REAL NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ReadingState_libraryEntryId_fkey" FOREIGN KEY ("libraryEntryId") REFERENCES "LibraryEntry" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ReadingState_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "ReadingState_libraryEntryId_userId_key" ON "ReadingState"("libraryEntryId", "userId");

CREATE TABLE IF NOT EXISTS "Conversation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "libraryEntryId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Conversation_libraryEntryId_fkey" FOREIGN KEY ("libraryEntryId") REFERENCES "LibraryEntry" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "Conversation_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "Conversation_libraryEntryId_createdAt_idx" ON "Conversation"("libraryEntryId", "createdAt");

CREATE TABLE IF NOT EXISTS "GeneratedInsight" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "libraryEntryId" TEXT NOT NULL,
    "conversationId" TEXT NOT NULL,
    "createdByUserId" TEXT NOT NULL,
    "summary" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "GeneratedInsight_libraryEntryId_fkey" FOREIGN KEY ("libraryEntryId") REFERENCES "LibraryEntry" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "GeneratedInsight_conversationId_fkey" FOREIGN KEY ("conversationId") REFERENCES "Conversation" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "GeneratedInsight_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "GeneratedInsight_libraryEntryId_idx" ON "GeneratedInsight"("libraryEntryId");
CREATE INDEX IF NOT EXISTS "GeneratedInsight_conversationId_idx" ON "GeneratedInsight"("conversationId");

CREATE TABLE IF NOT EXISTS "GeneratedInsightEvidenceSpan" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "generatedInsightId" TEXT NOT NULL,
    "paperAssetId" TEXT NOT NULL,
    "quote" TEXT NOT NULL,
    "startOffset" INTEGER NOT NULL,
    "endOffset" INTEGER NOT NULL,
    "orderIndex" INTEGER NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "GeneratedInsightEvidenceSpan_generatedInsightId_fkey" FOREIGN KEY ("generatedInsightId") REFERENCES "GeneratedInsight" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "GeneratedInsightEvidenceSpan_paperAssetId_fkey" FOREIGN KEY ("paperAssetId") REFERENCES "PaperAsset" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "GeneratedInsightEvidenceSpan_generatedInsightId_orderIndex_key" ON "GeneratedInsightEvidenceSpan"("generatedInsightId", "orderIndex");
CREATE INDEX IF NOT EXISTS "GeneratedInsightEvidenceSpan_paperAssetId_idx" ON "GeneratedInsightEvidenceSpan"("paperAssetId");
