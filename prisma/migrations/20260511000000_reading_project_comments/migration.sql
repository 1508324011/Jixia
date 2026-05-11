-- Split private reader notes from project-scoped reader comments.

CREATE TABLE IF NOT EXISTS "ProjectReadingComment" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "libraryEntryId" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "authorUserId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ProjectReadingComment_libraryEntryId_fkey" FOREIGN KEY ("libraryEntryId") REFERENCES "LibraryEntry" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ProjectReadingComment_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ProjectReadingComment_authorUserId_fkey" FOREIGN KEY ("authorUserId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "Note_libraryEntryId_authorUserId_idx" ON "Note"("libraryEntryId", "authorUserId");
CREATE INDEX IF NOT EXISTS "ProjectReadingComment_libraryEntryId_projectId_idx" ON "ProjectReadingComment"("libraryEntryId", "projectId");
CREATE INDEX IF NOT EXISTS "ProjectReadingComment_projectId_createdAt_idx" ON "ProjectReadingComment"("projectId", "createdAt");

-- Safe legacy backfill: only copy historical space_shared Note rows into
-- project comments when the scoped LibraryEntry explicitly belongs to a
-- project. Personal-entry space_shared rows remain private-note compatibility
-- rows visible only to their authors through the private-note path.
INSERT OR IGNORE INTO "ProjectReadingComment" (
    "id",
    "libraryEntryId",
    "projectId",
    "authorUserId",
    "body",
    "createdAt",
    "updatedAt"
)
SELECT
    'project-comment-' || "Note"."id",
    "Note"."libraryEntryId",
    "LibraryEntry"."scopeId",
    "Note"."authorUserId",
    "Note"."body",
    "Note"."createdAt",
    "Note"."updatedAt"
FROM "Note"
JOIN "LibraryEntry" ON "LibraryEntry"."id" = "Note"."libraryEntryId"
WHERE "Note"."visibility" = 'space_shared'
  AND "LibraryEntry"."scopeType" = 'project';
