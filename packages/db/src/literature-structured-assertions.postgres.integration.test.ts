import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { seedLiteratureOwnershipGraph } from "./literature-postgres-fixture.js";
import { PostgresIntegrationHarness } from "./postgres-integration-harness.js";

const runPostgresIntegration = process.env.JIXIA_RUN_POSTGRES_INTEGRATION === "1";

type CountRow = {
  readonly count: string;
};

let harness: PostgresIntegrationHarness | undefined;

function requireHarness(): PostgresIntegrationHarness {
  if (!harness) {
    throw new Error("PostgreSQL integration harness is not connected");
  }
  return harness;
}

describe.skipIf(!runPostgresIntegration)("Literature structured assertion constraints", () => {
  beforeAll(async () => {
    harness = await PostgresIntegrationHarness.connectFromEnvironment();
  });

  beforeEach(async () => {
    const database = requireHarness();
    await database.resetAndApplyAllMigrations();
    await seedLiteratureOwnershipGraph(database);
  });

  afterEach(async () => {
    await requireHarness().query("ROLLBACK");
  });

  afterAll(async () => {
    if (harness) {
      await harness.resetAndApplyAllMigrations();
      await harness.close();
    }
  });

  it("commits every relational variant and preserves repeated equal fingerprints", async () => {
    // Given
    const database = requireHarness();

    // When
    await database.query(`
      BEGIN;
      INSERT INTO "Assertion" (
        "id", "literatureId", "providerRecordId", "ordinal", "kind",
        "structuredItemCount", "valueFingerprint", "createdByUserId"
      ) VALUES
        ('authors-1', 'literature-personal-1', 'provider-personal-1', 1, 'authors', 2, repeat('a', 64), 'user-1'),
        ('identifiers-1', 'literature-personal-1', 'provider-personal-1', 2, 'identifiers', 2, repeat('b', 64), 'user-1'),
        ('open-access-1', 'literature-personal-1', 'provider-personal-1', 3, 'openAccess', 1, repeat('c', 64), 'user-1'),
        ('publisher-1', 'literature-personal-1', 'provider-personal-1', 4, 'publisher', 1, repeat('d', 64), 'user-1'),
        ('authors-2', 'literature-personal-1', 'provider-personal-1', 5, 'authors', 2, repeat('a', 64), 'user-1');
      INSERT INTO "AssertionAuthor" (
        "assertionId", "literatureId", "position", "displayName", "orcid"
      ) VALUES
        ('authors-1', 'literature-personal-1', 0, 'Ada Lovelace', '0000-0001-0000-0001'),
        ('authors-1', 'literature-personal-1', 1, 'Grace Hopper', NULL),
        ('authors-2', 'literature-personal-1', 0, 'Ada Lovelace', '0000-0001-0000-0001'),
        ('authors-2', 'literature-personal-1', 1, 'Grace Hopper', NULL);
      INSERT INTO "AssertionIdentifier" (
        "assertionId", "literatureId", "position", "scheme", "value"
      ) VALUES
        ('identifiers-1', 'literature-personal-1', 0, 'doi', '10.1000/alpha'),
        ('identifiers-1', 'literature-personal-1', 1, 'pmid', '12345');
      INSERT INTO "AssertionOpenAccess" (
        "assertionId", "literatureId", "isOpenAccess", "bestUrl", "license", "version", "hostType"
      ) VALUES (
        'open-access-1', 'literature-personal-1', true, 'https://example.test/article',
        'cc-by', 'published', 'publisher'
      );
      INSERT INTO "AssertionPublisher" (
        "assertionId", "literatureId", "name", "landingPageUrl"
      ) VALUES ('publisher-1', 'literature-personal-1', 'Example Press', 'https://example.test');
      COMMIT;
    `);

    // Then
    const repeated = await database.query<CountRow>(`
      SELECT count(*)::text AS count
      FROM "Assertion"
      WHERE "valueFingerprint" = repeat('a', 64)
    `);
    expect(repeated.rows[0]?.count).toBe("2");
  });

  it.each([
    [
      "missing children",
      `INSERT INTO "Assertion" (
         "id", "literatureId", "providerRecordId", "ordinal", "kind",
         "structuredItemCount", "valueFingerprint", "createdByUserId"
       ) VALUES (
         'malformed', 'literature-personal-1', 'provider-personal-1', 1,
         'authors', 1, repeat('a', 64), 'user-1'
       )`
    ],
    [
      "a cross-kind child",
      `INSERT INTO "Assertion" (
         "id", "literatureId", "providerRecordId", "ordinal", "kind",
         "structuredItemCount", "valueFingerprint", "createdByUserId"
       ) VALUES (
         'malformed', 'literature-personal-1', 'provider-personal-1', 1,
         'identifiers', 1, repeat('a', 64), 'user-1'
       );
       INSERT INTO "AssertionAuthor" (
         "assertionId", "literatureId", "position", "displayName"
       ) VALUES ('malformed', 'literature-personal-1', 0, 'Wrong table')`
    ],
    [
      "non-dense positions",
      `INSERT INTO "Assertion" (
         "id", "literatureId", "providerRecordId", "ordinal", "kind",
         "structuredItemCount", "valueFingerprint", "createdByUserId"
       ) VALUES (
         'malformed', 'literature-personal-1', 'provider-personal-1', 1,
         'authors', 2, repeat('a', 64), 'user-1'
       );
       INSERT INTO "AssertionAuthor" (
         "assertionId", "literatureId", "position", "displayName"
       ) VALUES
         ('malformed', 'literature-personal-1', 0, 'First'),
         ('malformed', 'literature-personal-1', 2, 'Third')`
    ]
  ])("rejects %s at commit", async (_label, statement) => {
    // Given
    const database = requireHarness();
    await database.query("BEGIN");
    await database.query(statement);

    // When
    const commit = database.query("COMMIT");

    // Then
    await expect(commit).rejects.toMatchObject({
      code: "23514",
      constraint: "Assertion_structured_value_check"
    });
  });

  it("rejects an aggregate-spliced child", async () => {
    // Given
    const database = requireHarness();
    await database.query("BEGIN");
    await database.query(`
      INSERT INTO "Assertion" (
        "id", "literatureId", "providerRecordId", "ordinal", "kind",
        "structuredItemCount", "valueFingerprint", "createdByUserId"
      ) VALUES (
        'authors-1', 'literature-personal-1', 'provider-personal-1', 1,
        'authors', 1, repeat('a', 64), 'user-1'
      )
    `);

    // When
    const insert = database.query(`
      INSERT INTO "AssertionAuthor" (
        "assertionId", "literatureId", "position", "displayName"
      ) VALUES ('authors-1', 'literature-personal-1b', 0, 'Spliced')
    `);

    // Then
    await expect(insert).rejects.toMatchObject({ code: "23503" });
  });

  it("rejects duplicate author positions", async () => {
    // Given
    const database = requireHarness();
    await database.query("BEGIN");
    await database.query(`
      INSERT INTO "Assertion" (
        "id", "literatureId", "providerRecordId", "ordinal", "kind",
        "structuredItemCount", "valueFingerprint", "createdByUserId"
      ) VALUES (
        'authors-1', 'literature-personal-1', 'provider-personal-1', 1,
        'authors', 2, repeat('a', 64), 'user-1'
      );
      INSERT INTO "AssertionAuthor" (
        "assertionId", "literatureId", "position", "displayName"
      ) VALUES ('authors-1', 'literature-personal-1', 0, 'First')
    `);

    // When
    const duplicate = database.query(`
      INSERT INTO "AssertionAuthor" (
        "assertionId", "literatureId", "position", "displayName"
      ) VALUES ('authors-1', 'literature-personal-1', 0, 'Duplicate')
    `);

    // Then
    await expect(duplicate).rejects.toMatchObject({ code: "23505" });
  });

  it("permits child cleanup only through the aggregate lifecycle entrypoint", async () => {
    // Given
    const database = requireHarness();
    await database.query(`
      BEGIN;
      INSERT INTO "Assertion" (
        "id", "literatureId", "providerRecordId", "ordinal", "kind",
        "structuredItemCount", "valueFingerprint", "createdByUserId"
      ) VALUES (
        'authors-1', 'literature-personal-1', 'provider-personal-1', 1,
        'authors', 1, repeat('a', 64), 'user-1'
      );
      INSERT INTO "AssertionAuthor" (
        "assertionId", "literatureId", "position", "displayName"
      ) VALUES ('authors-1', 'literature-personal-1', 0, 'Ada Lovelace');
      COMMIT;
    `);

    // When
    const ordinaryDelete = database.query(
      `DELETE FROM "AssertionAuthor" WHERE "assertionId" = 'authors-1'`
    );

    // Then
    await expect(ordinaryDelete).rejects.toThrow(/append-only/u);
    const cleanup = await database.query<{ readonly deleted: boolean }>(
      `SELECT public."delete_literature_aggregate"('literature-personal-1') AS deleted`
    );
    const remaining = await database.query<CountRow>(
      `SELECT count(*)::text AS count FROM "AssertionAuthor" WHERE "assertionId" = 'authors-1'`
    );
    expect(cleanup.rows[0]?.deleted).toBe(true);
    expect(remaining.rows[0]?.count).toBe("0");
  });

  it("keeps child updates append-only when a caller sets the former cleanup setting", async () => {
    // Given
    const database = requireHarness();
    await database.query(`
      BEGIN;
      INSERT INTO "Assertion" (
        "id", "literatureId", "providerRecordId", "ordinal", "kind",
        "structuredItemCount", "valueFingerprint", "createdByUserId"
      ) VALUES (
        'authors-1', 'literature-personal-1', 'provider-personal-1', 1,
        'authors', 1, repeat('a', 64), 'user-1'
      );
      INSERT INTO "AssertionAuthor" (
        "assertionId", "literatureId", "position", "displayName"
      ) VALUES ('authors-1', 'literature-personal-1', 0, 'Ada Lovelace');
      COMMIT;
      BEGIN;
      SELECT set_config('jixia.literature_lifecycle_cleanup', 'on', true);
    `);

    // When
    const update = database.query(`
      UPDATE "AssertionAuthor"
      SET "displayName" = 'Rewritten'
      WHERE "assertionId" = 'authors-1'
    `);

    // Then
    await expect(update).rejects.toThrow(/append-only/u);
  });
});
