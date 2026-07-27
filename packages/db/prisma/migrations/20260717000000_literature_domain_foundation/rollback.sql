BEGIN;

LOCK TABLE
    "CitationOccurrence",
    "NotebookProjection",
    "Evidence",
    "Annotation",
    "Excerpt",
    "RelationAssertion",
    "SourceRevision",
    "Assertion",
    "ProviderRecord",
    "ImportOperation",
    "Literature"
IN ACCESS EXCLUSIVE MODE;

DO $$
BEGIN
    IF EXISTS (SELECT 1 FROM "CitationOccurrence" LIMIT 1)
       OR EXISTS (SELECT 1 FROM "NotebookProjection" LIMIT 1)
       OR EXISTS (SELECT 1 FROM "Evidence" LIMIT 1)
       OR EXISTS (SELECT 1 FROM "Annotation" LIMIT 1)
       OR EXISTS (SELECT 1 FROM "Excerpt" LIMIT 1)
       OR EXISTS (SELECT 1 FROM "RelationAssertion" LIMIT 1)
       OR EXISTS (SELECT 1 FROM "SourceRevision" LIMIT 1)
       OR EXISTS (SELECT 1 FROM "Assertion" LIMIT 1)
       OR EXISTS (SELECT 1 FROM "ProviderRecord" LIMIT 1)
       OR EXISTS (SELECT 1 FROM "ImportOperation" LIMIT 1)
       OR EXISTS (SELECT 1 FROM "Literature" LIMIT 1) THEN
        RAISE EXCEPTION 'refusing to roll back non-empty literature foundation tables';
    END IF;
END;
$$;

DROP TRIGGER IF EXISTS "CitationOccurrence_same_scope_trigger" ON "CitationOccurrence";
DROP TRIGGER IF EXISTS "RelationAssertion_same_scope_trigger" ON "RelationAssertion";
DROP TRIGGER IF EXISTS "CitationOccurrence_immutable_trigger" ON "CitationOccurrence";
DROP TRIGGER IF EXISTS "NotebookProjection_immutable_trigger" ON "NotebookProjection";
DROP TRIGGER IF EXISTS "Evidence_immutable_trigger" ON "Evidence";
DROP TRIGGER IF EXISTS "Excerpt_immutable_trigger" ON "Excerpt";
DROP TRIGGER IF EXISTS "SourceRevision_immutable_trigger" ON "SourceRevision";
DROP TRIGGER IF EXISTS "RelationAssertion_append_only_trigger" ON "RelationAssertion";
DROP TRIGGER IF EXISTS "Assertion_append_only_trigger" ON "Assertion";
DROP TRIGGER IF EXISTS "Annotation_anchor_immutable_trigger" ON "Annotation";
DROP TRIGGER IF EXISTS "ProviderRecord_identity_immutable_trigger" ON "ProviderRecord";
DROP TRIGGER IF EXISTS "ImportOperation_scope_immutable_trigger" ON "ImportOperation";
DROP TRIGGER IF EXISTS "Literature_ownership_immutable_trigger" ON "Literature";
DROP TRIGGER IF EXISTS "Document_scope_immutable_trigger" ON "Document";

ALTER TABLE "CitationOccurrence" DROP CONSTRAINT "CitationOccurrence_evidenceId_literatureId_fkey";
ALTER TABLE "CitationOccurrence" DROP CONSTRAINT "CitationOccurrence_literatureId_fkey";
ALTER TABLE "CitationOccurrence" DROP CONSTRAINT "CitationOccurrence_notebookProjectionId_fkey";
ALTER TABLE "NotebookProjection" DROP CONSTRAINT "NotebookProjection_createdByUserId_fkey";
ALTER TABLE "NotebookProjection" DROP CONSTRAINT "NotebookProjection_documentRevisionId_documentId_fkey";
ALTER TABLE "NotebookProjection" DROP CONSTRAINT "NotebookProjection_documentId_fkey";
ALTER TABLE "Evidence" DROP CONSTRAINT "Evidence_createdByUserId_fkey";
ALTER TABLE "Evidence" DROP CONSTRAINT "Evidence_excerptId_literatureId_fkey";
ALTER TABLE "Evidence" DROP CONSTRAINT "Evidence_literatureId_fkey";
ALTER TABLE "Annotation" DROP CONSTRAINT "Annotation_authorUserId_fkey";
ALTER TABLE "Annotation" DROP CONSTRAINT "Annotation_excerptId_literatureId_fkey";
ALTER TABLE "Annotation" DROP CONSTRAINT "Annotation_literatureId_fkey";
ALTER TABLE "Excerpt" DROP CONSTRAINT "Excerpt_createdByUserId_fkey";
ALTER TABLE "Excerpt" DROP CONSTRAINT "Excerpt_sourceRevisionId_literatureId_fkey";
ALTER TABLE "Excerpt" DROP CONSTRAINT "Excerpt_literatureId_fkey";
ALTER TABLE "RelationAssertion" DROP CONSTRAINT "RelationAssertion_createdByUserId_fkey";
ALTER TABLE "RelationAssertion" DROP CONSTRAINT "RelationAssertion_sourceRevisionId_subjectLiteratureId_fkey";
ALTER TABLE "RelationAssertion" DROP CONSTRAINT "RelationAssertion_objectLiteratureId_fkey";
ALTER TABLE "RelationAssertion" DROP CONSTRAINT "RelationAssertion_subjectLiteratureId_fkey";
ALTER TABLE "SourceRevision" DROP CONSTRAINT "SourceRevision_createdByUserId_fkey";
ALTER TABLE "SourceRevision" DROP CONSTRAINT "SourceRevision_providerRecordId_literatureId_fkey";
ALTER TABLE "SourceRevision" DROP CONSTRAINT "SourceRevision_literatureId_fkey";
ALTER TABLE "ImportOperation" DROP CONSTRAINT "ImportOperation_createdByUserId_fkey";
ALTER TABLE "ImportOperation" DROP CONSTRAINT "ImportOperation_projectId_fkey";
ALTER TABLE "ImportOperation" DROP CONSTRAINT "ImportOperation_ownerUserId_fkey";
ALTER TABLE "Assertion" DROP CONSTRAINT "Assertion_createdByUserId_fkey";
ALTER TABLE "Assertion" DROP CONSTRAINT "Assertion_providerRecordId_literatureId_fkey";
ALTER TABLE "Assertion" DROP CONSTRAINT "Assertion_literatureId_fkey";
ALTER TABLE "ProviderRecord" DROP CONSTRAINT "ProviderRecord_createdByUserId_fkey";
ALTER TABLE "ProviderRecord" DROP CONSTRAINT "ProviderRecord_literatureId_fkey";
ALTER TABLE "Literature" DROP CONSTRAINT "Literature_createdByUserId_fkey";
ALTER TABLE "Literature" DROP CONSTRAINT "Literature_projectId_fkey";
ALTER TABLE "Literature" DROP CONSTRAINT "Literature_ownerUserId_fkey";

DROP TABLE "CitationOccurrence";
DROP TABLE "NotebookProjection";
DROP TABLE "Evidence";
DROP TABLE "Annotation";
DROP TABLE "Excerpt";
DROP TABLE "RelationAssertion";
DROP TABLE "SourceRevision";
DROP TABLE "Assertion";
DROP TABLE "ProviderRecord";
DROP TABLE "ImportOperation";
DROP TABLE "Literature";

DROP FUNCTION "enforce_citation_occurrence_same_scope"();
DROP FUNCTION "enforce_relation_assertion_same_scope"();
DROP FUNCTION "reject_immutable_update"();
DROP FUNCTION "reject_append_only_change"();
DROP FUNCTION "enforce_annotation_anchor_immutable"();
DROP FUNCTION "enforce_provider_record_identity_immutable"();
DROP FUNCTION "enforce_document_scope_immutable"();
DROP FUNCTION "enforce_import_operation_scope_immutable"();
DROP FUNCTION "enforce_literature_ownership_immutable"();

DROP INDEX "DocumentRevision_id_documentId_key";
DROP TYPE "RelationKind";
DROP TYPE "AssertionKind";

COMMIT;
