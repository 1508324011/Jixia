import type { PostgresIntegrationHarness } from "./postgres-integration-harness.js";

export async function seedLiteratureOwnershipGraph(
  database: PostgresIntegrationHarness
): Promise<void> {
  await database.query(`
    INSERT INTO "User" ("id", "email", "displayName", "passwordHash", "updatedAt") VALUES
      ('user-1', 'user-1@example.com', 'User One', 'hash', CURRENT_TIMESTAMP),
      ('user-2', 'user-2@example.com', 'User Two', 'hash', CURRENT_TIMESTAMP),
      ('user-3', 'user-3@example.com', 'User Three', 'hash', CURRENT_TIMESTAMP);
    INSERT INTO "Space" ("id", "name", "updatedAt") VALUES
      ('space-1', 'Space One', CURRENT_TIMESTAMP),
      ('space-2', 'Space Two', CURRENT_TIMESTAMP);
    INSERT INTO "SpaceMember" ("id", "spaceId", "userId", "role") VALUES
      ('space-member-1', 'space-1', 'user-1', 'SpaceMember'),
      ('space-member-2', 'space-1', 'user-2', 'SpaceMember'),
      ('space-member-3', 'space-2', 'user-3', 'SpaceMember');
    INSERT INTO "Project" (
      "id", "spaceId", "name", "createdByUserId", "updatedAt"
    ) VALUES
      ('project-1', 'space-1', 'Project One', 'user-1', CURRENT_TIMESTAMP),
      ('project-2', 'space-1', 'Project Two', 'user-2', CURRENT_TIMESTAMP),
      ('project-3', 'space-2', 'Project Three', 'user-3', CURRENT_TIMESTAMP);
    INSERT INTO "ProjectMember" ("id", "projectId", "userId", "role") VALUES
      ('project-member-1', 'project-1', 'user-1', 'ProjectOwner'),
      ('project-member-2', 'project-2', 'user-2', 'ProjectOwner'),
      ('project-member-3', 'project-3', 'user-3', 'ProjectOwner');
    INSERT INTO "Literature" (
      "id", "ownerUserId", "projectId", "createdByUserId"
    ) VALUES
      ('literature-personal-1', 'user-1', NULL, 'user-1'),
      ('literature-personal-1b', 'user-1', NULL, 'user-1'),
      ('literature-personal-2', 'user-2', NULL, 'user-2'),
      ('literature-project-1', NULL, 'project-1', 'user-1'),
      ('literature-project-1b', NULL, 'project-1', 'user-1'),
      ('literature-project-2', NULL, 'project-2', 'user-2'),
      ('literature-project-3', NULL, 'project-3', 'user-3');
    INSERT INTO "ProviderRecord" (
      "id", "literatureId", "providerKey", "recordKey", "createdByUserId"
    ) VALUES
      ('provider-personal-1', 'literature-personal-1', 'crossref', 'personal-1', 'user-1'),
      ('provider-personal-2', 'literature-personal-2', 'crossref', 'personal-2', 'user-2'),
      ('provider-project-1', 'literature-project-1', 'crossref', 'project-1', 'user-1'),
      ('provider-project-2', 'literature-project-2', 'crossref', 'project-2', 'user-2'),
      ('provider-project-3', 'literature-project-3', 'crossref', 'project-3', 'user-3');
  `);
}

export async function seedLiteratureProvenanceGraph(
  database: PostgresIntegrationHarness
): Promise<void> {
  await seedLiteratureOwnershipGraph(database);
  await database.query(`
    INSERT INTO "SourceRevision" (
      "id", "literatureId", "providerRecordId", "revisionNumber", "sha256",
      "mediaType", "byteLength", "capturedAt", "createdByUserId"
    ) VALUES
      ('source-personal-1', 'literature-personal-1', 'provider-personal-1', 1, repeat('a', 64), 'application/pdf', 100, CURRENT_TIMESTAMP, 'user-1'),
      ('source-personal-2', 'literature-personal-2', 'provider-personal-2', 1, repeat('b', 64), 'application/pdf', 100, CURRENT_TIMESTAMP, 'user-2'),
      ('source-project-1', 'literature-project-1', 'provider-project-1', 1, repeat('c', 64), 'application/pdf', 100, CURRENT_TIMESTAMP, 'user-1'),
      ('source-project-2', 'literature-project-2', 'provider-project-2', 1, repeat('d', 64), 'application/pdf', 100, CURRENT_TIMESTAMP, 'user-2'),
      ('source-project-3', 'literature-project-3', 'provider-project-3', 1, repeat('e', 64), 'application/pdf', 100, CURRENT_TIMESTAMP, 'user-3');
    INSERT INTO "Excerpt" (
      "id", "literatureId", "sourceRevisionId", "startByte", "endByte", "quote", "createdByUserId"
    ) VALUES
      ('excerpt-personal-1', 'literature-personal-1', 'source-personal-1', 0, 10, 'Quote one', 'user-1'),
      ('excerpt-personal-2', 'literature-personal-2', 'source-personal-2', 0, 10, 'Quote two', 'user-2'),
      ('excerpt-project-1', 'literature-project-1', 'source-project-1', 0, 10, 'Project one', 'user-1'),
      ('excerpt-project-2', 'literature-project-2', 'source-project-2', 0, 10, 'Project two', 'user-2'),
      ('excerpt-project-3', 'literature-project-3', 'source-project-3', 0, 10, 'Project three', 'user-3');
    INSERT INTO "Evidence" ("id", "literatureId", "excerptId", "createdByUserId") VALUES
      ('evidence-personal-1', 'literature-personal-1', 'excerpt-personal-1', 'user-1'),
      ('evidence-personal-2', 'literature-personal-2', 'excerpt-personal-2', 'user-2'),
      ('evidence-project-1', 'literature-project-1', 'excerpt-project-1', 'user-1'),
      ('evidence-project-2', 'literature-project-2', 'excerpt-project-2', 'user-2'),
      ('evidence-project-3', 'literature-project-3', 'excerpt-project-3', 'user-3');
    INSERT INTO "Annotation" (
      "id", "literatureId", "excerptId", "authorUserId", "body", "updatedAt"
    ) VALUES ('annotation-personal-1', 'literature-personal-1', 'excerpt-personal-1', 'user-1', 'Annotation', CURRENT_TIMESTAMP);
    INSERT INTO "ImportOperation" (
      "id", "ownerUserId", "createdByUserId", "idempotencyKey", "requestFingerprint",
      "sourceProviderKey", "sourceRecordKey", "status", "attemptCount", "attemptStartedAt",
      "takeoverAfter", "finishedAttemptCount", "finishedAt", "literatureId", "warningCodes",
      "failureCode", "updatedAt"
    ) VALUES (
      'import-personal-1', 'user-1', 'user-1', 'fixture-import-personal-1', repeat('f', 64),
      'crossref', 'personal-1', 'succeeded', 1, CURRENT_TIMESTAMP,
      NULL, 1, CURRENT_TIMESTAMP, 'literature-personal-1',
      ARRAY[]::"LiteratureImportWarningCode"[], NULL, CURRENT_TIMESTAMP
    );
    INSERT INTO "Document" (
      "id", "type", "title", "ownerUserId", "projectId", "updatedAt"
    ) VALUES
      ('document-personal-1', 'notebook', 'Personal One', 'user-1', NULL, CURRENT_TIMESTAMP),
      ('document-personal-2', 'notebook', 'Personal Two', 'user-2', NULL, CURRENT_TIMESTAMP),
      ('document-project-1', 'project', 'Project One', NULL, 'project-1', CURRENT_TIMESTAMP),
      ('document-project-2', 'project', 'Project Two', NULL, 'project-2', CURRENT_TIMESTAMP),
      ('document-project-3', 'project', 'Project Three', NULL, 'project-3', CURRENT_TIMESTAMP);
    INSERT INTO "DocumentRevision" (
      "id", "documentId", "revisionNumber", "contentSnapshot", "editorUserId"
    ) VALUES
      ('revision-personal-1', 'document-personal-1', 1, '{"editorSchemaVersion":1,"blocks":[]}', 'user-1'),
      ('revision-personal-2', 'document-personal-2', 1, '{"editorSchemaVersion":1,"blocks":[]}', 'user-2'),
      ('revision-project-1', 'document-project-1', 1, '{"editorSchemaVersion":1,"blocks":[]}', 'user-1'),
      ('revision-project-2', 'document-project-2', 1, '{"editorSchemaVersion":1,"blocks":[]}', 'user-2'),
      ('revision-project-3', 'document-project-3', 1, '{"editorSchemaVersion":1,"blocks":[]}', 'user-3');
    INSERT INTO "NotebookProjection" (
      "id", "documentId", "documentRevisionId", "projectionVersion", "schemaVersion", "createdByUserId"
    ) VALUES
      ('projection-personal-1', 'document-personal-1', 'revision-personal-1', 1, 1, 'user-1'),
      ('projection-personal-2', 'document-personal-2', 'revision-personal-2', 1, 1, 'user-2'),
      ('projection-project-1', 'document-project-1', 'revision-project-1', 1, 1, 'user-1'),
      ('projection-project-2', 'document-project-2', 'revision-project-2', 1, 1, 'user-2'),
      ('projection-project-3', 'document-project-3', 'revision-project-3', 1, 1, 'user-3');
    INSERT INTO "RelationAssertion" (
      "id", "subjectLiteratureId", "objectLiteratureId", "sourceRevisionId", "kind", "createdByUserId"
    ) VALUES ('relation-personal-1', 'literature-personal-1', 'literature-personal-1b', 'source-personal-1', 'cites', 'user-1');
    INSERT INTO "CitationOccurrence" (
      "id", "notebookProjectionId", "evidenceId", "literatureId", "semanticKey", "sourceOrder"
    ) VALUES ('citation-personal-1', 'projection-personal-1', 'evidence-personal-1', 'literature-personal-1', 'citation-1', 1);
  `);
}
