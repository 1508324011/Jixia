import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { seedLiteratureProvenanceGraph } from "./literature-postgres-fixture.js";
import { PostgresIntegrationHarness } from "./postgres-integration-harness.js";

const runPostgresIntegration = process.env.JIXIA_RUN_POSTGRES_INTEGRATION === "1";

let harness: PostgresIntegrationHarness | undefined;

function requireHarness(): PostgresIntegrationHarness {
  if (!harness) {
    throw new Error("PostgreSQL integration harness is not connected");
  }
  return harness;
}

describe.skipIf(!runPostgresIntegration)("Literature PostgreSQL provenance", () => {
  beforeAll(async () => {
    harness = await PostgresIntegrationHarness.connectFromEnvironment();
  });

  beforeEach(async () => {
    const database = requireHarness();
    await database.resetAndApplyAllMigrations();
    await seedLiteratureProvenanceGraph(database);
  });

  afterAll(async () => {
    if (harness) {
      await harness.resetAndApplyAllMigrations();
      await harness.close();
    }
  });

  it.each([
    [
      "SourceRevision provider",
      `INSERT INTO "SourceRevision" (
        "id", "literatureId", "providerRecordId", "revisionNumber", "sha256",
        "mediaType", "byteLength", "capturedAt", "createdByUserId"
      ) VALUES (
        'source-splice', 'literature-personal-2', 'provider-personal-1', 2,
        repeat('f', 64), 'application/pdf', 10, CURRENT_TIMESTAMP, 'user-2'
      )`,
      /SourceRevision_providerRecordId_literatureId_fkey/u
    ],
    [
      "Excerpt source",
      `INSERT INTO "Excerpt" (
        "id", "literatureId", "sourceRevisionId", "startByte", "endByte", "quote", "createdByUserId"
      ) VALUES ('excerpt-splice', 'literature-personal-2', 'source-personal-1', 20, 30, 'Splice', 'user-2')`,
      /Excerpt_sourceRevisionId_literatureId_fkey/u
    ],
    [
      "Annotation excerpt",
      `INSERT INTO "Annotation" (
        "id", "literatureId", "excerptId", "authorUserId", "body", "updatedAt"
      ) VALUES ('annotation-splice', 'literature-personal-2', 'excerpt-personal-1', 'user-2', 'Splice', CURRENT_TIMESTAMP)`,
      /Annotation_excerptId_literatureId_fkey/u
    ],
    [
      "Evidence excerpt",
      `INSERT INTO "Evidence" (
        "id", "literatureId", "excerptId", "createdByUserId"
      ) VALUES ('evidence-splice', 'literature-personal-2', 'excerpt-personal-1', 'user-2')`,
      /Evidence_excerptId_literatureId_fkey/u
    ],
    [
      "NotebookProjection revision",
      `INSERT INTO "NotebookProjection" (
        "id", "documentId", "documentRevisionId", "projectionVersion", "schemaVersion", "createdByUserId"
      ) VALUES ('projection-splice', 'document-personal-1', 'revision-personal-2', 2, 2, 'user-1')`,
      /NotebookProjection_documentRevisionId_documentId_fkey/u
    ],
    [
      "RelationAssertion source",
      `INSERT INTO "RelationAssertion" (
        "id", "subjectLiteratureId", "objectLiteratureId", "sourceRevisionId", "kind", "createdByUserId"
      ) VALUES (
        'relation-splice', 'literature-personal-1b', 'literature-personal-1',
        'source-personal-1', 'cites', 'user-1'
      )`,
      /RelationAssertion_sourceRevisionId_subjectLiteratureId_fkey/u
    ],
    [
      "CitationOccurrence evidence",
      `INSERT INTO "CitationOccurrence" (
        "id", "notebookProjectionId", "evidenceId", "literatureId", "semanticKey", "sourceOrder"
      ) VALUES (
        'citation-splice', 'projection-personal-1', 'evidence-personal-1',
        'literature-personal-1b', 'citation-splice', 2
      )`,
      /CitationOccurrence_evidenceId_literatureId_fkey/u
    ]
  ])("rejects a cross-aggregate %s splice", async (_label, statement, expected) => {
    // Given
    const database = requireHarness();

    // When
    const insert = database.query(statement);

    // Then
    await expect(insert).rejects.toThrow(expected);
  });

  it.each([
    [
      "personal owners",
      "literature-personal-1",
      "literature-personal-2",
      "source-personal-1",
      "user-1"
    ],
    [
      "projects",
      "literature-project-1",
      "literature-project-2",
      "source-project-1",
      "user-1"
    ]
  ])(
    "rejects RelationAssertion across %s",
    async (_label, subjectLiteratureId, objectLiteratureId, sourceRevisionId, actorUserId) => {
      // Given
      const database = requireHarness();

      // When
      const insert = database.query(
        `INSERT INTO "RelationAssertion" (
          "id", "subjectLiteratureId", "objectLiteratureId", "sourceRevisionId", "kind", "createdByUserId"
        ) VALUES ('relation-cross-scope', $1, $2, $3, 'cites', $4)`,
        [subjectLiteratureId, objectLiteratureId, sourceRevisionId, actorUserId]
      );

      // Then
      await expect(insert).rejects.toThrow(/must share one ownership scope/u);
    }
  );

  it("rejects a self-referencing RelationAssertion", async () => {
    // Given
    const database = requireHarness();

    // When
    const insert = database.query(`
      INSERT INTO "RelationAssertion" (
        "id", "subjectLiteratureId", "objectLiteratureId", "sourceRevisionId", "kind", "createdByUserId"
      ) VALUES (
        'relation-self', 'literature-personal-1', 'literature-personal-1',
        'source-personal-1', 'cites', 'user-1'
      )
    `);

    // Then
    await expect(insert).rejects.toThrow(/RelationAssertion_distinct_literature_check/u);
  });

  it.each([
    ["personal owners", "projection-personal-2", "evidence-personal-1", "literature-personal-1"],
    ["projects", "projection-project-2", "evidence-project-1", "literature-project-1"]
  ])(
    "rejects CitationOccurrence across %s",
    async (_label, notebookProjectionId, evidenceId, literatureId) => {
      // Given
      const database = requireHarness();

      // When
      const insert = database.query(
        `INSERT INTO "CitationOccurrence" (
          "id", "notebookProjectionId", "evidenceId", "literatureId", "semanticKey", "sourceOrder"
        ) VALUES ('citation-cross-scope', $1, $2, $3, 'cross-scope', 2)`,
        [notebookProjectionId, evidenceId, literatureId]
      );

      // Then
      await expect(insert).rejects.toThrow(/must share one ownership scope/u);
    }
  );

  it.each([
    [
      "source revision number",
      `INSERT INTO "SourceRevision" (
        "id", "literatureId", "providerRecordId", "revisionNumber", "sha256",
        "mediaType", "byteLength", "capturedAt", "createdByUserId"
      ) VALUES (
        'source-duplicate', 'literature-personal-1', 'provider-personal-1', 1,
        repeat('f', 64), 'application/pdf', 10, CURRENT_TIMESTAMP, 'user-1'
      )`,
      /SourceRevision_providerRecordId_revisionNumber_key/u
    ],
    [
      "source digest",
      `INSERT INTO "SourceRevision" (
        "id", "literatureId", "providerRecordId", "revisionNumber", "sha256",
        "mediaType", "byteLength", "capturedAt", "createdByUserId"
      ) VALUES (
        'source-duplicate', 'literature-personal-1', 'provider-personal-1', 2,
        repeat('a', 64), 'application/pdf', 10, CURRENT_TIMESTAMP, 'user-1'
      )`,
      /SourceRevision_providerRecordId_sha256_key/u
    ],
    [
      "projection version",
      `INSERT INTO "NotebookProjection" (
        "id", "documentId", "documentRevisionId", "projectionVersion", "schemaVersion", "createdByUserId"
      ) VALUES ('projection-duplicate', 'document-personal-1', 'revision-personal-1', 1, 2, 'user-1')`,
      /NotebookProjection_documentId_projectionVersion_key/u
    ],
    [
      "citation semantic key",
      `INSERT INTO "CitationOccurrence" (
        "id", "notebookProjectionId", "evidenceId", "literatureId", "semanticKey", "sourceOrder"
      ) VALUES (
        'citation-duplicate', 'projection-personal-1', 'evidence-personal-1',
        'literature-personal-1', 'citation-1', 2
      )`,
      /CitationOccurrence_notebookProjectionId_semanticKey_key/u
    ],
    [
      "citation source order",
      `INSERT INTO "CitationOccurrence" (
        "id", "notebookProjectionId", "evidenceId", "literatureId", "semanticKey", "sourceOrder"
      ) VALUES (
        'citation-duplicate', 'projection-personal-1', 'evidence-personal-1',
        'literature-personal-1', 'citation-2', 1
      )`,
      /CitationOccurrence_notebookProjectionId_sourceOrder_key/u
    ]
  ])("rejects duplicate %s", async (_label, statement, expected) => {
    // Given
    const database = requireHarness();

    // When
    const insert = database.query(statement);

    // Then
    await expect(insert).rejects.toThrow(expected);
  });
});
