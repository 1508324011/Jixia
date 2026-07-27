import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { seedLiteratureOwnershipGraph } from "./literature-postgres-fixture.js";
import { PostgresIntegrationHarness } from "./postgres-integration-harness.js";

const runPostgresIntegration = process.env.JIXIA_RUN_POSTGRES_INTEGRATION === "1";

let harness: PostgresIntegrationHarness | undefined;

function requireHarness(): PostgresIntegrationHarness {
  if (!harness) {
    throw new Error("PostgreSQL integration harness is not connected");
  }
  return harness;
}

describe.skipIf(!runPostgresIntegration)("Literature PostgreSQL constraints", () => {
  beforeAll(async () => {
    harness = await PostgresIntegrationHarness.connectFromEnvironment();
  });

  beforeEach(async () => {
    const database = requireHarness();
    await database.resetAndApplyAllMigrations();
    await seedLiteratureOwnershipGraph(database);
  });

  afterAll(async () => {
    if (harness) {
      await harness.resetAndApplyAllMigrations();
      await harness.close();
    }
  });

  it.each([
    ["without an owner", null, null],
    ["with both owners", "user-1", "project-1"]
  ])("rejects Literature %s", async (_label, ownerUserId, projectId) => {
    // Given
    const database = requireHarness();

    // When
    const insert = database.query(
      `INSERT INTO "Literature" (
        "id", "ownerUserId", "projectId", "createdByUserId"
      ) VALUES ('literature-invalid', $1, $2, 'user-1')`,
      [ownerUserId, projectId]
    );

    // Then
    await expect(insert).rejects.toThrow(/Literature_owner_xor_check/u);
  });

  it.each([
    ["without an owner", null, null],
    ["with both owners", "user-1", "project-1"]
  ])("rejects ImportOperation %s", async (_label, ownerUserId, projectId) => {
    // Given
    const database = requireHarness();

    // When
    const insert = database.query(
      `INSERT INTO "ImportOperation" (
        "id", "ownerUserId", "projectId", "createdByUserId", "idempotencyKey",
        "requestFingerprint", "sourceProviderKey", "sourceRecordKey", "status",
        "attemptCount", "attemptStartedAt", "takeoverAfter", "updatedAt"
      ) VALUES (
        'import-invalid', $1, $2, 'user-1', 'invalid-owner', repeat('a', 64),
        'crossref', '10.1000/invalid', 'running', 1, CURRENT_TIMESTAMP,
        CURRENT_TIMESTAMP + interval '30 seconds', CURRENT_TIMESTAMP
      )`,
      [ownerUserId, projectId]
    );

    // Then
    await expect(insert).rejects.toThrow(/ImportOperation_owner_xor_check/u);
  });

  it.each([
    ["title without text", "title", null, null],
    ["title stored as an integer", "title", null, 2020],
    ["title with both columns", "title", "Title", 2020],
    ["year stored as text", "publicationYear", "2020", null],
    ["year with both columns", "publicationYear", "2020", 2020],
    ["year below range", "publicationYear", null, 999],
    ["year above range", "publicationYear", null, 10_000]
  ])("rejects typed assertion %s", async (_label, kind, textValue, integerValue) => {
    // Given
    const database = requireHarness();

    // When
    const insert = database.query(
      `INSERT INTO "Assertion" (
        "id", "literatureId", "providerRecordId", "ordinal", "kind",
        "textValue", "integerValue", "createdByUserId"
      ) VALUES (
        'assertion-invalid', 'literature-personal-1', 'provider-personal-1', 1,
        $1, $2, $3, 'user-1'
      )`,
      [kind, textValue, integerValue]
    );

    // Then
    await expect(insert).rejects.toThrow(/Assertion_typed_value_check/u);
  });

  it.each([
    ["blank provider key", " ", "record"],
    ["oversized provider key", "p".repeat(129), "record"],
    ["blank record key", "crossref", " "],
    ["oversized record key", "crossref", "r".repeat(513)]
  ])("rejects %s", async (_label, providerKey, recordKey) => {
    // Given
    const database = requireHarness();

    // When
    const insert = database.query(
      `INSERT INTO "ProviderRecord" (
        "id", "literatureId", "providerKey", "recordKey", "createdByUserId"
      ) VALUES ('provider-invalid', 'literature-personal-1', $1, $2, 'user-1')`,
      [providerKey, recordKey]
    );

    // Then
    await expect(insert).rejects.toThrow(/ProviderRecord_(provider|record)_key_check/u);
  });

  it("rejects duplicate assertion ordinals within one Literature", async () => {
    // Given
    const database = requireHarness();
    await database.query(`
      INSERT INTO "Assertion" (
        "id", "literatureId", "providerRecordId", "ordinal", "kind", "textValue", "createdByUserId"
      ) VALUES ('assertion-1', 'literature-personal-1', 'provider-personal-1', 1, 'title', 'Title', 'user-1')
    `);

    // When
    const duplicate = database.query(`
      INSERT INTO "Assertion" (
        "id", "literatureId", "providerRecordId", "ordinal", "kind", "textValue", "createdByUserId"
      ) VALUES ('assertion-2', 'literature-personal-1', 'provider-personal-1', 1, 'abstract', 'Abstract', 'user-1')
    `);

    // Then
    await expect(duplicate).rejects.toThrow(/Assertion_literatureId_ordinal_key/u);
  });

  it.each([
    [
      "Literature ownership",
      `UPDATE "Literature" SET "ownerUserId" = 'user-2' WHERE "id" = 'literature-personal-1'`,
      /Literature ownership and identity are immutable/u
    ],
    [
      "ImportOperation scope",
      `UPDATE "ImportOperation" SET "ownerUserId" = 'user-2' WHERE "id" = 'import-personal-1'`,
      /ImportOperation ownership and identity are immutable/u
    ],
    [
      "ProviderRecord identity",
      `UPDATE "ProviderRecord" SET "recordKey" = 'changed' WHERE "id" = 'provider-personal-1'`,
      /ProviderRecord identity is immutable/u
    ]
  ])("rejects %s mutation", async (_label, statement, expected) => {
    // Given
    const database = requireHarness();
    await database.query(`
      INSERT INTO "ImportOperation" (
        "id", "ownerUserId", "createdByUserId", "idempotencyKey", "requestFingerprint",
        "sourceProviderKey", "sourceRecordKey", "status", "attemptCount", "attemptStartedAt",
        "takeoverAfter", "updatedAt"
      ) VALUES (
        'import-personal-1', 'user-1', 'user-1', 'constraint-fixture', repeat('a', 64),
        'crossref', '10.1000/constraint', 'running', 1, CURRENT_TIMESTAMP,
        CURRENT_TIMESTAMP + interval '30 seconds', CURRENT_TIMESTAMP
      )
      ON CONFLICT ("id") DO NOTHING
    `);

    // When
    const mutation = database.query(statement);

    // Then
    await expect(mutation).rejects.toThrow(expected);
  });

  it("allows only the Literature ordinal counter to advance", async () => {
    // Given
    const database = requireHarness();

    // When
    const updated = await database.query<{ readonly nextAssertionOrdinal: number }>(`
      UPDATE "Literature"
      SET "nextAssertionOrdinal" = 3
      WHERE "id" = 'literature-personal-1'
      RETURNING "nextAssertionOrdinal"
    `);

    // Then
    expect(updated.rows[0]?.nextAssertionOrdinal).toBe(3);
  });
});
