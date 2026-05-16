-- Forward-only indexes for the private-note/project-comment authority split.
-- The original ProjectReadingComment table migration is already published on main,
-- so this keeps that migration stable and only adds idempotent indexes.

CREATE INDEX IF NOT EXISTS "Note_libraryEntryId_authorUserId_idx"
  ON "Note"("libraryEntryId", "authorUserId");

CREATE INDEX IF NOT EXISTS "ProjectReadingComment_projectId_createdAt_idx"
  ON "ProjectReadingComment"("projectId", "createdAt");
