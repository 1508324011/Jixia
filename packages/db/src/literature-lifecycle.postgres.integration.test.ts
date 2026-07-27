import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { seedLiteratureProvenanceGraph } from "./literature-postgres-fixture.js";
import { PostgresIntegrationHarness } from "./postgres-integration-harness.js";

const runPostgresIntegration = process.env.JIXIA_RUN_POSTGRES_INTEGRATION === "1";

interface CountRow {
  readonly count: string;
}

let harness: PostgresIntegrationHarness | undefined;

function requireHarness(): PostgresIntegrationHarness {
  if (!harness) {
    throw new Error("PostgreSQL integration harness is not connected");
  }
  return harness;
}

describe.skipIf(!runPostgresIntegration)("Literature PostgreSQL lifecycle", () => {
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
    'UPDATE "RelationAssertion" SET "kind" = "kind" WHERE false',
    'DELETE FROM "RelationAssertion" WHERE false',
    'TRUNCATE "RelationAssertion"'
  ])("rejects append-only RelationAssertion statement: %s", async (statement) => {
    // Given
    const database = requireHarness();

    // When
    const mutation = database.query(statement);

    // Then
    await expect(mutation).rejects.toThrow(/append-only/u);
  });

  it.each([
    [
      "SourceRevision",
      `UPDATE "SourceRevision" SET "mediaType" = 'text/plain' WHERE "id" = 'source-personal-1'`
    ],
    [
      "Excerpt",
      `UPDATE "Excerpt" SET "quote" = 'Changed' WHERE "id" = 'excerpt-personal-1'`
    ],
    [
      "Evidence",
      `UPDATE "Evidence" SET "createdByUserId" = 'user-2' WHERE "id" = 'evidence-personal-1'`
    ],
    [
      "NotebookProjection",
      `UPDATE "NotebookProjection" SET "projectionVersion" = 2 WHERE "id" = 'projection-personal-1'`
    ],
    [
      "CitationOccurrence",
      `UPDATE "CitationOccurrence" SET "semanticKey" = 'changed' WHERE "id" = 'citation-personal-1'`
    ]
  ])("rejects immutable %s updates", async (_label, statement) => {
    // Given
    const database = requireHarness();

    // When
    const mutation = database.query(statement);

    // Then
    await expect(mutation).rejects.toThrow(/is immutable; UPDATE is not allowed/u);
  });

  it("rejects Document ownership mutation", async () => {
    // Given
    const database = requireHarness();

    // When
    const mutation = database.query(`
      UPDATE "Document"
      SET "ownerUserId" = 'user-2'
      WHERE "id" = 'document-personal-1'
    `);

    // Then
    await expect(mutation).rejects.toThrow(/Document ownership scope is immutable/u);
  });

  it("rejects Annotation anchor mutation but permits body edits", async () => {
    // Given
    const database = requireHarness();

    // When
    const anchorMutation = database.query(`
      UPDATE "Annotation"
      SET "excerptId" = 'excerpt-personal-2'
      WHERE "id" = 'annotation-personal-1'
    `);

    // Then
    await expect(anchorMutation).rejects.toThrow(/Annotation anchor and author are immutable/u);
    const bodyUpdate = await database.query<{ readonly body: string }>(`
      UPDATE "Annotation"
      SET "body" = 'Revised annotation', "updatedAt" = CURRENT_TIMESTAMP
      WHERE "id" = 'annotation-personal-1'
      RETURNING "body"
    `);
    expect(bodyUpdate.rows[0]?.body).toBe("Revised annotation");
  });

  it.each([
    [
      "Literature",
      `DELETE FROM "Literature" WHERE "id" = 'literature-personal-1'`,
      `SELECT count(*)::text AS count FROM "Literature" WHERE "id" = 'literature-personal-1'`
    ],
    [
      "ProviderRecord",
      `DELETE FROM "ProviderRecord" WHERE "id" = 'provider-personal-1'`,
      `SELECT count(*)::text AS count FROM "ProviderRecord" WHERE "id" = 'provider-personal-1'`
    ],
    [
      "SourceRevision",
      `DELETE FROM "SourceRevision" WHERE "id" = 'source-personal-1'`,
      `SELECT count(*)::text AS count FROM "SourceRevision" WHERE "id" = 'source-personal-1'`
    ],
    [
      "Excerpt",
      `DELETE FROM "Excerpt" WHERE "id" = 'excerpt-personal-1'`,
      `SELECT count(*)::text AS count FROM "Excerpt" WHERE "id" = 'excerpt-personal-1'`
    ],
    [
      "Evidence",
      `DELETE FROM "Evidence" WHERE "id" = 'evidence-personal-1'`,
      `SELECT count(*)::text AS count FROM "Evidence" WHERE "id" = 'evidence-personal-1'`
    ]
  ] as const)("restricts deletion of protected %s provenance", async (_label, statement, countSql) => {
    // Given
    const database = requireHarness();

    // When
    const deletion = database.query(statement);

    // Then
    await expect(deletion).rejects.toThrow(/violates foreign key constraint/u);
    const remaining = await database.query<CountRow>(countSql);
    expect(remaining.rows[0]?.count).toBe("1");
  });

  it("cascades derived projections and citations when a Document is deleted", async () => {
    // Given
    const database = requireHarness();

    // When
    await database.query(`DELETE FROM "Document" WHERE "id" = 'document-personal-1'`);

    // Then
    const projections = await database.query<CountRow>(`
      SELECT count(*)::text AS count
      FROM "NotebookProjection"
      WHERE "id" = 'projection-personal-1'
    `);
    const citations = await database.query<CountRow>(`
      SELECT count(*)::text AS count
      FROM "CitationOccurrence"
      WHERE "id" = 'citation-personal-1'
    `);
    expect(projections.rows[0]?.count).toBe("0");
    expect(citations.rows[0]?.count).toBe("0");
  });
});
