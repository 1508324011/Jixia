-- Extend AuditLog from job-only compatibility rows into generic governance
-- audit records. Keep the table and legacy columns so existing job audit reads
-- remain compatible while canonical scope/object/project fields become
-- available for project-object audit surfaces.

ALTER TABLE "AuditLog" ADD COLUMN "scopeType" TEXT NOT NULL DEFAULT 'user';
ALTER TABLE "AuditLog" ADD COLUMN "scopeId" TEXT NOT NULL DEFAULT '';
ALTER TABLE "AuditLog" ADD COLUMN "objectType" TEXT NOT NULL DEFAULT 'unknown';
ALTER TABLE "AuditLog" ADD COLUMN "objectId" TEXT NOT NULL DEFAULT '';
ALTER TABLE "AuditLog" ADD COLUMN "projectId" TEXT;
ALTER TABLE "AuditLog" ADD COLUMN "metadataJson" TEXT;

UPDATE "AuditLog"
SET
  "objectType" = 'job',
  "objectId" = "jobId"
WHERE
  "jobId" IS NOT NULL
  AND (
    "objectType" IS NULL OR
    "objectType" = '' OR
    "objectType" = 'unknown' OR
    "objectId" IS NULL OR
    "objectId" = ''
  );

UPDATE "AuditLog"
SET
  "scopeType" = COALESCE(
    NULLIF((SELECT "Job"."scopeType" FROM "Job" WHERE "Job"."id" = "AuditLog"."jobId"), ''),
    NULLIF("AuditLog"."scopeType", ''),
    'user'
  ),
  "scopeId" = COALESCE(
    NULLIF((SELECT "Job"."scopeId" FROM "Job" WHERE "Job"."id" = "AuditLog"."jobId"), ''),
    NULLIF("AuditLog"."scopeId", ''),
    "AuditLog"."actorUserId"
  ),
  "projectId" = CASE
    WHEN (SELECT "Job"."scopeType" FROM "Job" WHERE "Job"."id" = "AuditLog"."jobId") = 'project'
      THEN (SELECT "Job"."scopeId" FROM "Job" WHERE "Job"."id" = "AuditLog"."jobId")
    ELSE "AuditLog"."projectId"
  END
WHERE
  "jobId" IS NOT NULL
  AND EXISTS (SELECT 1 FROM "Job" WHERE "Job"."id" = "AuditLog"."jobId");

-- Safe compatibility defaults for orphan historical rows. They stay readable,
-- but no object existence is inferred from them.
UPDATE "AuditLog"
SET
  "scopeType" = COALESCE(NULLIF("scopeType", ''), 'user'),
  "scopeId" = COALESCE(NULLIF("scopeId", ''), "actorUserId"),
  "objectType" = COALESCE(NULLIF("objectType", ''), CASE WHEN "jobId" IS NOT NULL THEN 'job' ELSE 'audit_log' END),
  "objectId" = COALESCE(NULLIF("objectId", ''), COALESCE("jobId", "id"))
WHERE
  "scopeType" IS NULL OR
  "scopeType" = '' OR
  "scopeId" IS NULL OR
  "scopeId" = '' OR
  "objectType" IS NULL OR
  "objectType" = '' OR
  "objectType" = 'unknown' OR
  "objectId" IS NULL OR
  "objectId" = '';

CREATE INDEX IF NOT EXISTS "AuditLog_scopeType_scopeId_recordedAt_idx" ON "AuditLog"("scopeType", "scopeId", "recordedAt");
CREATE INDEX IF NOT EXISTS "AuditLog_objectType_objectId_recordedAt_idx" ON "AuditLog"("objectType", "objectId", "recordedAt");
CREATE INDEX IF NOT EXISTS "AuditLog_projectId_recordedAt_idx" ON "AuditLog"("projectId", "recordedAt");
CREATE INDEX IF NOT EXISTS "AuditLog_projectId_objectType_objectId_recordedAt_idx" ON "AuditLog"("projectId", "objectType", "objectId", "recordedAt");
