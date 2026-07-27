import { Client } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { seedLiteratureOwnershipGraph } from "./literature-postgres-fixture.js";
import { requireDisposableMigrationDatabaseUrl } from "./postgres-integration-environment.js";
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

describe.skipIf(!runPostgresIntegration)("Literature exact identity claims", () => {
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

  it("allows the same DOI across personal and project scopes", async () => {
    // Given
    const database = requireHarness();

    // When
    await database.query(`
      INSERT INTO "LiteratureIdentity" (
        "id", "literatureId", "ownerUserId", "projectId", "kind", "providerKey", "identityValue"
      ) VALUES
        ('identity-personal', 'literature-personal-1', 'user-1', NULL, 'doi', NULL, '10.1000/shared'),
        ('identity-project', 'literature-project-1', NULL, 'project-1', 'doi', NULL, '10.1000/shared')
    `);

    // Then
    const identities = await database.query<CountRow>(`
      SELECT count(*)::text AS count
      FROM "LiteratureIdentity"
      WHERE "identityValue" = '10.1000/shared'
    `);
    expect(identities.rows[0]?.count).toBe("2");
  });

  it.each([
    ["DOI", "doi", null, "10.1000/collision", "personal_doi"],
    ["provider identity", "provider", "crossref", "10.1000/collision", "personal_provider"]
  ])(
    "rejects a same-scope %s collision",
    async (_label, kind, providerKey, identityValue, indexSuffix) => {
      // Given
      const database = requireHarness();
      await database.query(
        `INSERT INTO "LiteratureIdentity" (
          "id", "literatureId", "ownerUserId", "projectId", "kind", "providerKey", "identityValue"
        ) VALUES ('identity-first', 'literature-personal-1', 'user-1', NULL, $1, $2, $3)`,
        [kind, providerKey, identityValue]
      );

      // When
      const collision = database.query(
        `INSERT INTO "LiteratureIdentity" (
          "id", "literatureId", "ownerUserId", "projectId", "kind", "providerKey", "identityValue"
        ) VALUES ('identity-second', 'literature-personal-1b', 'user-1', NULL, $1, $2, $3)`,
        [kind, providerKey, identityValue]
      );

      // Then
      await expect(collision).rejects.toMatchObject({
        code: "23505",
        constraint: `LiteratureIdentity_${indexSuffix}_key`
      });
    }
  );

  it("rejects a claim whose mirrored scope differs from Literature", async () => {
    // Given
    const database = requireHarness();

    // When
    const insert = database.query(`
      INSERT INTO "LiteratureIdentity" (
        "id", "literatureId", "ownerUserId", "projectId", "kind", "providerKey", "identityValue"
      ) VALUES (
        'identity-mismatch', 'literature-personal-1', NULL, 'project-1',
        'doi', NULL, '10.1000/mismatch'
      )
    `);

    // Then
    await expect(insert).rejects.toMatchObject({
      code: "23514",
      constraint: "LiteratureIdentity_scope_check"
    });
  });

  it("converges concurrent same-scope DOI claims through one unique winner", async () => {
    // Given
    const database = requireHarness();
    const databaseUrl = requireDisposableMigrationDatabaseUrl();
    const firstClient = new Client({ connectionString: databaseUrl, statement_timeout: 5_000 });
    const secondClient = new Client({ connectionString: databaseUrl, statement_timeout: 5_000 });
    await Promise.all([firstClient.connect(), secondClient.connect()]);

    // When
    const outcomes = await Promise.allSettled([
      firstClient.query(`
        INSERT INTO "LiteratureIdentity" (
          "id", "literatureId", "ownerUserId", "projectId", "kind", "providerKey", "identityValue"
        ) VALUES (
          'identity-race-1', 'literature-personal-1', 'user-1', NULL,
          'doi', NULL, '10.1000/race'
        )
      `),
      secondClient.query(`
        INSERT INTO "LiteratureIdentity" (
          "id", "literatureId", "ownerUserId", "projectId", "kind", "providerKey", "identityValue"
        ) VALUES (
          'identity-race-2', 'literature-personal-1b', 'user-1', NULL,
          'doi', NULL, '10.1000/race'
        )
      `)
    ]);
    await Promise.all([firstClient.end(), secondClient.end()]);

    // Then
    expect(outcomes.map((outcome) => outcome.status).sort()).toEqual(["fulfilled", "rejected"]);
    for (const outcome of outcomes) {
      switch (outcome.status) {
        case "fulfilled":
          expect(outcome.value.rowCount).toBe(1);
          break;
        case "rejected":
          expect(outcome.reason).toMatchObject({
            code: "23505",
            constraint: "LiteratureIdentity_personal_doi_key"
          });
          break;
        default: {
          const unreachable: never = outcome;
          throw new Error(`Unexpected concurrent identity outcome: ${String(unreachable)}`);
        }
      }
    }
    const winners = await database.query<CountRow>(`
      SELECT count(*)::text AS count
      FROM "LiteratureIdentity"
      WHERE "ownerUserId" = 'user-1' AND "kind" = 'doi' AND "identityValue" = '10.1000/race'
    `);
    expect(winners.rows[0]?.count).toBe("1");
  });

  it("permits identity cleanup only through the aggregate lifecycle entrypoint", async () => {
    // Given
    const database = requireHarness();
    await database.query(`
      INSERT INTO "LiteratureIdentity" (
        "id", "literatureId", "ownerUserId", "projectId", "kind", "providerKey", "identityValue"
      ) VALUES (
        'identity-cleanup', 'literature-personal-1', 'user-1', NULL,
        'doi', NULL, '10.1000/cleanup'
      )
    `);

    // When
    const ordinaryDelete = database.query(
      `DELETE FROM "LiteratureIdentity" WHERE "id" = 'identity-cleanup'`
    );

    // Then
    await expect(ordinaryDelete).rejects.toThrow(/append-only/u);
    const cleanup = await database.query<{ readonly deleted: boolean }>(
      `SELECT public."delete_literature_aggregate"('literature-personal-1') AS deleted`
    );
    const remaining = await database.query<CountRow>(
      `SELECT count(*)::text AS count FROM "LiteratureIdentity" WHERE "id" = 'identity-cleanup'`
    );
    expect(cleanup.rows[0]?.deleted).toBe(true);
    expect(remaining.rows[0]?.count).toBe("0");
  });
});
