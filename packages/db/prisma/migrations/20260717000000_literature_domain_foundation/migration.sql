-- CreateEnum
CREATE TYPE "AssertionKind" AS ENUM ('title', 'abstract', 'publicationYear', 'doi');
CREATE TYPE "RelationKind" AS ENUM ('cites');

-- Extend composite provenance support on existing revisions.
CREATE UNIQUE INDEX "DocumentRevision_id_documentId_key" ON "DocumentRevision"("id", "documentId");

-- CreateTable
CREATE TABLE "Literature" (
    "id" TEXT NOT NULL,
    "ownerUserId" TEXT,
    "projectId" TEXT,
    "createdByUserId" TEXT NOT NULL,
    "nextAssertionOrdinal" INTEGER NOT NULL DEFAULT 1,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Literature_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "Literature_owner_xor_check" CHECK (("ownerUserId" IS NOT NULL AND "projectId" IS NULL) OR ("ownerUserId" IS NULL AND "projectId" IS NOT NULL)),
    CONSTRAINT "Literature_next_assertion_ordinal_check" CHECK ("nextAssertionOrdinal" >= 1)
);

CREATE TABLE "ProviderRecord" (
    "id" TEXT NOT NULL,
    "literatureId" TEXT NOT NULL,
    "providerKey" TEXT NOT NULL,
    "recordKey" TEXT NOT NULL,
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "ProviderRecord_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ProviderRecord_provider_key_check" CHECK (char_length(btrim("providerKey")) BETWEEN 1 AND 128),
    CONSTRAINT "ProviderRecord_record_key_check" CHECK (char_length(btrim("recordKey")) BETWEEN 1 AND 512)
);

CREATE TABLE "Assertion" (
    "id" TEXT NOT NULL,
    "literatureId" TEXT NOT NULL,
    "providerRecordId" TEXT NOT NULL,
    "ordinal" INTEGER NOT NULL,
    "kind" "AssertionKind" NOT NULL,
    "textValue" TEXT,
    "integerValue" INTEGER,
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Assertion_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "Assertion_ordinal_check" CHECK ("ordinal" > 0),
    CONSTRAINT "Assertion_typed_value_check" CHECK (
        ("kind" IN ('title', 'abstract', 'doi') AND "textValue" IS NOT NULL AND char_length(btrim("textValue")) > 0 AND "integerValue" IS NULL)
        OR ("kind" = 'publicationYear' AND "textValue" IS NULL AND "integerValue" IS NOT NULL AND "integerValue" BETWEEN 1000 AND 9999)
    ),
    CONSTRAINT "Assertion_canonical_doi_check" CHECK (
        "kind" <> 'doi' OR ("textValue" = lower("textValue") AND "textValue" ~ '^10\.[0-9]{4,9}/[-._;()/:a-z0-9]+$')
    )
);

CREATE TABLE "RelationAssertion" (
    "id" TEXT NOT NULL,
    "subjectLiteratureId" TEXT NOT NULL,
    "objectLiteratureId" TEXT NOT NULL,
    "sourceRevisionId" TEXT NOT NULL,
    "kind" "RelationKind" NOT NULL,
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "RelationAssertion_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "RelationAssertion_distinct_literature_check" CHECK ("subjectLiteratureId" <> "objectLiteratureId")
);

CREATE TABLE "ImportOperation" (
    "id" TEXT NOT NULL,
    "ownerUserId" TEXT,
    "projectId" TEXT,
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ImportOperation_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "ImportOperation_owner_xor_check" CHECK (("ownerUserId" IS NOT NULL AND "projectId" IS NULL) OR ("ownerUserId" IS NULL AND "projectId" IS NOT NULL))
);

CREATE TABLE "SourceRevision" (
    "id" TEXT NOT NULL,
    "literatureId" TEXT NOT NULL,
    "providerRecordId" TEXT NOT NULL,
    "revisionNumber" INTEGER NOT NULL,
    "sha256" TEXT NOT NULL,
    "mediaType" TEXT NOT NULL,
    "byteLength" BIGINT NOT NULL,
    "capturedAt" TIMESTAMP(3) NOT NULL,
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SourceRevision_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "SourceRevision_revision_number_check" CHECK ("revisionNumber" > 0),
    CONSTRAINT "SourceRevision_sha256_check" CHECK ("sha256" ~ '^[0-9a-f]{64}$'),
    CONSTRAINT "SourceRevision_media_type_check" CHECK (char_length(btrim("mediaType")) > 0),
    CONSTRAINT "SourceRevision_byte_length_check" CHECK ("byteLength" >= 0)
);

CREATE TABLE "Annotation" (
    "id" TEXT NOT NULL,
    "literatureId" TEXT NOT NULL,
    "excerptId" TEXT NOT NULL,
    "authorUserId" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Annotation_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "Annotation_body_check" CHECK (char_length(btrim("body")) > 0)
);

CREATE TABLE "Excerpt" (
    "id" TEXT NOT NULL,
    "literatureId" TEXT NOT NULL,
    "sourceRevisionId" TEXT NOT NULL,
    "startByte" INTEGER NOT NULL,
    "endByte" INTEGER NOT NULL,
    "quote" TEXT NOT NULL,
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Excerpt_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "Excerpt_range_check" CHECK ("startByte" >= 0 AND "endByte" > "startByte"),
    CONSTRAINT "Excerpt_quote_check" CHECK (char_length("quote") > 0)
);

CREATE TABLE "Evidence" (
    "id" TEXT NOT NULL,
    "literatureId" TEXT NOT NULL,
    "excerptId" TEXT NOT NULL,
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Evidence_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "NotebookProjection" (
    "id" TEXT NOT NULL,
    "documentId" TEXT NOT NULL,
    "documentRevisionId" TEXT NOT NULL,
    "projectionVersion" INTEGER NOT NULL,
    "schemaVersion" INTEGER NOT NULL,
    "createdByUserId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "NotebookProjection_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "NotebookProjection_version_check" CHECK ("projectionVersion" > 0 AND "schemaVersion" > 0)
);

CREATE TABLE "CitationOccurrence" (
    "id" TEXT NOT NULL,
    "notebookProjectionId" TEXT NOT NULL,
    "evidenceId" TEXT NOT NULL,
    "literatureId" TEXT NOT NULL,
    "semanticKey" TEXT NOT NULL,
    "sourceOrder" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CitationOccurrence_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "CitationOccurrence_semantic_key_check" CHECK (char_length(btrim("semanticKey")) > 0),
    CONSTRAINT "CitationOccurrence_source_order_check" CHECK ("sourceOrder" > 0)
);

-- CreateIndex
CREATE INDEX "Literature_ownerUserId_idx" ON "Literature"("ownerUserId");
CREATE INDEX "Literature_projectId_idx" ON "Literature"("projectId");
CREATE INDEX "Literature_createdByUserId_idx" ON "Literature"("createdByUserId");
CREATE UNIQUE INDEX "ProviderRecord_literatureId_providerKey_recordKey_key" ON "ProviderRecord"("literatureId", "providerKey", "recordKey");
CREATE UNIQUE INDEX "ProviderRecord_id_literatureId_key" ON "ProviderRecord"("id", "literatureId");
CREATE INDEX "ProviderRecord_createdByUserId_idx" ON "ProviderRecord"("createdByUserId");
CREATE UNIQUE INDEX "Assertion_literatureId_ordinal_key" ON "Assertion"("literatureId", "ordinal");
CREATE INDEX "Assertion_providerRecordId_literatureId_idx" ON "Assertion"("providerRecordId", "literatureId");
CREATE INDEX "Assertion_createdByUserId_idx" ON "Assertion"("createdByUserId");
CREATE UNIQUE INDEX "RelationAssertion_sourceRevisionId_kind_objectLiteratureId_key" ON "RelationAssertion"("sourceRevisionId", "kind", "objectLiteratureId");
CREATE INDEX "RelationAssertion_subjectLiteratureId_idx" ON "RelationAssertion"("subjectLiteratureId");
CREATE INDEX "RelationAssertion_objectLiteratureId_idx" ON "RelationAssertion"("objectLiteratureId");
CREATE INDEX "RelationAssertion_createdByUserId_idx" ON "RelationAssertion"("createdByUserId");
CREATE INDEX "ImportOperation_ownerUserId_idx" ON "ImportOperation"("ownerUserId");
CREATE INDEX "ImportOperation_projectId_idx" ON "ImportOperation"("projectId");
CREATE INDEX "ImportOperation_createdByUserId_idx" ON "ImportOperation"("createdByUserId");
CREATE UNIQUE INDEX "SourceRevision_providerRecordId_revisionNumber_key" ON "SourceRevision"("providerRecordId", "revisionNumber");
CREATE UNIQUE INDEX "SourceRevision_providerRecordId_sha256_key" ON "SourceRevision"("providerRecordId", "sha256");
CREATE UNIQUE INDEX "SourceRevision_id_literatureId_key" ON "SourceRevision"("id", "literatureId");
CREATE INDEX "SourceRevision_createdByUserId_idx" ON "SourceRevision"("createdByUserId");
CREATE INDEX "Annotation_literatureId_idx" ON "Annotation"("literatureId");
CREATE INDEX "Annotation_authorUserId_idx" ON "Annotation"("authorUserId");
CREATE UNIQUE INDEX "Excerpt_sourceRevisionId_startByte_endByte_key" ON "Excerpt"("sourceRevisionId", "startByte", "endByte");
CREATE UNIQUE INDEX "Excerpt_id_literatureId_key" ON "Excerpt"("id", "literatureId");
CREATE INDEX "Excerpt_createdByUserId_idx" ON "Excerpt"("createdByUserId");
CREATE UNIQUE INDEX "Evidence_literatureId_excerptId_key" ON "Evidence"("literatureId", "excerptId");
CREATE UNIQUE INDEX "Evidence_id_literatureId_key" ON "Evidence"("id", "literatureId");
CREATE INDEX "Evidence_createdByUserId_idx" ON "Evidence"("createdByUserId");
CREATE UNIQUE INDEX "NotebookProjection_documentId_projectionVersion_key" ON "NotebookProjection"("documentId", "projectionVersion");
CREATE UNIQUE INDEX "NotebookProjection_documentRevisionId_schemaVersion_key" ON "NotebookProjection"("documentRevisionId", "schemaVersion");
CREATE INDEX "NotebookProjection_createdByUserId_idx" ON "NotebookProjection"("createdByUserId");
CREATE UNIQUE INDEX "CitationOccurrence_notebookProjectionId_semanticKey_key" ON "CitationOccurrence"("notebookProjectionId", "semanticKey");
CREATE UNIQUE INDEX "CitationOccurrence_notebookProjectionId_sourceOrder_key" ON "CitationOccurrence"("notebookProjectionId", "sourceOrder");
CREATE INDEX "CitationOccurrence_evidenceId_literatureId_idx" ON "CitationOccurrence"("evidenceId", "literatureId");

-- AddForeignKey
ALTER TABLE "Literature" ADD CONSTRAINT "Literature_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Literature" ADD CONSTRAINT "Literature_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Literature" ADD CONSTRAINT "Literature_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ProviderRecord" ADD CONSTRAINT "ProviderRecord_literatureId_fkey" FOREIGN KEY ("literatureId") REFERENCES "Literature"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ProviderRecord" ADD CONSTRAINT "ProviderRecord_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Assertion" ADD CONSTRAINT "Assertion_literatureId_fkey" FOREIGN KEY ("literatureId") REFERENCES "Literature"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Assertion" ADD CONSTRAINT "Assertion_providerRecordId_literatureId_fkey" FOREIGN KEY ("providerRecordId", "literatureId") REFERENCES "ProviderRecord"("id", "literatureId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Assertion" ADD CONSTRAINT "Assertion_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ImportOperation" ADD CONSTRAINT "ImportOperation_ownerUserId_fkey" FOREIGN KEY ("ownerUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ImportOperation" ADD CONSTRAINT "ImportOperation_projectId_fkey" FOREIGN KEY ("projectId") REFERENCES "Project"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "ImportOperation" ADD CONSTRAINT "ImportOperation_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SourceRevision" ADD CONSTRAINT "SourceRevision_literatureId_fkey" FOREIGN KEY ("literatureId") REFERENCES "Literature"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SourceRevision" ADD CONSTRAINT "SourceRevision_providerRecordId_literatureId_fkey" FOREIGN KEY ("providerRecordId", "literatureId") REFERENCES "ProviderRecord"("id", "literatureId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "SourceRevision" ADD CONSTRAINT "SourceRevision_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "RelationAssertion" ADD CONSTRAINT "RelationAssertion_subjectLiteratureId_fkey" FOREIGN KEY ("subjectLiteratureId") REFERENCES "Literature"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "RelationAssertion" ADD CONSTRAINT "RelationAssertion_objectLiteratureId_fkey" FOREIGN KEY ("objectLiteratureId") REFERENCES "Literature"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "RelationAssertion" ADD CONSTRAINT "RelationAssertion_sourceRevisionId_subjectLiteratureId_fkey" FOREIGN KEY ("sourceRevisionId", "subjectLiteratureId") REFERENCES "SourceRevision"("id", "literatureId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "RelationAssertion" ADD CONSTRAINT "RelationAssertion_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Excerpt" ADD CONSTRAINT "Excerpt_literatureId_fkey" FOREIGN KEY ("literatureId") REFERENCES "Literature"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Excerpt" ADD CONSTRAINT "Excerpt_sourceRevisionId_literatureId_fkey" FOREIGN KEY ("sourceRevisionId", "literatureId") REFERENCES "SourceRevision"("id", "literatureId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Excerpt" ADD CONSTRAINT "Excerpt_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Annotation" ADD CONSTRAINT "Annotation_literatureId_fkey" FOREIGN KEY ("literatureId") REFERENCES "Literature"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Annotation" ADD CONSTRAINT "Annotation_excerptId_literatureId_fkey" FOREIGN KEY ("excerptId", "literatureId") REFERENCES "Excerpt"("id", "literatureId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Annotation" ADD CONSTRAINT "Annotation_authorUserId_fkey" FOREIGN KEY ("authorUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Evidence" ADD CONSTRAINT "Evidence_literatureId_fkey" FOREIGN KEY ("literatureId") REFERENCES "Literature"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Evidence" ADD CONSTRAINT "Evidence_excerptId_literatureId_fkey" FOREIGN KEY ("excerptId", "literatureId") REFERENCES "Excerpt"("id", "literatureId") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "Evidence" ADD CONSTRAINT "Evidence_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "NotebookProjection" ADD CONSTRAINT "NotebookProjection_documentId_fkey" FOREIGN KEY ("documentId") REFERENCES "Document"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "NotebookProjection" ADD CONSTRAINT "NotebookProjection_documentRevisionId_documentId_fkey" FOREIGN KEY ("documentRevisionId", "documentId") REFERENCES "DocumentRevision"("id", "documentId") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "NotebookProjection" ADD CONSTRAINT "NotebookProjection_createdByUserId_fkey" FOREIGN KEY ("createdByUserId") REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CitationOccurrence" ADD CONSTRAINT "CitationOccurrence_notebookProjectionId_fkey" FOREIGN KEY ("notebookProjectionId") REFERENCES "NotebookProjection"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "CitationOccurrence" ADD CONSTRAINT "CitationOccurrence_literatureId_fkey" FOREIGN KEY ("literatureId") REFERENCES "Literature"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
ALTER TABLE "CitationOccurrence" ADD CONSTRAINT "CitationOccurrence_evidenceId_literatureId_fkey" FOREIGN KEY ("evidenceId", "literatureId") REFERENCES "Evidence"("id", "literatureId") ON DELETE RESTRICT ON UPDATE CASCADE;

-- Ownership and identity immutability.
CREATE FUNCTION "enforce_literature_ownership_immutable"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF NEW."id" IS DISTINCT FROM OLD."id"
       OR NEW."ownerUserId" IS DISTINCT FROM OLD."ownerUserId"
       OR NEW."projectId" IS DISTINCT FROM OLD."projectId"
       OR NEW."createdByUserId" IS DISTINCT FROM OLD."createdByUserId"
       OR NEW."createdAt" IS DISTINCT FROM OLD."createdAt" THEN
        RAISE EXCEPTION 'Literature ownership and identity are immutable';
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER "Literature_ownership_immutable_trigger"
BEFORE UPDATE ON "Literature"
FOR EACH ROW EXECUTE FUNCTION "enforce_literature_ownership_immutable"();

CREATE FUNCTION "enforce_import_operation_scope_immutable"() RETURNS trigger LANGUAGE plpgsql AS $$
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

CREATE TRIGGER "ImportOperation_scope_immutable_trigger"
BEFORE UPDATE ON "ImportOperation"
FOR EACH ROW EXECUTE FUNCTION "enforce_import_operation_scope_immutable"();

CREATE FUNCTION "enforce_document_scope_immutable"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF NEW."type" IS DISTINCT FROM OLD."type"
       OR NEW."ownerUserId" IS DISTINCT FROM OLD."ownerUserId"
       OR NEW."projectId" IS DISTINCT FROM OLD."projectId" THEN
        RAISE EXCEPTION 'Document ownership scope is immutable';
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER "Document_scope_immutable_trigger"
BEFORE UPDATE ON "Document"
FOR EACH ROW EXECUTE FUNCTION "enforce_document_scope_immutable"();

CREATE FUNCTION "enforce_provider_record_identity_immutable"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF NEW."id" IS DISTINCT FROM OLD."id"
       OR NEW."literatureId" IS DISTINCT FROM OLD."literatureId"
       OR NEW."providerKey" IS DISTINCT FROM OLD."providerKey"
       OR NEW."recordKey" IS DISTINCT FROM OLD."recordKey"
       OR NEW."createdByUserId" IS DISTINCT FROM OLD."createdByUserId"
       OR NEW."createdAt" IS DISTINCT FROM OLD."createdAt" THEN
        RAISE EXCEPTION 'ProviderRecord identity is immutable';
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER "ProviderRecord_identity_immutable_trigger"
BEFORE UPDATE ON "ProviderRecord"
FOR EACH ROW EXECUTE FUNCTION "enforce_provider_record_identity_immutable"();

CREATE FUNCTION "enforce_annotation_anchor_immutable"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    IF NEW."id" IS DISTINCT FROM OLD."id"
       OR NEW."literatureId" IS DISTINCT FROM OLD."literatureId"
       OR NEW."excerptId" IS DISTINCT FROM OLD."excerptId"
       OR NEW."authorUserId" IS DISTINCT FROM OLD."authorUserId"
       OR NEW."createdAt" IS DISTINCT FROM OLD."createdAt" THEN
        RAISE EXCEPTION 'Annotation anchor and author are immutable';
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER "Annotation_anchor_immutable_trigger"
BEFORE UPDATE ON "Annotation"
FOR EACH ROW EXECUTE FUNCTION "enforce_annotation_anchor_immutable"();

-- Append-only and immutable rows.
CREATE FUNCTION "reject_append_only_change"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    RAISE EXCEPTION '% is append-only; % is not allowed', TG_TABLE_NAME, TG_OP;
END;
$$;

CREATE TRIGGER "Assertion_append_only_trigger"
BEFORE UPDATE OR DELETE OR TRUNCATE ON "Assertion"
FOR EACH STATEMENT EXECUTE FUNCTION "reject_append_only_change"();

CREATE TRIGGER "RelationAssertion_append_only_trigger"
BEFORE UPDATE OR DELETE OR TRUNCATE ON "RelationAssertion"
FOR EACH STATEMENT EXECUTE FUNCTION "reject_append_only_change"();

CREATE FUNCTION "reject_immutable_update"() RETURNS trigger LANGUAGE plpgsql AS $$
BEGIN
    RAISE EXCEPTION '% is immutable; UPDATE is not allowed', TG_TABLE_NAME;
END;
$$;

CREATE TRIGGER "SourceRevision_immutable_trigger" BEFORE UPDATE ON "SourceRevision" FOR EACH STATEMENT EXECUTE FUNCTION "reject_immutable_update"();
CREATE TRIGGER "Excerpt_immutable_trigger" BEFORE UPDATE ON "Excerpt" FOR EACH STATEMENT EXECUTE FUNCTION "reject_immutable_update"();
CREATE TRIGGER "Evidence_immutable_trigger" BEFORE UPDATE ON "Evidence" FOR EACH STATEMENT EXECUTE FUNCTION "reject_immutable_update"();
CREATE TRIGGER "NotebookProjection_immutable_trigger" BEFORE UPDATE ON "NotebookProjection" FOR EACH STATEMENT EXECUTE FUNCTION "reject_immutable_update"();
CREATE TRIGGER "CitationOccurrence_immutable_trigger" BEFORE UPDATE ON "CitationOccurrence" FOR EACH STATEMENT EXECUTE FUNCTION "reject_immutable_update"();

-- Cross-aggregate references must remain within one exact owner scope.
CREATE FUNCTION "enforce_relation_assertion_same_scope"() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
    subject_owner TEXT;
    subject_project TEXT;
    object_owner TEXT;
    object_project TEXT;
BEGIN
    SELECT "ownerUserId", "projectId" INTO subject_owner, subject_project FROM "Literature" WHERE "id" = NEW."subjectLiteratureId";
    SELECT "ownerUserId", "projectId" INTO object_owner, object_project FROM "Literature" WHERE "id" = NEW."objectLiteratureId";

    IF NOT (
        (subject_owner IS NOT NULL AND subject_owner = object_owner AND subject_project IS NULL AND object_project IS NULL)
        OR (subject_project IS NOT NULL AND subject_project = object_project AND subject_owner IS NULL AND object_owner IS NULL)
    ) THEN
        RAISE EXCEPTION 'RelationAssertion subject and object must share one ownership scope';
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER "RelationAssertion_same_scope_trigger"
BEFORE INSERT ON "RelationAssertion"
FOR EACH ROW EXECUTE FUNCTION "enforce_relation_assertion_same_scope"();

CREATE FUNCTION "enforce_citation_occurrence_same_scope"() RETURNS trigger LANGUAGE plpgsql AS $$
DECLARE
    document_owner TEXT;
    document_project TEXT;
    evidence_owner TEXT;
    evidence_project TEXT;
BEGIN
    SELECT document."ownerUserId", document."projectId"
      INTO document_owner, document_project
      FROM "NotebookProjection" projection
      JOIN "Document" document ON document."id" = projection."documentId"
     WHERE projection."id" = NEW."notebookProjectionId";

    SELECT literature."ownerUserId", literature."projectId"
      INTO evidence_owner, evidence_project
      FROM "Evidence" evidence
      JOIN "Literature" literature ON literature."id" = evidence."literatureId"
     WHERE evidence."id" = NEW."evidenceId" AND evidence."literatureId" = NEW."literatureId";

    IF NOT (
        (document_owner IS NOT NULL AND document_owner = evidence_owner AND document_project IS NULL AND evidence_project IS NULL)
        OR (document_project IS NOT NULL AND document_project = evidence_project AND document_owner IS NULL AND evidence_owner IS NULL)
    ) THEN
        RAISE EXCEPTION 'CitationOccurrence projection and evidence must share one ownership scope';
    END IF;
    RETURN NEW;
END;
$$;

CREATE TRIGGER "CitationOccurrence_same_scope_trigger"
BEFORE INSERT ON "CitationOccurrence"
FOR EACH ROW EXECUTE FUNCTION "enforce_citation_occurrence_same_scope"();
