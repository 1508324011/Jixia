-- Split generic writing authority into owner-only notebook documents and
-- ProjectMember-gated project documents with persisted versions/citations.

CREATE TABLE IF NOT EXISTS "NotebookDocument" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "ownerId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "NotebookDocument_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "NotebookDocumentVersion" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "notebookDocumentId" TEXT NOT NULL,
    "versionNumber" INTEGER NOT NULL,
    "snapshot" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "NotebookDocumentVersion_notebookDocumentId_fkey" FOREIGN KEY ("notebookDocumentId") REFERENCES "NotebookDocument" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "NotebookDocumentVersion_notebookDocumentId_versionNumber_key" ON "NotebookDocumentVersion"("notebookDocumentId", "versionNumber");

CREATE TABLE IF NOT EXISTS "NotebookDocumentCitation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "notebookDocumentVersionId" TEXT NOT NULL,
    "paperAssetId" TEXT NOT NULL,
    "evidenceSpan" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "NotebookDocumentCitation_notebookDocumentVersionId_fkey" FOREIGN KEY ("notebookDocumentVersionId") REFERENCES "NotebookDocumentVersion" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "NotebookDocumentCitation_paperAssetId_fkey" FOREIGN KEY ("paperAssetId") REFERENCES "PaperAsset" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "NotebookDocumentCitation_notebookDocumentVersionId_paperAssetId_key" ON "NotebookDocumentCitation"("notebookDocumentVersionId", "paperAssetId");

CREATE TABLE IF NOT EXISTS "ProjectDoc" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectId" TEXT NOT NULL,
    "createdByUserId" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "publishState" TEXT NOT NULL DEFAULT 'draft',
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ProjectDoc_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ProjectDoc_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User" ("id") ON DELETE RESTRICT ON UPDATE CASCADE
);

CREATE TABLE IF NOT EXISTS "ProjectDocVersion" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectDocId" TEXT NOT NULL,
    "versionNumber" INTEGER NOT NULL,
    "snapshot" TEXT NOT NULL,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ProjectDocVersion_projectDocId_fkey" FOREIGN KEY ("projectDocId") REFERENCES "ProjectDoc" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "ProjectDocVersion_projectDocId_versionNumber_key" ON "ProjectDocVersion"("projectDocId", "versionNumber");

CREATE TABLE IF NOT EXISTS "ProjectDocCitation" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "projectDocVersionId" TEXT NOT NULL,
    "paperAssetId" TEXT NOT NULL,
    "evidenceSpan" TEXT,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ProjectDocCitation_projectDocVersionId_fkey" FOREIGN KEY ("projectDocVersionId") REFERENCES "ProjectDocVersion" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
    CONSTRAINT "ProjectDocCitation_paperAssetId_fkey" FOREIGN KEY ("paperAssetId") REFERENCES "PaperAsset" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE UNIQUE INDEX IF NOT EXISTS "ProjectDocCitation_projectDocVersionId_paperAssetId_key" ON "ProjectDocCitation"("projectDocVersionId", "paperAssetId");
