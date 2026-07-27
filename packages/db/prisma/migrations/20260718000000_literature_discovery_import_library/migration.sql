BEGIN;

DO $deployment_contract$
BEGIN
    IF current_setting('jixia.phase2_deployment_contract', true) IS DISTINCT FROM 'phase2-v1' THEN
        RAISE EXCEPTION USING
            ERRCODE = '42501',
            MESSAGE = 'Phase 2 must be deployed through pnpm db:deploy';
    END IF;

    IF NOT EXISTS (
        SELECT 1
        FROM pg_roles
        WHERE rolname = session_user
          AND rolsuper
    ) THEN
        RAISE EXCEPTION USING
            ERRCODE = '42501',
            MESSAGE = 'Phase 2 requires the privileged MIGRATION_DATABASE_URL identity';
    END IF;

    IF (
        SELECT count(*)
        FROM pg_roles
        WHERE rolname IN ('jixia_literature_cleanup_owner', 'jixia_literature_application')
    ) <> 2 OR EXISTS (
        SELECT 1
        FROM pg_roles
        WHERE rolname IN ('jixia_literature_cleanup_owner', 'jixia_literature_application')
          AND (
              rolcanlogin OR rolsuper OR rolcreatedb OR rolcreaterole OR rolinherit
              OR rolreplication OR rolbypassrls
          )
    ) THEN
        RAISE EXCEPTION USING
            ERRCODE = '42501',
            MESSAGE = 'Phase 2 fixed roles must be provisioned by pnpm db:deploy';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM pg_auth_members membership
        JOIN pg_roles granted_role ON granted_role.oid = membership.roleid
        JOIN pg_roles member_role ON member_role.oid = membership.member
        WHERE granted_role.rolname = 'jixia_literature_cleanup_owner'
           OR member_role.rolname = 'jixia_literature_cleanup_owner'
    ) THEN
        RAISE EXCEPTION USING
            ERRCODE = '42501',
            MESSAGE = 'jixia_literature_cleanup_owner must remain memberless';
    END IF;
END;
$deployment_contract$;

LOCK TABLE "Literature", "ProviderRecord", "Assertion", "ImportOperation" IN ACCESS EXCLUSIVE MODE;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM "ImportOperation" LIMIT 1) THEN
        RAISE EXCEPTION 'cannot migrate existing skeletal import operations';
    END IF;

    IF EXISTS (
        SELECT 1
        FROM "ProviderRecord" pr
        JOIN "Literature" l ON l."id" = pr."literatureId"
        WHERE l."ownerUserId" IS NOT NULL
        GROUP BY l."ownerUserId", pr."providerKey", pr."recordKey"
        HAVING count(DISTINCT pr."literatureId") > 1
    ) OR EXISTS (
        SELECT 1
        FROM "ProviderRecord" pr
        JOIN "Literature" l ON l."id" = pr."literatureId"
        WHERE l."projectId" IS NOT NULL
        GROUP BY l."projectId", pr."providerKey", pr."recordKey"
        HAVING count(DISTINCT pr."literatureId") > 1
    ) THEN
        RAISE EXCEPTION 'ambiguous provider identity backfill';
    END IF;

    IF EXISTS (
        WITH current_doi AS (
            SELECT DISTINCT ON (a."literatureId")
                a."literatureId",
                a."textValue" AS doi
            FROM "Assertion" a
            WHERE a."kind" = 'doi'
            ORDER BY a."literatureId", a."ordinal" DESC
        )
        SELECT 1
        FROM current_doi d
        JOIN "Literature" l ON l."id" = d."literatureId"
        WHERE l."ownerUserId" IS NOT NULL
        GROUP BY l."ownerUserId", d.doi
        HAVING count(DISTINCT d."literatureId") > 1
    ) OR EXISTS (
        WITH current_doi AS (
            SELECT DISTINCT ON (a."literatureId")
                a."literatureId",
                a."textValue" AS doi
            FROM "Assertion" a
            WHERE a."kind" = 'doi'
            ORDER BY a."literatureId", a."ordinal" DESC
        )
        SELECT 1
        FROM current_doi d
        JOIN "Literature" l ON l."id" = d."literatureId"
        WHERE l."projectId" IS NOT NULL
        GROUP BY l."projectId", d.doi
        HAVING count(DISTINCT d."literatureId") > 1
    ) THEN
        RAISE EXCEPTION 'ambiguous DOI identity backfill';
    END IF;
END;
$$;

ALTER TABLE "Assertion" DROP CONSTRAINT "Assertion_typed_value_check";
ALTER TABLE "Assertion" DROP CONSTRAINT "Assertion_canonical_doi_check";
ALTER TYPE "AssertionKind" RENAME TO "AssertionKind_phase1";
CREATE TYPE "AssertionKind" AS ENUM (
    'title',
    'abstract',
    'publicationYear',
    'doi',
    'publicationDate',
    'venue',
    'publicationType',
    'authors',
    'identifiers',
    'openAccess',
    'publisher'
);
ALTER TABLE "Assertion"
    ALTER COLUMN "kind" TYPE "AssertionKind"
    USING "kind"::text::"AssertionKind";
DROP TYPE "AssertionKind_phase1";

CREATE TYPE "LiteratureIdentityKind" AS ENUM ('doi', 'provider');
CREATE TYPE "LiteratureIdentifierScheme" AS ENUM ('doi', 'pmid', 'pmcid', 'openalex', 'issn', 'isbn');
CREATE TYPE "LiteratureOpenAccessVersion" AS ENUM ('published', 'accepted', 'submitted');
CREATE TYPE "LiteratureOpenAccessHostType" AS ENUM ('publisher', 'repository', 'other');
CREATE TYPE "LiteratureImportSeedProviderKey" AS ENUM ('openalex', 'crossref', 'pubmed');
CREATE TYPE "LiteratureImportOperationStatus" AS ENUM ('running', 'succeeded', 'failed');
CREATE TYPE "LiteratureImportWarningCode" AS ENUM (
    'openalex_enrichment_unavailable',
    'crossref_enrichment_unavailable',
    'pubmed_enrichment_unavailable',
    'pmc_enrichment_unavailable',
    'unpaywall_enrichment_unavailable'
);
CREATE TYPE "LiteratureImportFailureCode" AS ENUM (
    'provider_unconfigured',
    'seed_not_found',
    'seed_unavailable',
    'invalid_provider_response',
    'identity_conflict',
    'authorization_revoked',
    'persistence_failed',
    'internal_error'
);

ALTER TABLE "Assertion"
    ADD COLUMN "structuredItemCount" INTEGER,
    ADD COLUMN "valueFingerprint" TEXT,
    ADD CONSTRAINT "Assertion_typed_value_check" CHECK (
        (
            "kind" IN ('title', 'abstract', 'doi', 'publicationDate', 'venue', 'publicationType')
            AND "textValue" IS NOT NULL
            AND char_length(btrim("textValue")) > 0
            AND "integerValue" IS NULL
            AND "structuredItemCount" IS NULL
            AND "valueFingerprint" IS NULL
        )
        OR (
            "kind" = 'publicationYear'
            AND "textValue" IS NULL
            AND "integerValue" IS NOT NULL
            AND "integerValue" BETWEEN 1000 AND 9999
            AND "structuredItemCount" IS NULL
            AND "valueFingerprint" IS NULL
        )
        OR (
            "kind" IN ('authors', 'identifiers')
            AND "textValue" IS NULL
            AND "integerValue" IS NULL
            AND "structuredItemCount" BETWEEN 1 AND 1000
            AND "valueFingerprint" ~ '^[0-9a-f]{64}$'
        )
        OR (
            "kind" IN ('openAccess', 'publisher')
            AND "textValue" IS NULL
            AND "integerValue" IS NULL
            AND "structuredItemCount" = 1
            AND "valueFingerprint" ~ '^[0-9a-f]{64}$'
        )
    ),
    ADD CONSTRAINT "Assertion_text_value_length_check" CHECK (
        "textValue" IS NULL
        OR char_length("textValue") <= CASE "kind"
            WHEN 'abstract' THEN 200000
            WHEN 'title' THEN 4096
            WHEN 'venue' THEN 1024
            WHEN 'publicationType' THEN 128
            ELSE 512
        END
    ),
    ADD CONSTRAINT "Assertion_structured_value_check" CHECK (
        (
            "kind" IN ('authors', 'identifiers', 'openAccess', 'publisher')
            AND "structuredItemCount" IS NOT NULL
            AND "valueFingerprint" IS NOT NULL
        )
        OR (
            "kind" NOT IN ('authors', 'identifiers', 'openAccess', 'publisher')
            AND "structuredItemCount" IS NULL
            AND "valueFingerprint" IS NULL
        )
    ),
    ADD CONSTRAINT "Assertion_canonical_doi_check" CHECK (
        "kind" <> 'doi'
        OR ("textValue" = lower("textValue") AND "textValue" ~ '^10\.[0-9]{4,9}/[-._;()/:a-z0-9]+$')
    );

CREATE UNIQUE INDEX "Assertion_id_literatureId_key" ON "Assertion"("id", "literatureId");

CREATE TABLE "AssertionAuthor" (
    "assertionId" TEXT NOT NULL,
    "literatureId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "displayName" TEXT NOT NULL,
    "orcid" TEXT,

    CONSTRAINT "AssertionAuthor_pkey" PRIMARY KEY ("assertionId", "position"),
    CONSTRAINT "AssertionAuthor_position_check" CHECK ("position" BETWEEN 0 AND 999),
    CONSTRAINT "AssertionAuthor_display_name_check" CHECK (char_length(btrim("displayName")) BETWEEN 1 AND 512),
    CONSTRAINT "AssertionAuthor_orcid_check" CHECK (
        "orcid" IS NULL OR "orcid" ~ '^[0-9]{4}-[0-9]{4}-[0-9]{4}-[0-9]{3}[0-9X]$'
    )
);

CREATE TABLE "AssertionIdentifier" (
    "assertionId" TEXT NOT NULL,
    "literatureId" TEXT NOT NULL,
    "position" INTEGER NOT NULL,
    "scheme" "LiteratureIdentifierScheme" NOT NULL,
    "value" TEXT NOT NULL,

    CONSTRAINT "AssertionIdentifier_pkey" PRIMARY KEY ("assertionId", "position"),
    CONSTRAINT "AssertionIdentifier_position_check" CHECK ("position" BETWEEN 0 AND 999),
    CONSTRAINT "AssertionIdentifier_value_check" CHECK (char_length(btrim("value")) BETWEEN 1 AND 1024)
);

CREATE TABLE "AssertionOpenAccess" (
    "assertionId" TEXT NOT NULL,
    "literatureId" TEXT NOT NULL,
    "isOpenAccess" BOOLEAN NOT NULL,
    "bestUrl" TEXT,
    "license" TEXT,
    "version" "LiteratureOpenAccessVersion",
    "hostType" "LiteratureOpenAccessHostType",

    CONSTRAINT "AssertionOpenAccess_pkey" PRIMARY KEY ("assertionId"),
    CONSTRAINT "AssertionOpenAccess_assertionId_literatureId_key" UNIQUE ("assertionId", "literatureId"),
    CONSTRAINT "AssertionOpenAccess_best_url_check" CHECK (
        "bestUrl" IS NULL OR char_length(btrim("bestUrl")) BETWEEN 1 AND 2048
    ),
    CONSTRAINT "AssertionOpenAccess_license_check" CHECK (
        "license" IS NULL OR char_length(btrim("license")) BETWEEN 1 AND 255
    )
);

CREATE TABLE "AssertionPublisher" (
    "assertionId" TEXT NOT NULL,
    "literatureId" TEXT NOT NULL,
    "name" TEXT,
    "landingPageUrl" TEXT,

    CONSTRAINT "AssertionPublisher_pkey" PRIMARY KEY ("assertionId"),
    CONSTRAINT "AssertionPublisher_assertionId_literatureId_key" UNIQUE ("assertionId", "literatureId"),
    CONSTRAINT "AssertionPublisher_value_check" CHECK (
        ("name" IS NOT NULL OR "landingPageUrl" IS NOT NULL)
        AND ("name" IS NULL OR char_length(btrim("name")) BETWEEN 1 AND 512)
        AND ("landingPageUrl" IS NULL OR char_length(btrim("landingPageUrl")) BETWEEN 1 AND 2048)
    )
);

CREATE INDEX "AssertionAuthor_assertionId_literatureId_idx" ON "AssertionAuthor"("assertionId", "literatureId");
CREATE INDEX "AssertionIdentifier_assertionId_literatureId_idx" ON "AssertionIdentifier"("assertionId", "literatureId");
CREATE INDEX "AssertionOpenAccess_assertionId_literatureId_idx" ON "AssertionOpenAccess"("assertionId", "literatureId");
CREATE INDEX "AssertionPublisher_assertionId_literatureId_idx" ON "AssertionPublisher"("assertionId", "literatureId");

ALTER TABLE "AssertionAuthor"
    ADD CONSTRAINT "AssertionAuthor_assertionId_literatureId_fkey"
    FOREIGN KEY ("assertionId", "literatureId") REFERENCES "Assertion"("id", "literatureId")
    ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AssertionIdentifier"
    ADD CONSTRAINT "AssertionIdentifier_assertionId_literatureId_fkey"
    FOREIGN KEY ("assertionId", "literatureId") REFERENCES "Assertion"("id", "literatureId")
    ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AssertionOpenAccess"
    ADD CONSTRAINT "AssertionOpenAccess_assertionId_literatureId_fkey"
    FOREIGN KEY ("assertionId", "literatureId") REFERENCES "Assertion"("id", "literatureId")
    ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "AssertionPublisher"
    ADD CONSTRAINT "AssertionPublisher_assertionId_literatureId_fkey"
    FOREIGN KEY ("assertionId", "literatureId") REFERENCES "Assertion"("id", "literatureId")
    ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE OR REPLACE FUNCTION "reject_append_only_change"() RETURNS trigger
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = pg_catalog, pg_temp
AS $$
BEGIN
    IF TG_OP = 'DELETE'
       AND current_user = 'jixia_literature_cleanup_owner' THEN
        RETURN NULL;
    END IF;
    RAISE EXCEPTION '% is append-only; % is not allowed', TG_TABLE_NAME, TG_OP;
END;
$$;

CREATE TRIGGER "AssertionAuthor_append_only_trigger"
BEFORE UPDATE OR DELETE OR TRUNCATE ON "AssertionAuthor"
FOR EACH STATEMENT EXECUTE FUNCTION "reject_append_only_change"();
CREATE TRIGGER "AssertionIdentifier_append_only_trigger"
BEFORE UPDATE OR DELETE OR TRUNCATE ON "AssertionIdentifier"
FOR EACH STATEMENT EXECUTE FUNCTION "reject_append_only_change"();
CREATE TRIGGER "AssertionOpenAccess_append_only_trigger"
BEFORE UPDATE OR DELETE OR TRUNCATE ON "AssertionOpenAccess"
FOR EACH STATEMENT EXECUTE FUNCTION "reject_append_only_change"();
CREATE TRIGGER "AssertionPublisher_append_only_trigger"
BEFORE UPDATE OR DELETE OR TRUNCATE ON "AssertionPublisher"
FOR EACH STATEMENT EXECUTE FUNCTION "reject_append_only_change"();

CREATE FUNCTION "enforce_assertion_structured_value"() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
    target_assertion_id TEXT;
    target_kind "AssertionKind";
    expected_count INTEGER;
    author_count INTEGER;
    author_min INTEGER;
    author_max INTEGER;
    identifier_count INTEGER;
    identifier_min INTEGER;
    identifier_max INTEGER;
    open_access_count INTEGER;
    publisher_count INTEGER;
    valid_shape BOOLEAN;
BEGIN
    IF TG_TABLE_NAME = 'Assertion' THEN
        target_assertion_id := NEW."id";
    ELSE
        target_assertion_id := NEW."assertionId";
    END IF;

    SELECT "kind", "structuredItemCount"
    INTO target_kind, expected_count
    FROM "Assertion"
    WHERE "id" = target_assertion_id;

    IF NOT FOUND THEN
        RETURN NEW;
    END IF;

    SELECT count(*)::integer, min("position"), max("position")
    INTO author_count, author_min, author_max
    FROM "AssertionAuthor"
    WHERE "assertionId" = target_assertion_id;

    SELECT count(*)::integer, min("position"), max("position")
    INTO identifier_count, identifier_min, identifier_max
    FROM "AssertionIdentifier"
    WHERE "assertionId" = target_assertion_id;

    SELECT count(*)::integer
    INTO open_access_count
    FROM "AssertionOpenAccess"
    WHERE "assertionId" = target_assertion_id;

    SELECT count(*)::integer
    INTO publisher_count
    FROM "AssertionPublisher"
    WHERE "assertionId" = target_assertion_id;

    valid_shape := CASE target_kind
        WHEN 'authors' THEN
            author_count = expected_count
            AND author_min = 0
            AND author_max = expected_count - 1
            AND identifier_count = 0
            AND open_access_count = 0
            AND publisher_count = 0
        WHEN 'identifiers' THEN
            identifier_count = expected_count
            AND identifier_min = 0
            AND identifier_max = expected_count - 1
            AND author_count = 0
            AND open_access_count = 0
            AND publisher_count = 0
        WHEN 'openAccess' THEN
            open_access_count = 1
            AND author_count = 0
            AND identifier_count = 0
            AND publisher_count = 0
        WHEN 'publisher' THEN
            publisher_count = 1
            AND author_count = 0
            AND identifier_count = 0
            AND open_access_count = 0
        ELSE
            author_count = 0
            AND identifier_count = 0
            AND open_access_count = 0
            AND publisher_count = 0
    END;

    IF NOT valid_shape THEN
        RAISE EXCEPTION USING
            ERRCODE = '23514',
            CONSTRAINT = 'Assertion_structured_value_check',
            MESSAGE = 'Assertion structured value does not match its kind and declared cardinality';
    END IF;

    RETURN NEW;
END;
$$;

CREATE CONSTRAINT TRIGGER "Assertion_structured_value_trigger"
AFTER INSERT ON "Assertion"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION "enforce_assertion_structured_value"();
CREATE CONSTRAINT TRIGGER "Assertion_structured_value_trigger"
AFTER INSERT ON "AssertionAuthor"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION "enforce_assertion_structured_value"();
CREATE CONSTRAINT TRIGGER "Assertion_structured_value_trigger"
AFTER INSERT ON "AssertionIdentifier"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION "enforce_assertion_structured_value"();
CREATE CONSTRAINT TRIGGER "Assertion_structured_value_trigger"
AFTER INSERT ON "AssertionOpenAccess"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION "enforce_assertion_structured_value"();
CREATE CONSTRAINT TRIGGER "Assertion_structured_value_trigger"
AFTER INSERT ON "AssertionPublisher"
DEFERRABLE INITIALLY DEFERRED
FOR EACH ROW EXECUTE FUNCTION "enforce_assertion_structured_value"();

CREATE TABLE "LiteratureIdentity" (
    "id" TEXT NOT NULL,
    "literatureId" TEXT NOT NULL,
    "ownerUserId" TEXT,
    "projectId" TEXT,
    "kind" "LiteratureIdentityKind" NOT NULL,
    "providerKey" TEXT,
    "identityValue" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "LiteratureIdentity_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "LiteratureIdentity_owner_xor_check" CHECK (
        ("ownerUserId" IS NOT NULL AND "projectId" IS NULL)
        OR ("ownerUserId" IS NULL AND "projectId" IS NOT NULL)
    ),
    CONSTRAINT "LiteratureIdentity_kind_shape_check" CHECK (
        ("kind" = 'doi' AND "providerKey" IS NULL)
        OR (
            "kind" = 'provider'
            AND "providerKey" IS NOT NULL
            AND char_length(btrim("providerKey")) BETWEEN 1 AND 128
        )
    ),
    CONSTRAINT "LiteratureIdentity_value_check" CHECK (
        char_length(btrim("identityValue")) BETWEEN 1 AND 512
        AND (
            "kind" <> 'doi'
            OR (
                "identityValue" = lower("identityValue")
                AND "identityValue" ~ '^10\.[0-9]{4,9}/[-._;()/:a-z0-9]+$'
            )
        )
    )
);

CREATE INDEX "LiteratureIdentity_literatureId_idx" ON "LiteratureIdentity"("literatureId");
CREATE INDEX "LiteratureIdentity_ownerUserId_idx" ON "LiteratureIdentity"("ownerUserId");
CREATE INDEX "LiteratureIdentity_projectId_idx" ON "LiteratureIdentity"("projectId");
CREATE UNIQUE INDEX "LiteratureIdentity_personal_doi_key"
    ON "LiteratureIdentity"("ownerUserId", "identityValue")
    WHERE "ownerUserId" IS NOT NULL AND "kind" = 'doi';
CREATE UNIQUE INDEX "LiteratureIdentity_project_doi_key"
    ON "LiteratureIdentity"("projectId", "identityValue")
    WHERE "projectId" IS NOT NULL AND "kind" = 'doi';
CREATE UNIQUE INDEX "LiteratureIdentity_personal_provider_key"
    ON "LiteratureIdentity"("ownerUserId", "providerKey", "identityValue")
    WHERE "ownerUserId" IS NOT NULL AND "kind" = 'provider';
CREATE UNIQUE INDEX "LiteratureIdentity_project_provider_key"
    ON "LiteratureIdentity"("projectId", "providerKey", "identityValue")
    WHERE "projectId" IS NOT NULL AND "kind" = 'provider';

ALTER TABLE "LiteratureIdentity"
    ADD CONSTRAINT "LiteratureIdentity_literatureId_fkey"
    FOREIGN KEY ("literatureId") REFERENCES "Literature"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "LiteratureIdentity"
    ADD CONSTRAINT "LiteratureIdentity_ownerUserId_fkey"
    FOREIGN KEY ("ownerUserId") REFERENCES "User"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "LiteratureIdentity"
    ADD CONSTRAINT "LiteratureIdentity_projectId_fkey"
    FOREIGN KEY ("projectId") REFERENCES "Project"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE FUNCTION "enforce_literature_identity_scope"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    PERFORM 1
    FROM "Literature" l
    WHERE l."id" = NEW."literatureId"
      AND l."ownerUserId" IS NOT DISTINCT FROM NEW."ownerUserId"
      AND l."projectId" IS NOT DISTINCT FROM NEW."projectId";

    IF NOT FOUND THEN
        RAISE EXCEPTION USING
            ERRCODE = '23514',
            CONSTRAINT = 'LiteratureIdentity_scope_check',
            MESSAGE = 'LiteratureIdentity scope must exactly match Literature';
    END IF;

    RETURN NEW;
END;
$$;

CREATE TRIGGER "LiteratureIdentity_scope_trigger"
BEFORE INSERT OR UPDATE ON "LiteratureIdentity"
FOR EACH ROW EXECUTE FUNCTION "enforce_literature_identity_scope"();
CREATE TRIGGER "LiteratureIdentity_append_only_trigger"
BEFORE UPDATE OR DELETE OR TRUNCATE ON "LiteratureIdentity"
FOR EACH STATEMENT EXECUTE FUNCTION "reject_append_only_change"();

ALTER TABLE "ImportOperation"
    ADD COLUMN "idempotencyKey" TEXT NOT NULL,
    ADD COLUMN "requestFingerprint" TEXT NOT NULL,
    ADD COLUMN "sourceProviderKey" "LiteratureImportSeedProviderKey" NOT NULL,
    ADD COLUMN "sourceRecordKey" TEXT NOT NULL,
    ADD COLUMN "status" "LiteratureImportOperationStatus" NOT NULL,
    ADD COLUMN "attemptCount" INTEGER NOT NULL,
    ADD COLUMN "attemptStartedAt" TIMESTAMP(3) NOT NULL,
    ADD COLUMN "takeoverAfter" TIMESTAMP(3),
    ADD COLUMN "finishedAttemptCount" INTEGER,
    ADD COLUMN "finishedAt" TIMESTAMP(3),
    ADD COLUMN "literatureId" TEXT,
    ADD COLUMN "warningCodes" "LiteratureImportWarningCode"[] NOT NULL DEFAULT ARRAY[]::"LiteratureImportWarningCode"[],
    ADD COLUMN "failureCode" "LiteratureImportFailureCode",
    ADD CONSTRAINT "ImportOperation_request_shape_check" CHECK (
        char_length(btrim("idempotencyKey")) BETWEEN 1 AND 255
        AND "requestFingerprint" ~ '^[0-9a-f]{64}$'
        AND char_length(btrim("sourceRecordKey")) BETWEEN 1 AND 512
    ),
    ADD CONSTRAINT "ImportOperation_attempt_count_check" CHECK (
        "attemptCount" >= 1
        AND ("finishedAttemptCount" IS NULL OR "finishedAttemptCount" BETWEEN 1 AND "attemptCount")
    ),
    ADD CONSTRAINT "ImportOperation_warning_codes_check" CHECK (
        cardinality("warningCodes") <= 5
        AND array_position("warningCodes", NULL) IS NULL
    ),
    ADD CONSTRAINT "ImportOperation_state_shape_check" CHECK (
        (
            "status" = 'running'
            AND "takeoverAfter" IS NOT NULL
            AND "finishedAttemptCount" IS NULL
            AND "finishedAt" IS NULL
            AND "literatureId" IS NULL
            AND "failureCode" IS NULL
            AND cardinality("warningCodes") = 0
        )
        OR (
            "status" = 'succeeded'
            AND "takeoverAfter" IS NULL
            AND "finishedAttemptCount" = "attemptCount"
            AND "finishedAt" IS NOT NULL
            AND "literatureId" IS NOT NULL
            AND "failureCode" IS NULL
        )
        OR (
            "status" = 'failed'
            AND "takeoverAfter" IS NULL
            AND "finishedAttemptCount" = "attemptCount"
            AND "finishedAt" IS NOT NULL
            AND "literatureId" IS NULL
            AND "failureCode" IS NOT NULL
        )
    );

CREATE UNIQUE INDEX "ImportOperation_createdByUserId_idempotencyKey_key"
    ON "ImportOperation"("createdByUserId", "idempotencyKey");
CREATE INDEX "ImportOperation_literatureId_idx" ON "ImportOperation"("literatureId");
ALTER TABLE "ImportOperation"
    ADD CONSTRAINT "ImportOperation_literatureId_fkey"
    FOREIGN KEY ("literatureId") REFERENCES "Literature"("id")
    ON DELETE RESTRICT ON UPDATE CASCADE;

CREATE OR REPLACE FUNCTION "enforce_import_operation_scope_immutable"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF NEW."id" IS DISTINCT FROM OLD."id"
       OR NEW."ownerUserId" IS DISTINCT FROM OLD."ownerUserId"
       OR NEW."projectId" IS DISTINCT FROM OLD."projectId"
       OR NEW."createdByUserId" IS DISTINCT FROM OLD."createdByUserId"
       OR NEW."idempotencyKey" IS DISTINCT FROM OLD."idempotencyKey"
       OR NEW."requestFingerprint" IS DISTINCT FROM OLD."requestFingerprint"
       OR NEW."sourceProviderKey" IS DISTINCT FROM OLD."sourceProviderKey"
       OR NEW."sourceRecordKey" IS DISTINCT FROM OLD."sourceRecordKey"
       OR NEW."createdAt" IS DISTINCT FROM OLD."createdAt" THEN
        RAISE EXCEPTION 'ImportOperation ownership and identity are immutable';
    END IF;
    RETURN NEW;
END;
$$;

CREATE FUNCTION "enforce_import_operation_result_scope"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF NEW."literatureId" IS NULL THEN
        RETURN NEW;
    END IF;

    PERFORM 1
    FROM "Literature" l
    WHERE l."id" = NEW."literatureId"
      AND l."ownerUserId" IS NOT DISTINCT FROM NEW."ownerUserId"
      AND l."projectId" IS NOT DISTINCT FROM NEW."projectId";

    IF NOT FOUND THEN
        RAISE EXCEPTION USING
            ERRCODE = '23514',
            CONSTRAINT = 'ImportOperation_result_scope_check',
            MESSAGE = 'ImportOperation result scope must exactly match Literature';
    END IF;

    RETURN NEW;
END;
$$;

CREATE FUNCTION "enforce_import_operation_transition"() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
    valid_transition BOOLEAN;
BEGIN
    valid_transition := CASE OLD."status"
        WHEN 'running' THEN
            (
                NEW."status" IN ('succeeded', 'failed')
                AND NEW."attemptCount" = OLD."attemptCount"
                AND NEW."finishedAttemptCount" = OLD."attemptCount"
            )
            OR (
                NEW."status" = 'running'
                AND OLD."takeoverAfter" <= CURRENT_TIMESTAMP
                AND NEW."attemptCount" = OLD."attemptCount" + 1
                AND NEW."finishedAttemptCount" IS NULL
                AND NEW."finishedAt" IS NULL
                AND NEW."literatureId" IS NULL
                AND NEW."failureCode" IS NULL
            )
        WHEN 'failed' THEN
            NEW."status" = 'running'
            AND NEW."attemptCount" = OLD."attemptCount" + 1
            AND NEW."finishedAttemptCount" IS NULL
            AND NEW."finishedAt" IS NULL
            AND NEW."literatureId" IS NULL
            AND NEW."failureCode" IS NULL
        WHEN 'succeeded' THEN false
    END;

    IF NOT valid_transition THEN
        RAISE EXCEPTION USING
            ERRCODE = '23514',
            CONSTRAINT = 'ImportOperation_transition_check',
            MESSAGE = 'ImportOperation transition is not allowed';
    END IF;

    RETURN NEW;
END;
$$;

CREATE TRIGGER "ImportOperation_result_scope_trigger"
BEFORE INSERT OR UPDATE ON "ImportOperation"
FOR EACH ROW EXECUTE FUNCTION "enforce_import_operation_result_scope"();
CREATE TRIGGER "ImportOperation_transition_trigger"
BEFORE UPDATE ON "ImportOperation"
FOR EACH ROW EXECUTE FUNCTION "enforce_import_operation_transition"();

CREATE FUNCTION "delete_literature_aggregate"(target_literature_id TEXT)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = pg_catalog, public, pg_temp
AS $$
DECLARE
    deleted_literature_count INTEGER;
BEGIN
    DELETE FROM public."CitationOccurrence"
    WHERE "literatureId" = target_literature_id;
    DELETE FROM public."Annotation"
    WHERE "literatureId" = target_literature_id;
    DELETE FROM public."Evidence"
    WHERE "literatureId" = target_literature_id;
    DELETE FROM public."Excerpt"
    WHERE "literatureId" = target_literature_id;
    DELETE FROM public."RelationAssertion"
    WHERE "subjectLiteratureId" = target_literature_id
       OR "objectLiteratureId" = target_literature_id;
    DELETE FROM public."SourceRevision"
    WHERE "literatureId" = target_literature_id;
    DELETE FROM public."AssertionAuthor"
    WHERE "literatureId" = target_literature_id;
    DELETE FROM public."AssertionIdentifier"
    WHERE "literatureId" = target_literature_id;
    DELETE FROM public."AssertionOpenAccess"
    WHERE "literatureId" = target_literature_id;
    DELETE FROM public."AssertionPublisher"
    WHERE "literatureId" = target_literature_id;
    DELETE FROM public."Assertion"
    WHERE "literatureId" = target_literature_id;
    DELETE FROM public."ImportOperation"
    WHERE "literatureId" = target_literature_id;
    DELETE FROM public."LiteratureIdentity"
    WHERE "literatureId" = target_literature_id;
    DELETE FROM public."ProviderRecord"
    WHERE "literatureId" = target_literature_id;
    DELETE FROM public."Literature"
    WHERE "id" = target_literature_id;
    GET DIAGNOSTICS deleted_literature_count = ROW_COUNT;

    RETURN deleted_literature_count = 1;
END;
$$;

ALTER FUNCTION "delete_literature_aggregate"(TEXT)
    OWNER TO "jixia_literature_cleanup_owner";
REVOKE ALL ON FUNCTION "delete_literature_aggregate"(TEXT) FROM PUBLIC;
GRANT EXECUTE ON FUNCTION "delete_literature_aggregate"(TEXT)
    TO "jixia_literature_application";
GRANT USAGE ON SCHEMA public
    TO "jixia_literature_cleanup_owner", "jixia_literature_application";
GRANT SELECT, DELETE ON TABLE
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
TO "jixia_literature_cleanup_owner";

INSERT INTO "LiteratureIdentity" (
    "id", "literatureId", "ownerUserId", "projectId", "kind", "providerKey", "identityValue", "createdAt"
)
SELECT
    'provider:' || pr."id",
    pr."literatureId",
    l."ownerUserId",
    l."projectId",
    'provider',
    pr."providerKey",
    pr."recordKey",
    pr."createdAt"
FROM "ProviderRecord" pr
JOIN "Literature" l ON l."id" = pr."literatureId";

WITH current_doi AS (
    SELECT DISTINCT ON (a."literatureId")
        a."id",
        a."literatureId",
        a."textValue" AS doi,
        a."createdAt"
    FROM "Assertion" a
    WHERE a."kind" = 'doi'
    ORDER BY a."literatureId", a."ordinal" DESC
)
INSERT INTO "LiteratureIdentity" (
    "id", "literatureId", "ownerUserId", "projectId", "kind", "providerKey", "identityValue", "createdAt"
)
SELECT
    'doi:' || d."id",
    d."literatureId",
    l."ownerUserId",
    l."projectId",
    'doi',
    NULL,
    d.doi,
    d."createdAt"
FROM current_doi d
JOIN "Literature" l ON l."id" = d."literatureId";

COMMIT;
