import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { PostgresIntegrationHarness } from "./postgres-integration-harness.js";

const runPostgresIntegration = process.env.JIXIA_RUN_POSTGRES_INTEGRATION === "1";

interface TableNameRow {
  readonly name: string | null;
}

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

async function seedLiteratureFixtures(database: PostgresIntegrationHarness): Promise<void> {
  await database.query(`
    INSERT INTO "User" ("id", "email", "displayName", "passwordHash", "updatedAt") VALUES
      ('user-1', 'user-1@example.com', 'User One', 'hash', CURRENT_TIMESTAMP),
      ('user-2', 'user-2@example.com', 'User Two', 'hash', CURRENT_TIMESTAMP);
    INSERT INTO "Literature" ("id", "ownerUserId", "createdByUserId") VALUES
      ('literature-1', 'user-1', 'user-1'),
      ('literature-2', 'user-2', 'user-2');
    INSERT INTO "ProviderRecord" (
      "id", "literatureId", "providerKey", "recordKey", "createdByUserId"
    ) VALUES ('provider-1', 'literature-1', 'crossref', 'record-1', 'user-1');
  `);
}

describe.skipIf(!runPostgresIntegration)("Literature PostgreSQL migration", () => {
  beforeAll(async () => {
    harness = await PostgresIntegrationHarness.connectFromEnvironment();
  });

  beforeEach(async () => {
    await requireHarness().resetAndApplyAllMigrations();
  });

  afterAll(async () => {
    if (harness) {
      await harness.resetAndApplyAllMigrations();
      await harness.close();
    }
  });

  it("applies forward, rolls back an empty schema, and reapplies", async () => {
    // Given
    const database = requireHarness();

    // When
    await database.rollbackLiteratureMigration();
    const rolledBack = await database.query<TableNameRow>(
      `SELECT to_regclass('"Literature"')::text AS name`
    );
    await database.applyLiteratureMigration();
    const reapplied = await database.query<TableNameRow>(
      `SELECT to_regclass('"Literature"')::text AS name`
    );

    // Then
    expect(rolledBack.rows[0]?.name).toBeNull();
    expect(reapplied.rows[0]?.name).toBe('"Literature"');
  });

  it("refuses a non-empty rollback without losing schema or data", async () => {
    // Given
    const database = requireHarness();
    await database.query(`
      INSERT INTO "User" ("id", "email", "displayName", "passwordHash", "updatedAt")
      VALUES ('user-1', 'user-1@example.com', 'User One', 'hash', CURRENT_TIMESTAMP);
      INSERT INTO "Literature" ("id", "ownerUserId", "createdByUserId")
      VALUES ('literature-1', 'user-1', 'user-1');
    `);

    // When
    const rollback = database.rollbackLiteratureMigration();

    // Then
    await expect(rollback).rejects.toThrow(
      "refusing to roll back non-empty literature foundation tables"
    );
    const rows = await database.query<CountRow>(`SELECT count(*)::text AS count FROM "Literature"`);
    expect(rows.rows[0]?.count).toBe("1");
  });

  it("rejects an ownerless Literature root", async () => {
    // Given
    const database = requireHarness();
    await database.query(`
      INSERT INTO "User" ("id", "email", "displayName", "passwordHash", "updatedAt")
      VALUES ('user-1', 'user-1@example.com', 'User One', 'hash', CURRENT_TIMESTAMP)
    `);

    // When
    const insert = database.query(`
      INSERT INTO "Literature" ("id", "createdByUserId") VALUES ('invalid', 'user-1')
    `);

    // Then
    await expect(insert).rejects.toThrow(/Literature_owner_xor_check/u);
  });

  it.each(["10.1234/🔥", "10.1234/question?"])(
    "rejects a noncanonical DOI value %s",
    async (doi) => {
      // Given
      const database = requireHarness();
      await seedLiteratureFixtures(database);

      // When
      const insert = database.query(
        `INSERT INTO "Assertion" (
          "id", "literatureId", "providerRecordId", "ordinal", "kind", "textValue", "createdByUserId"
        ) VALUES ('assertion-invalid', 'literature-1', 'provider-1', 1, 'doi', $1, 'user-1')`,
        [doi]
      );

      // Then
      await expect(insert).rejects.toThrow(/Assertion_canonical_doi_check/u);
    }
  );

  it("rejects a publication year with no integer value", async () => {
    // Given
    const database = requireHarness();
    await seedLiteratureFixtures(database);

    // When
    const insert = database.query(`
      INSERT INTO "Assertion" (
        "id", "literatureId", "providerRecordId", "ordinal", "kind", "createdByUserId"
      ) VALUES (
        'assertion-null-year', 'literature-1', 'provider-1', 1, 'publicationYear', 'user-1'
      )
    `);

    // Then
    await expect(insert).rejects.toThrow(/Assertion_typed_value_check/u);
  });

  it("rejects a ProviderRecord and Assertion aggregate splice", async () => {
    // Given
    const database = requireHarness();
    await seedLiteratureFixtures(database);

    // When
    const insert = database.query(`
      INSERT INTO "Assertion" (
        "id", "literatureId", "providerRecordId", "ordinal", "kind", "textValue", "createdByUserId"
      ) VALUES ('assertion-splice', 'literature-2', 'provider-1', 1, 'title', 'Title', 'user-2')
    `);

    // Then
    await expect(insert).rejects.toThrow(/Assertion_providerRecordId_literatureId_fkey/u);
  });

  it.each([
    'UPDATE "Assertion" SET "textValue" = "textValue" WHERE false',
    'DELETE FROM "Assertion" WHERE false'
  ])("rejects append-only statement: %s", async (statement) => {
    // Given
    const database = requireHarness();

    // When
    const mutation = database.query(statement);

    // Then
    await expect(mutation).rejects.toThrow(/append-only/u);
  });

  it("rejects truncating Assertion while aggregate-qualified child tables exist", async () => {
    // Given
    const database = requireHarness();

    // When
    const mutation = database.query('TRUNCATE "Assertion"');

    // Then
    await expect(mutation).rejects.toThrow(/cannot truncate a table referenced/u);
  });
});
