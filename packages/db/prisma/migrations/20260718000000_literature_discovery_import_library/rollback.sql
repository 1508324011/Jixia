BEGIN;

LOCK TABLE
    "AssertionAuthor",
    "AssertionIdentifier",
    "AssertionOpenAccess",
    "AssertionPublisher",
    "LiteratureIdentity",
    "ImportOperation",
    "Assertion"
IN ACCESS EXCLUSIVE MODE;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM "AssertionAuthor" LIMIT 1)
       OR EXISTS (SELECT 1 FROM "AssertionIdentifier" LIMIT 1)
       OR EXISTS (SELECT 1 FROM "AssertionOpenAccess" LIMIT 1)
       OR EXISTS (SELECT 1 FROM "AssertionPublisher" LIMIT 1)
       OR EXISTS (SELECT 1 FROM "LiteratureIdentity" LIMIT 1)
       OR EXISTS (SELECT 1 FROM "ImportOperation" LIMIT 1)
       OR EXISTS (
           SELECT 1
           FROM "Assertion"
           WHERE "kind"::text NOT IN ('title', 'abstract', 'publicationYear', 'doi')
              OR "structuredItemCount" IS NOT NULL
              OR "valueFingerprint" IS NOT NULL
           LIMIT 1
       ) THEN
        RAISE EXCEPTION 'refusing to roll back populated literature discovery state';
    END IF;
END;
$$;

DROP TRIGGER "Assertion_structured_value_trigger" ON "Assertion";
DROP TRIGGER "Assertion_structured_value_trigger" ON "AssertionAuthor";
DROP TRIGGER "Assertion_structured_value_trigger" ON "AssertionIdentifier";
DROP TRIGGER "Assertion_structured_value_trigger" ON "AssertionOpenAccess";
DROP TRIGGER "Assertion_structured_value_trigger" ON "AssertionPublisher";
DROP TRIGGER "AssertionAuthor_append_only_trigger" ON "AssertionAuthor";
DROP TRIGGER "AssertionIdentifier_append_only_trigger" ON "AssertionIdentifier";
DROP TRIGGER "AssertionOpenAccess_append_only_trigger" ON "AssertionOpenAccess";
DROP TRIGGER "AssertionPublisher_append_only_trigger" ON "AssertionPublisher";
DROP TRIGGER "LiteratureIdentity_scope_trigger" ON "LiteratureIdentity";
DROP TRIGGER "LiteratureIdentity_append_only_trigger" ON "LiteratureIdentity";
DROP TRIGGER "ImportOperation_result_scope_trigger" ON "ImportOperation";
DROP TRIGGER "ImportOperation_transition_trigger" ON "ImportOperation";

DROP FUNCTION "delete_literature_aggregate"(TEXT);
DROP FUNCTION "enforce_assertion_structured_value"();
DROP FUNCTION "enforce_literature_identity_scope"();
DROP FUNCTION "enforce_import_operation_result_scope"();
DROP FUNCTION "enforce_import_operation_transition"();

REVOKE SELECT, DELETE ON TABLE
    "Literature",
    "ProviderRecord",
    "Assertion",
    "RelationAssertion",
    "ImportOperation",
    "SourceRevision",
    "Annotation",
    "Excerpt",
    "Evidence",
    "CitationOccurrence",
    "AssertionAuthor",
    "AssertionIdentifier",
    "AssertionOpenAccess",
    "AssertionPublisher",
    "LiteratureIdentity"
FROM "jixia_literature_cleanup_owner";
REVOKE USAGE ON SCHEMA public
FROM "jixia_literature_cleanup_owner", "jixia_literature_application";

CREATE OR REPLACE FUNCTION "reject_append_only_change"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    RAISE EXCEPTION '% is append-only; % is not allowed', TG_TABLE_NAME, TG_OP;
END;
$$;

CREATE OR REPLACE FUNCTION "enforce_import_operation_scope_immutable"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF NEW."id" IS DISTINCT FROM OLD."id"
       OR NEW."ownerUserId" IS DISTINCT FROM OLD."ownerUserId"
       OR NEW."projectId" IS DISTINCT FROM OLD."projectId"
       OR NEW."createdByUserId" IS DISTINCT FROM OLD."createdByUserId"
       OR NEW."createdAt" IS DISTINCT FROM OLD."createdAt" THEN
        RAISE EXCEPTION 'ImportOperation ownership and identity are immutable';
    END IF;
    RETURN NEW;
END;
$$;

DROP TABLE "AssertionAuthor";
DROP TABLE "AssertionIdentifier";
DROP TABLE "AssertionOpenAccess";
DROP TABLE "AssertionPublisher";
DROP TABLE "LiteratureIdentity";

ALTER TABLE "ImportOperation" DROP CONSTRAINT "ImportOperation_literatureId_fkey";
DROP INDEX "ImportOperation_createdByUserId_idempotencyKey_key";
DROP INDEX "ImportOperation_literatureId_idx";
ALTER TABLE "ImportOperation"
    DROP CONSTRAINT "ImportOperation_request_shape_check",
    DROP CONSTRAINT "ImportOperation_attempt_count_check",
    DROP CONSTRAINT "ImportOperation_warning_codes_check",
    DROP CONSTRAINT "ImportOperation_state_shape_check",
    DROP COLUMN "idempotencyKey",
    DROP COLUMN "requestFingerprint",
    DROP COLUMN "sourceProviderKey",
    DROP COLUMN "sourceRecordKey",
    DROP COLUMN "status",
    DROP COLUMN "attemptCount",
    DROP COLUMN "attemptStartedAt",
    DROP COLUMN "takeoverAfter",
    DROP COLUMN "finishedAttemptCount",
    DROP COLUMN "finishedAt",
    DROP COLUMN "literatureId",
    DROP COLUMN "warningCodes",
    DROP COLUMN "failureCode";

ALTER TABLE "Assertion" DROP CONSTRAINT "Assertion_typed_value_check";
ALTER TABLE "Assertion" DROP CONSTRAINT "Assertion_text_value_length_check";
ALTER TABLE "Assertion" DROP CONSTRAINT "Assertion_structured_value_check";
ALTER TABLE "Assertion" DROP CONSTRAINT "Assertion_canonical_doi_check";
DROP INDEX "Assertion_id_literatureId_key";
ALTER TABLE "Assertion"
    DROP COLUMN "structuredItemCount",
    DROP COLUMN "valueFingerprint";

ALTER TYPE "AssertionKind" RENAME TO "AssertionKind_phase2";
CREATE TYPE "AssertionKind" AS ENUM ('title', 'abstract', 'publicationYear', 'doi');
ALTER TABLE "Assertion"
    ALTER COLUMN "kind" TYPE "AssertionKind"
    USING "kind"::text::"AssertionKind";
DROP TYPE "AssertionKind_phase2";

ALTER TABLE "Assertion"
    ADD CONSTRAINT "Assertion_typed_value_check" CHECK (
        (
            "kind" IN ('title', 'abstract', 'doi')
            AND "textValue" IS NOT NULL
            AND char_length(btrim("textValue")) > 0
            AND "integerValue" IS NULL
        )
        OR (
            "kind" = 'publicationYear'
            AND "textValue" IS NULL
            AND "integerValue" IS NOT NULL
            AND "integerValue" BETWEEN 1000 AND 9999
        )
    ),
    ADD CONSTRAINT "Assertion_canonical_doi_check" CHECK (
        "kind" <> 'doi'
        OR ("textValue" = lower("textValue") AND "textValue" ~ '^10\.[0-9]{4,9}/[-._;()/:a-z0-9]+$')
    );

DROP TYPE "LiteratureIdentityKind";
DROP TYPE "LiteratureIdentifierScheme";
DROP TYPE "LiteratureOpenAccessVersion";
DROP TYPE "LiteratureOpenAccessHostType";
DROP TYPE "LiteratureImportSeedProviderKey";
DROP TYPE "LiteratureImportOperationStatus";
DROP TYPE "LiteratureImportWarningCode";
DROP TYPE "LiteratureImportFailureCode";

COMMIT;
