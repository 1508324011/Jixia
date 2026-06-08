-- Core domain closure contracts: source text artifacts, canonical reader
-- annotations, Reader default Notebook bindings, Notebook source links,
-- Project Doc citation target/occurrence/locator metadata, and private AIChat
-- trace rows. These tables/columns store references and safe metadata only;
-- raw source text, provider secrets, storage keys, and checksums remain outside
-- browser-facing contracts.

ALTER TABLE "LibraryEntry" ADD COLUMN "lifecycleStatus" TEXT NOT NULL DEFAULT 'active';
ALTER TABLE "LibraryEntry" ADD COLUMN "archivedAt" DATETIME;

CREATE INDEX IF NOT EXISTS "LibraryEntry_scopeType_scopeId_lifecycleStatus_idx" ON "LibraryEntry"("scopeType", "scopeId", "lifecycleStatus");

CREATE TABLE IF NOT EXISTS "SourceTextArtifact" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "paperAssetId" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "availabilityState" TEXT NOT NULL,
  "artifactRef" TEXT,
  "textFormat" TEXT,
  "pageCount" INTEGER,
  "characterCount" INTEGER,
  "language" TEXT,
  "statusDetail" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "SourceTextArtifact_paperAssetId_fkey" FOREIGN KEY ("paperAssetId") REFERENCES "PaperAsset" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "SourceTextArtifact_paperAssetId_kind_idx" ON "SourceTextArtifact"("paperAssetId", "kind");
CREATE INDEX IF NOT EXISTS "SourceTextArtifact_availabilityState_updatedAt_idx" ON "SourceTextArtifact"("availabilityState", "updatedAt");

CREATE TABLE IF NOT EXISTS "ReaderAnnotation" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "libraryEntryId" TEXT NOT NULL,
  "paperAssetId" TEXT NOT NULL,
  "sourceContextType" TEXT NOT NULL,
  "sourceContextId" TEXT NOT NULL,
  "sourceContextVersionId" TEXT,
  "createdByUserId" TEXT NOT NULL,
  "visibility" TEXT NOT NULL DEFAULT 'private',
  "projectId" TEXT,
  "originalAnnotationId" TEXT,
  "sourceTextArtifactId" TEXT,
  "quote" TEXT NOT NULL,
  "selectorJson" TEXT NOT NULL,
  "locatorJson" TEXT,
  "note" TEXT,
  "lifecycleStatus" TEXT NOT NULL DEFAULT 'active',
  "archivedAt" DATETIME,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ReaderAnnotation_libraryEntryId_fkey" FOREIGN KEY ("libraryEntryId") REFERENCES "LibraryEntry" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ReaderAnnotation_paperAssetId_fkey" FOREIGN KEY ("paperAssetId") REFERENCES "PaperAsset" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ReaderAnnotation_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ReaderAnnotation_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ReaderAnnotation_originalAnnotationId_fkey" FOREIGN KEY ("originalAnnotationId") REFERENCES "ReaderAnnotation" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "ReaderAnnotation_sourceTextArtifactId_fkey" FOREIGN KEY ("sourceTextArtifactId") REFERENCES "SourceTextArtifact" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "ReaderAnnotation_project_visibility_check" CHECK (("visibility" = 'private' AND "projectId" IS NULL) OR ("visibility" = 'project' AND "projectId" IS NOT NULL)),
  CONSTRAINT "ReaderAnnotation_project_note_check" CHECK ("visibility" != 'project' OR "note" IS NULL)
);

CREATE INDEX IF NOT EXISTS "ReaderAnnotation_libraryEntryId_createdByUserId_createdAt_idx" ON "ReaderAnnotation"("libraryEntryId", "createdByUserId", "createdAt");
CREATE INDEX IF NOT EXISTS "ReaderAnnotation_sourceContextType_sourceContextId_createdByUserId_idx" ON "ReaderAnnotation"("sourceContextType", "sourceContextId", "createdByUserId");
CREATE INDEX IF NOT EXISTS "ReaderAnnotation_projectId_visibility_createdAt_idx" ON "ReaderAnnotation"("projectId", "visibility", "createdAt");
CREATE INDEX IF NOT EXISTS "ReaderAnnotation_originalAnnotationId_idx" ON "ReaderAnnotation"("originalAnnotationId");
CREATE INDEX IF NOT EXISTS "ReaderAnnotation_lifecycleStatus_updatedAt_idx" ON "ReaderAnnotation"("lifecycleStatus", "updatedAt");

-- Repair review/unreleased SQLite files that already had ReaderAnnotation
-- without the privacy CHECK constraints. Project-visible copies retain their
-- project context but drop owner-private notes; project rows without project
-- context are demoted to private annotations so constraints can be enforced.
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;

DROP INDEX IF EXISTS "ReaderAnnotation_libraryEntryId_createdByUserId_createdAt_idx";
DROP INDEX IF EXISTS "ReaderAnnotation_sourceContextType_sourceContextId_createdByUserId_idx";
DROP INDEX IF EXISTS "ReaderAnnotation_projectId_visibility_createdAt_idx";
DROP INDEX IF EXISTS "ReaderAnnotation_originalAnnotationId_idx";
DROP INDEX IF EXISTS "ReaderAnnotation_lifecycleStatus_updatedAt_idx";

CREATE TABLE "ReaderAnnotation__core_domain_privacy_rebuild" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "libraryEntryId" TEXT NOT NULL,
  "paperAssetId" TEXT NOT NULL,
  "sourceContextType" TEXT NOT NULL,
  "sourceContextId" TEXT NOT NULL,
  "sourceContextVersionId" TEXT,
  "createdByUserId" TEXT NOT NULL,
  "visibility" TEXT NOT NULL DEFAULT 'private',
  "projectId" TEXT,
  "originalAnnotationId" TEXT,
  "sourceTextArtifactId" TEXT,
  "quote" TEXT NOT NULL,
  "selectorJson" TEXT NOT NULL,
  "locatorJson" TEXT,
  "note" TEXT,
  "lifecycleStatus" TEXT NOT NULL DEFAULT 'active',
  "archivedAt" DATETIME,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ReaderAnnotation_libraryEntryId_fkey" FOREIGN KEY ("libraryEntryId") REFERENCES "LibraryEntry" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ReaderAnnotation_paperAssetId_fkey" FOREIGN KEY ("paperAssetId") REFERENCES "PaperAsset" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ReaderAnnotation_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ReaderAnnotation_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ReaderAnnotation_originalAnnotationId_fkey" FOREIGN KEY ("originalAnnotationId") REFERENCES "ReaderAnnotation" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "ReaderAnnotation_sourceTextArtifactId_fkey" FOREIGN KEY ("sourceTextArtifactId") REFERENCES "SourceTextArtifact" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "ReaderAnnotation_project_visibility_check" CHECK (("visibility" = 'private' AND "projectId" IS NULL) OR ("visibility" = 'project' AND "projectId" IS NOT NULL)),
  CONSTRAINT "ReaderAnnotation_project_note_check" CHECK ("visibility" != 'project' OR "note" IS NULL)
);

INSERT INTO "ReaderAnnotation__core_domain_privacy_rebuild" (
  "id",
  "libraryEntryId",
  "paperAssetId",
  "sourceContextType",
  "sourceContextId",
  "sourceContextVersionId",
  "createdByUserId",
  "visibility",
  "projectId",
  "originalAnnotationId",
  "sourceTextArtifactId",
  "quote",
  "selectorJson",
  "locatorJson",
  "note",
  "lifecycleStatus",
  "archivedAt",
  "createdAt",
  "updatedAt"
)
SELECT
  "ReaderAnnotation"."id",
  "ReaderAnnotation"."libraryEntryId",
  "ReaderAnnotation"."paperAssetId",
  "ReaderAnnotation"."sourceContextType",
  "ReaderAnnotation"."sourceContextId",
  "ReaderAnnotation"."sourceContextVersionId",
  "ReaderAnnotation"."createdByUserId",
  CASE
    WHEN "ReaderAnnotation"."visibility" = 'project'
      AND "ReaderAnnotation"."projectId" IS NOT NULL
    THEN 'project'
    ELSE 'private'
  END AS "visibility",
  CASE
    WHEN "ReaderAnnotation"."visibility" = 'project'
      AND "ReaderAnnotation"."projectId" IS NOT NULL
    THEN "ReaderAnnotation"."projectId"
    ELSE NULL
  END AS "projectId",
  CASE
    WHEN "ReaderAnnotation"."visibility" = 'project'
      AND "ReaderAnnotation"."projectId" IS NOT NULL
    THEN "ReaderAnnotation"."originalAnnotationId"
    ELSE NULL
  END AS "originalAnnotationId",
  "ReaderAnnotation"."sourceTextArtifactId",
  "ReaderAnnotation"."quote",
  "ReaderAnnotation"."selectorJson",
  "ReaderAnnotation"."locatorJson",
  CASE
    WHEN "ReaderAnnotation"."visibility" = 'project'
      AND "ReaderAnnotation"."projectId" IS NOT NULL
    THEN NULL
    ELSE "ReaderAnnotation"."note"
  END AS "note",
  COALESCE(NULLIF("ReaderAnnotation"."lifecycleStatus", ''), 'active') AS "lifecycleStatus",
  "ReaderAnnotation"."archivedAt",
  "ReaderAnnotation"."createdAt",
  "ReaderAnnotation"."updatedAt"
FROM "ReaderAnnotation";

DROP TABLE "ReaderAnnotation";
ALTER TABLE "ReaderAnnotation__core_domain_privacy_rebuild" RENAME TO "ReaderAnnotation";

PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

CREATE INDEX IF NOT EXISTS "ReaderAnnotation_libraryEntryId_createdByUserId_createdAt_idx" ON "ReaderAnnotation"("libraryEntryId", "createdByUserId", "createdAt");
CREATE INDEX IF NOT EXISTS "ReaderAnnotation_sourceContextType_sourceContextId_createdByUserId_idx" ON "ReaderAnnotation"("sourceContextType", "sourceContextId", "createdByUserId");
CREATE INDEX IF NOT EXISTS "ReaderAnnotation_projectId_visibility_createdAt_idx" ON "ReaderAnnotation"("projectId", "visibility", "createdAt");
CREATE INDEX IF NOT EXISTS "ReaderAnnotation_originalAnnotationId_idx" ON "ReaderAnnotation"("originalAnnotationId");
CREATE INDEX IF NOT EXISTS "ReaderAnnotation_lifecycleStatus_updatedAt_idx" ON "ReaderAnnotation"("lifecycleStatus", "updatedAt");

CREATE TABLE IF NOT EXISTS "ReaderNotebookBinding" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "userId" TEXT NOT NULL,
  "sourceContextType" TEXT NOT NULL,
  "sourceContextId" TEXT NOT NULL,
  "sourceContextVersionId" TEXT,
  "notebookDocumentId" TEXT NOT NULL,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ReaderNotebookBinding_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ReaderNotebookBinding_notebookDocumentId_fkey" FOREIGN KEY ("notebookDocumentId") REFERENCES "NotebookDocument" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "ReaderNotebookBinding_user_source_unique" ON "ReaderNotebookBinding"("userId", "sourceContextType", "sourceContextId");
CREATE INDEX IF NOT EXISTS "ReaderNotebookBinding_notebookDocumentId_idx" ON "ReaderNotebookBinding"("notebookDocumentId");

CREATE TABLE IF NOT EXISTS "NotebookSourceLink" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "notebookDocumentVersionId" TEXT NOT NULL,
  "sourceType" TEXT NOT NULL,
  "sourceId" TEXT NOT NULL,
  "sourceVersionId" TEXT,
  "sourceLibraryEntryId" TEXT,
  "readerAnnotationId" TEXT,
  "sourceTextArtifactId" TEXT,
  "paperAssetId" TEXT,
  "evidenceSpan" TEXT,
  "locatorJson" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "NotebookSourceLink_notebookDocumentVersionId_fkey" FOREIGN KEY ("notebookDocumentVersionId") REFERENCES "NotebookDocumentVersion" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "NotebookSourceLink_sourceLibraryEntryId_fkey" FOREIGN KEY ("sourceLibraryEntryId") REFERENCES "LibraryEntry" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "NotebookSourceLink_readerAnnotationId_fkey" FOREIGN KEY ("readerAnnotationId") REFERENCES "ReaderAnnotation" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "NotebookSourceLink_sourceTextArtifactId_fkey" FOREIGN KEY ("sourceTextArtifactId") REFERENCES "SourceTextArtifact" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "NotebookSourceLink_paperAssetId_fkey" FOREIGN KEY ("paperAssetId") REFERENCES "PaperAsset" ("id") ON DELETE SET NULL ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "NotebookSourceLink_notebookDocumentVersionId_sourceType_idx" ON "NotebookSourceLink"("notebookDocumentVersionId", "sourceType");
CREATE INDEX IF NOT EXISTS "NotebookSourceLink_sourceType_sourceId_idx" ON "NotebookSourceLink"("sourceType", "sourceId");
CREATE INDEX IF NOT EXISTS "NotebookSourceLink_sourceLibraryEntryId_idx" ON "NotebookSourceLink"("sourceLibraryEntryId");
CREATE INDEX IF NOT EXISTS "NotebookSourceLink_readerAnnotationId_idx" ON "NotebookSourceLink"("readerAnnotationId");
CREATE INDEX IF NOT EXISTS "NotebookSourceLink_sourceTextArtifactId_idx" ON "NotebookSourceLink"("sourceTextArtifactId");

-- SQLite cannot add new foreign keys to existing tables using ALTER COLUMN, so
-- rebuild ProjectDocCitation to add target, occurrence, and locator references
-- without losing existing citation rows.
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;

DROP INDEX IF EXISTS "ProjectDocCitation_projectDocVersionId_paperAssetId_idx";
DROP INDEX IF EXISTS "ProjectDocCitation_readerExcerptId_idx";
DROP INDEX IF EXISTS "ProjectDocCitation_targetLibraryEntryId_lifecycleStatus_idx";
DROP INDEX IF EXISTS "ProjectDocCitation_projectDocVersionId_occurrenceKey_idx";
DROP INDEX IF EXISTS "ProjectDocCitation_readerAnnotationId_idx";
DROP INDEX IF EXISTS "ProjectDocCitation_sourceTextArtifactId_idx";

CREATE TABLE "ProjectDocCitation__core_domain_rebuild" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "projectDocVersionId" TEXT NOT NULL,
  "paperAssetId" TEXT NOT NULL,
  "readerExcerptId" TEXT,
  "targetLibraryEntryId" TEXT,
  "occurrenceKey" TEXT,
  "occurrenceLabel" TEXT,
  "locatorJson" TEXT,
  "locatorSourceType" TEXT,
  "locatorSourceId" TEXT,
  "readerAnnotationId" TEXT,
  "sourceTextArtifactId" TEXT,
  "lifecycleStatus" TEXT NOT NULL DEFAULT 'active',
  "evidenceSpan" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "ProjectDocCitation_projectDocVersionId_fkey" FOREIGN KEY ("projectDocVersionId") REFERENCES "ProjectDocVersion" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ProjectDocCitation_paperAssetId_fkey" FOREIGN KEY ("paperAssetId") REFERENCES "PaperAsset" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "ProjectDocCitation_readerExcerptId_fkey" FOREIGN KEY ("readerExcerptId") REFERENCES "ReaderExcerpt" ("id") ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT "ProjectDocCitation_targetLibraryEntryId_fkey" FOREIGN KEY ("targetLibraryEntryId") REFERENCES "LibraryEntry" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "ProjectDocCitation_readerAnnotationId_fkey" FOREIGN KEY ("readerAnnotationId") REFERENCES "ReaderAnnotation" ("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  CONSTRAINT "ProjectDocCitation_sourceTextArtifactId_fkey" FOREIGN KEY ("sourceTextArtifactId") REFERENCES "SourceTextArtifact" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

INSERT INTO "ProjectDocCitation__core_domain_rebuild" (
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
  "readerExcerptId",
  "evidenceSpan",
  "createdAt"
FROM "ProjectDocCitation";

DROP TABLE "ProjectDocCitation";
ALTER TABLE "ProjectDocCitation__core_domain_rebuild" RENAME TO "ProjectDocCitation";

PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

CREATE INDEX IF NOT EXISTS "ProjectDocCitation_projectDocVersionId_paperAssetId_idx" ON "ProjectDocCitation"("projectDocVersionId", "paperAssetId");
CREATE INDEX IF NOT EXISTS "ProjectDocCitation_readerExcerptId_idx" ON "ProjectDocCitation"("readerExcerptId");
CREATE INDEX IF NOT EXISTS "ProjectDocCitation_targetLibraryEntryId_lifecycleStatus_idx" ON "ProjectDocCitation"("targetLibraryEntryId", "lifecycleStatus");
CREATE INDEX IF NOT EXISTS "ProjectDocCitation_projectDocVersionId_occurrenceKey_idx" ON "ProjectDocCitation"("projectDocVersionId", "occurrenceKey");
CREATE INDEX IF NOT EXISTS "ProjectDocCitation_readerAnnotationId_idx" ON "ProjectDocCitation"("readerAnnotationId");
CREATE INDEX IF NOT EXISTS "ProjectDocCitation_sourceTextArtifactId_idx" ON "ProjectDocCitation"("sourceTextArtifactId");

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
);

CREATE INDEX IF NOT EXISTS "AiChatSession_ownerUserId_updatedAt_idx" ON "AiChatSession"("ownerUserId", "updatedAt");
CREATE INDEX IF NOT EXISTS "AiChatSession_sourceContextType_sourceContextId_updatedAt_idx" ON "AiChatSession"("sourceContextType", "sourceContextId", "updatedAt");
CREATE INDEX IF NOT EXISTS "AiChatSession_lifecycleStatus_updatedAt_idx" ON "AiChatSession"("lifecycleStatus", "updatedAt");

CREATE TABLE IF NOT EXISTS "AiChatMessage" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "sessionId" TEXT NOT NULL,
  "role" TEXT NOT NULL,
  "body" TEXT NOT NULL,
  "safeMetadataJson" TEXT,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AiChatMessage_sessionId_fkey" FOREIGN KEY ("sessionId") REFERENCES "AiChatSession" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "AiChatMessage_sessionId_createdAt_idx" ON "AiChatMessage"("sessionId", "createdAt");

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
);

CREATE INDEX IF NOT EXISTS "AiChatRequest_sessionId_createdAt_idx" ON "AiChatRequest"("sessionId", "createdAt");
CREATE INDEX IF NOT EXISTS "AiChatRequest_status_createdAt_idx" ON "AiChatRequest"("status", "createdAt");

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
);

CREATE INDEX IF NOT EXISTS "AiChatRequestContextRef_requestId_sourceType_idx" ON "AiChatRequestContextRef"("requestId", "sourceType");
CREATE INDEX IF NOT EXISTS "AiChatRequestContextRef_sourceType_sourceId_idx" ON "AiChatRequestContextRef"("sourceType", "sourceId");
CREATE INDEX IF NOT EXISTS "AiChatRequestContextRef_sourceLibraryEntryId_idx" ON "AiChatRequestContextRef"("sourceLibraryEntryId");
CREATE INDEX IF NOT EXISTS "AiChatRequestContextRef_readerAnnotationId_idx" ON "AiChatRequestContextRef"("readerAnnotationId");
CREATE INDEX IF NOT EXISTS "AiChatRequestContextRef_sourceTextArtifactId_idx" ON "AiChatRequestContextRef"("sourceTextArtifactId");
