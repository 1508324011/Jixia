-- Durable Reader evidence anchors are attached to scoped LibraryEntry rows.
-- They intentionally carry no excerpt-level scope, space, project, or visibility authority.
CREATE TABLE IF NOT EXISTS "ReaderExcerpt" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "libraryEntryId" TEXT NOT NULL,
  "paperAssetId" TEXT NOT NULL,
  "createdByUserId" TEXT NOT NULL,
  "quote" TEXT NOT NULL,
  "startOffset" INTEGER NOT NULL,
  "endOffset" INTEGER NOT NULL,
  "locator" TEXT,
  "note" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ReaderExcerpt_libraryEntryId_fkey" FOREIGN KEY ("libraryEntryId") REFERENCES "LibraryEntry" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ReaderExcerpt_paperAssetId_fkey" FOREIGN KEY ("paperAssetId") REFERENCES "PaperAsset" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ReaderExcerpt_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "ReaderExcerpt_libraryEntryId_createdAt_idx" ON "ReaderExcerpt"("libraryEntryId", "createdAt");
CREATE INDEX IF NOT EXISTS "ReaderExcerpt_paperAssetId_idx" ON "ReaderExcerpt"("paperAssetId");
CREATE INDEX IF NOT EXISTS "ReaderExcerpt_createdByUserId_idx" ON "ReaderExcerpt"("createdByUserId");

-- SQLite cannot add a foreign key with ALTER TABLE ... ADD COLUMN after table
-- creation. Rebuild citation tables so upgraded databases get the same
-- readerExcerptId referential integrity as fresh databases.
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;

DROP INDEX IF EXISTS "NotebookDocumentCitation_notebookDocumentVersionId_paperAssetId_key";
DROP INDEX IF EXISTS "NotebookDocumentCitation_notebookDocumentVersionId_paperAssetId_idx";
DROP INDEX IF EXISTS "NotebookDocumentCitation_readerExcerptId_idx";

CREATE TABLE "NotebookDocumentCitation__rebuild" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "notebookDocumentVersionId" TEXT NOT NULL,
  "paperAssetId" TEXT NOT NULL,
  "readerExcerptId" TEXT,
  "evidenceSpan" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "NotebookDocumentCitation_notebookDocumentVersionId_fkey" FOREIGN KEY ("notebookDocumentVersionId") REFERENCES "NotebookDocumentVersion" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "NotebookDocumentCitation_paperAssetId_fkey" FOREIGN KEY ("paperAssetId") REFERENCES "PaperAsset" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "NotebookDocumentCitation_readerExcerptId_fkey" FOREIGN KEY ("readerExcerptId") REFERENCES "ReaderExcerpt" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

INSERT INTO "NotebookDocumentCitation__rebuild" (
  "id",
  "notebookDocumentVersionId",
  "paperAssetId",
  "readerExcerptId",
  "evidenceSpan",
  "createdAt"
)
SELECT
  "id",
  "notebookDocumentVersionId",
  "paperAssetId",
  NULL AS "readerExcerptId",
  "evidenceSpan",
  "createdAt"
FROM "NotebookDocumentCitation";

DROP TABLE "NotebookDocumentCitation";
ALTER TABLE "NotebookDocumentCitation__rebuild" RENAME TO "NotebookDocumentCitation";

DROP INDEX IF EXISTS "ProjectDocCitation_projectDocVersionId_paperAssetId_key";
DROP INDEX IF EXISTS "ProjectDocCitation_projectDocVersionId_paperAssetId_idx";
DROP INDEX IF EXISTS "ProjectDocCitation_readerExcerptId_idx";

CREATE TABLE "ProjectDocCitation__rebuild" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "projectDocVersionId" TEXT NOT NULL,
  "paperAssetId" TEXT NOT NULL,
  "readerExcerptId" TEXT,
  "evidenceSpan" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ProjectDocCitation_projectDocVersionId_fkey" FOREIGN KEY ("projectDocVersionId") REFERENCES "ProjectDocVersion" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ProjectDocCitation_paperAssetId_fkey" FOREIGN KEY ("paperAssetId") REFERENCES "PaperAsset" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ProjectDocCitation_readerExcerptId_fkey" FOREIGN KEY ("readerExcerptId") REFERENCES "ReaderExcerpt" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

INSERT INTO "ProjectDocCitation__rebuild" (
  "id",
  "projectDocVersionId",
  "paperAssetId",
  "readerExcerptId",
  "evidenceSpan",
  "createdAt"
)
SELECT
  "id",
  "projectDocVersionId",
  "paperAssetId",
  NULL AS "readerExcerptId",
  "evidenceSpan",
  "createdAt"
FROM "ProjectDocCitation";

DROP TABLE "ProjectDocCitation";
ALTER TABLE "ProjectDocCitation__rebuild" RENAME TO "ProjectDocCitation";

PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

CREATE INDEX IF NOT EXISTS "NotebookDocumentCitation_notebookDocumentVersionId_paperAssetId_idx" ON "NotebookDocumentCitation"("notebookDocumentVersionId", "paperAssetId");
CREATE INDEX IF NOT EXISTS "NotebookDocumentCitation_readerExcerptId_idx" ON "NotebookDocumentCitation"("readerExcerptId");
CREATE INDEX IF NOT EXISTS "ProjectDocCitation_projectDocVersionId_paperAssetId_idx" ON "ProjectDocCitation"("projectDocVersionId", "paperAssetId");
CREATE INDEX IF NOT EXISTS "ProjectDocCitation_readerExcerptId_idx" ON "ProjectDocCitation"("readerExcerptId");
