CREATE TABLE IF NOT EXISTS "AiResultArtifact" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "jobId" TEXT NOT NULL,
  "kind" TEXT NOT NULL,
  "scopeType" TEXT NOT NULL,
  "scopeId" TEXT NOT NULL,
  "projectId" TEXT,
  "createdByUserId" TEXT NOT NULL,
  "status" TEXT NOT NULL,
  "title" TEXT,
  "summary" TEXT,
  "documentContent" TEXT,
  "plainTextPreview" TEXT,
  "provenanceJson" TEXT NOT NULL,
  "appliedTargetJson" TEXT,
  "appliedAt" DATETIME,
  "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "AiResultArtifact_jobId_fkey" FOREIGN KEY ("jobId") REFERENCES "Job" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT "AiResultArtifact_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

CREATE INDEX IF NOT EXISTS "AiResultArtifact_jobId_idx" ON "AiResultArtifact"("jobId");
CREATE INDEX IF NOT EXISTS "AiResultArtifact_createdByUserId_createdAt_idx" ON "AiResultArtifact"("createdByUserId", "createdAt");
CREATE INDEX IF NOT EXISTS "AiResultArtifact_scopeType_scopeId_createdAt_idx" ON "AiResultArtifact"("scopeType", "scopeId", "createdAt");
CREATE INDEX IF NOT EXISTS "AiResultArtifact_projectId_createdAt_idx" ON "AiResultArtifact"("projectId", "createdAt");
CREATE INDEX IF NOT EXISTS "AiResultArtifact_status_createdAt_idx" ON "AiResultArtifact"("status", "createdAt");
