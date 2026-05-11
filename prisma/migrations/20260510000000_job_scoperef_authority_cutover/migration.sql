-- Add canonical ScopeRef authority to governed jobs while keeping legacy
-- governance-space fields as compatibility context only.

ALTER TABLE "Job" ADD COLUMN "scopeType" TEXT NOT NULL DEFAULT 'user';
ALTER TABLE "Job" ADD COLUMN "scopeId" TEXT NOT NULL DEFAULT '';

UPDATE "Job"
SET
    "scopeType" = COALESCE(NULLIF("scopeType", ''), 'user'),
    "scopeId" = COALESCE(NULLIF("scopeId", ''), "requestedByUserId")
WHERE
    "scopeType" IS NULL OR
    "scopeType" = '' OR
    "scopeId" IS NULL OR
    "scopeId" = '';

CREATE INDEX IF NOT EXISTS "Job_scopeType_scopeId_idx" ON "Job"("scopeType", "scopeId");
