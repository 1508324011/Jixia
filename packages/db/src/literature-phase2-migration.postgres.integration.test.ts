import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { seedLiteratureOwnershipGraph } from "./literature-postgres-fixture.js";
import { PostgresIntegrationHarness } from "./postgres-integration-harness.js";

const runPostgresIntegration = process.env.JIXIA_RUN_POSTGRES_INTEGRATION === "1";

type IdentityRow = {
  readonly identityValue: string;
  readonly kind: string;
  readonly literatureId: string;
  readonly providerKey: string | null;
};

type NameRow = {
  readonly name: string | null;
};

let harness: PostgresIntegrationHarness | undefined;

function requireHarness(): PostgresIntegrationHarness {
  if (!harness) {
    throw new Error("PostgreSQL integration harness is not connected");
  }
  return harness;
}

describe.skipIf(!runPostgresIntegration)("Literature Phase 2 migration", () => {
  beforeAll(async () => {
    harness = await PostgresIntegrationHarness.connectFromEnvironment();
  });

  beforeEach(async () => {
    const database = requireHarness();
    await database.resetAndApplyMigrationsBeforeLiteraturePhase2();
    await seedLiteratureOwnershipGraph(database);
  });

  afterAll(async () => {
    if (harness) {
      await harness.resetAndApplyAllMigrations();
      await harness.close();
    }
  });

  it("backfills every provider identity and only each Literature's current DOI", async () => {
    // Given
    const database = requireHarness();
    await database.query(`
      INSERT INTO "Assertion" (
        "id", "literatureId", "providerRecordId", "ordinal", "kind", "textValue", "createdByUserId"
      ) VALUES
        ('doi-personal-old', 'literature-personal-1', 'provider-personal-1', 1, 'doi', '10.1000/old', 'user-1'),
        ('doi-personal-current', 'literature-personal-1', 'provider-personal-1', 2, 'doi', '10.1000/current', 'user-1'),
        ('doi-project-current', 'literature-project-1', 'provider-project-1', 1, 'doi', '10.1000/project', 'user-1')
    `);

    // When
    await database.applyLiteraturePhase2Migration();

    // Then
    const identities = await database.query<IdentityRow>(`
      SELECT "kind"::text, "providerKey", "identityValue", "literatureId"
      FROM "LiteratureIdentity"
      ORDER BY "kind", "literatureId", "identityValue"
    `);
    expect(identities.rows).toHaveLength(7);
    expect(identities.rows).toContainEqual({
      identityValue: "10.1000/current",
      kind: "doi",
      literatureId: "literature-personal-1",
      providerKey: null
    });
    expect(identities.rows).toContainEqual({
      identityValue: "personal-1",
      kind: "provider",
      literatureId: "literature-personal-1",
      providerKey: "crossref"
    });
    expect(identities.rows).not.toContainEqual(
      expect.objectContaining({ identityValue: "10.1000/old" })
    );
  });

  it.each([
    [
      "provider identities",
      `INSERT INTO "ProviderRecord" (
         "id", "literatureId", "providerKey", "recordKey", "createdByUserId"
       ) VALUES (
         'provider-ambiguous', 'literature-personal-1b', 'crossref', 'personal-1', 'user-1'
       )`
    ],
    [
      "current DOI identities",
      `INSERT INTO "ProviderRecord" (
         "id", "literatureId", "providerKey", "recordKey", "createdByUserId"
       ) VALUES (
         'provider-personal-1b', 'literature-personal-1b', 'openalex', 'W1B', 'user-1'
       );
       INSERT INTO "Assertion" (
         "id", "literatureId", "providerRecordId", "ordinal", "kind", "textValue", "createdByUserId"
       ) VALUES
         ('doi-ambiguous-1', 'literature-personal-1', 'provider-personal-1', 1, 'doi', '10.1000/ambiguous', 'user-1'),
         ('doi-ambiguous-2', 'literature-personal-1b', 'provider-personal-1b', 1, 'doi', '10.1000/ambiguous', 'user-1')`
    ]
  ])("aborts ambiguous %s without a partial schema", async (_label, ambiguousRows) => {
    // Given
    const database = requireHarness();
    await database.query(ambiguousRows);

    // When
    const migration = database.applyLiteraturePhase2Migration();

    // Then
    await expect(migration).rejects.toMatchObject({ code: "P0001" });
    await database.query("ROLLBACK");
    const identityTable = await database.query<NameRow>(
      `SELECT to_regclass('"LiteratureIdentity"')::text AS name`
    );
    expect(identityTable.rows[0]?.name).toBeNull();
  });

  it("refuses rollback while backfilled Phase 2 identities exist", async () => {
    // Given
    const database = requireHarness();
    await database.applyLiteraturePhase2Migration();

    // When
    const rollback = database.rollbackLiteraturePhase2Migration();

    // Then
    await expect(rollback).rejects.toMatchObject({ code: "P0001" });
    const identityTable = await database.query<NameRow>(
      `SELECT to_regclass('"LiteratureIdentity"')::text AS name`
    );
    expect(identityTable.rows[0]?.name).toBe('"LiteratureIdentity"');
  });

  it("refuses rollback while an extended assertion kind exists", async () => {
    // Given
    const database = requireHarness();
    await database.resetAndApplyMigrationsBeforeLiteraturePhase2();
    await database.applyLiteraturePhase2Migration();
    await database.query(`
      INSERT INTO "User" ("id", "email", "displayName", "passwordHash", "updatedAt")
      VALUES ('rollback-user', 'rollback@example.com', 'Rollback', 'hash', CURRENT_TIMESTAMP);
      INSERT INTO "Literature" ("id", "ownerUserId", "createdByUserId")
      VALUES ('rollback-literature', 'rollback-user', 'rollback-user');
      INSERT INTO "ProviderRecord" (
        "id", "literatureId", "providerKey", "recordKey", "createdByUserId"
      ) VALUES (
        'rollback-provider', 'rollback-literature', 'crossref', 'rollback-record', 'rollback-user'
      );
      INSERT INTO "Assertion" (
        "id", "literatureId", "providerRecordId", "ordinal", "kind",
        "textValue", "createdByUserId"
      ) VALUES (
        'rollback-assertion', 'rollback-literature', 'rollback-provider', 1,
        'publicationDate', '2026-07-18', 'rollback-user'
      )
    `);

    // When
    const rollback = database.rollbackLiteraturePhase2Migration();

    // Then
    await expect(rollback).rejects.toMatchObject({ code: "P0001" });
  });

  it("restores the exact Phase 1 schema when Phase 2 state is empty", async () => {
    // Given
    const database = requireHarness();
    await database.resetAndApplyMigrationsBeforeLiteraturePhase2();
    await database.applyLiteraturePhase2Migration();

    // When
    await database.rollbackLiteraturePhase2Migration();

    // Then
    const identityTable = await database.query<NameRow>(
      `SELECT to_regclass('"LiteratureIdentity"')::text AS name`
    );
    const assertionKinds = await database.query<NameRow>(`
      SELECT enumlabel AS name
      FROM pg_enum
      JOIN pg_type ON pg_type.oid = pg_enum.enumtypid
      WHERE pg_type.typname = 'AssertionKind'
      ORDER BY enumsortorder
    `);
    expect(identityTable.rows[0]?.name).toBeNull();
    expect(assertionKinds.rows.map((row) => row.name)).toEqual([
      "title",
      "abstract",
      "publicationYear",
      "doi"
    ]);
  });
});
