import { Client } from "pg";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import {
  grantDatabaseRuntimeCapability,
  type DatabaseQuery
} from "./database-deployment.js";
import { seedLiteratureProvenanceGraph } from "./literature-postgres-fixture.js";
import { requireDisposableDatabaseUrl } from "./postgres-integration-environment.js";
import { PostgresIntegrationHarness } from "./postgres-integration-harness.js";

const runPostgresIntegration = process.env.JIXIA_RUN_POSTGRES_INTEGRATION === "1";
const applicationRole = "task25_literature_application";
const unauthorizedRole = "task25_literature_unauthorized";
const cleanupOwnerRole = "jixia_literature_cleanup_owner";
const cleanupApplicationRole = "jixia_literature_application";

let harness: PostgresIntegrationHarness | undefined;

function requireHarness(): PostgresIntegrationHarness {
  if (!harness) {
    throw new Error("PostgreSQL integration harness is not connected");
  }
  return harness;
}

async function connectAsRole(role: string): Promise<Client> {
  const databaseUrl = new URL(requireDisposableDatabaseUrl());
  databaseUrl.username = role;
  databaseUrl.password = "";
  const client = new Client({ connectionString: databaseUrl.toString() });
  await client.connect();
  return client;
}

async function seedStructuredCleanupRows(database: PostgresIntegrationHarness): Promise<void> {
  await database.query(`
    BEGIN;
    INSERT INTO "Assertion" (
      "id", "literatureId", "providerRecordId", "ordinal", "kind",
      "structuredItemCount", "valueFingerprint", "createdByUserId"
    ) VALUES (
      'authors-cleanup', 'literature-personal-1', 'provider-personal-1', 1,
      'authors', 1, repeat('a', 64), 'user-1'
    );
    INSERT INTO "AssertionAuthor" (
      "assertionId", "literatureId", "position", "displayName"
    ) VALUES ('authors-cleanup', 'literature-personal-1', 0, 'Ada Lovelace');
    INSERT INTO "LiteratureIdentity" (
      "id", "literatureId", "ownerUserId", "projectId", "kind", "providerKey", "identityValue"
    ) VALUES (
      'identity-cleanup', 'literature-personal-1', 'user-1', NULL,
      'doi', NULL, '10.1000/cleanup'
    );
    COMMIT;
  `);
}

async function grantApplicationPrivileges(database: PostgresIntegrationHarness): Promise<void> {
  await database.query(`
    DO $$
    BEGIN
      EXECUTE format(
        'GRANT CONNECT ON DATABASE %I TO %I, %I',
        current_database(),
        '${applicationRole}',
        '${unauthorizedRole}'
      );
    END;
    $$;
    GRANT USAGE ON SCHEMA public TO "${applicationRole}", "${unauthorizedRole}";
    GRANT SELECT, INSERT, UPDATE, DELETE ON ALL TABLES IN SCHEMA public
      TO "${applicationRole}", "${unauthorizedRole}";
    REVOKE "${cleanupApplicationRole}" FROM "${unauthorizedRole}";
  `);
  const query: DatabaseQuery = (sql, values = []) => database.query(sql, values);
  await grantDatabaseRuntimeCapability(query, applicationRole);
}

describe.skipIf(!runPostgresIntegration)("Literature lifecycle cleanup authorization", () => {
  beforeAll(async () => {
    harness = await PostgresIntegrationHarness.connectFromEnvironment();
    for (const role of [applicationRole, unauthorizedRole]) {
      await harness.query(`
        DO $$
        BEGIN
          IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = '${role}') THEN
            EXECUTE 'CREATE ROLE "${role}" LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE INHERIT NOREPLICATION NOBYPASSRLS';
          END IF;
        END;
        $$;
      `);
    }
  });

  beforeEach(async () => {
    const database = requireHarness();
    await database.resetAndApplyAllMigrations();
    await seedLiteratureProvenanceGraph(database);
    await seedStructuredCleanupRows(database);
    await grantApplicationPrivileges(database);
  });

  afterAll(async () => {
    if (harness) {
      await harness.query(`
        REVOKE "${cleanupApplicationRole}" FROM "${applicationRole}";
        DROP OWNED BY "${applicationRole}";
        DROP ROLE "${applicationRole}";
        DROP OWNED BY "${unauthorizedRole}";
        DROP ROLE "${unauthorizedRole}";
      `);
      await harness.close();
    }
  });

  it("rejects a non-superuser RelationAssertion DELETE after a caller-controlled cleanup setting", async () => {
    // Given
    const application = await connectAsRole(applicationRole);
    try {
      await application.query(`SET jixia.literature_lifecycle_cleanup = 'on'`);

      // When
      const deletion = application.query(`
        DELETE FROM "RelationAssertion" WHERE "id" = 'relation-personal-1'
      `);

      // Then
      await expect(deletion).rejects.toMatchObject({ code: "P0001" });
    } finally {
      await application.end();
    }
  });

  it.each([
    ["SET", `SET jixia.literature_lifecycle_cleanup = 'on'`],
    ["set_config", `SELECT set_config('jixia.literature_lifecycle_cleanup', 'on', true)`]
  ])("rejects %s plus direct append-only deletes for every protected table", async (_label, enable) => {
    // Given
    const application = await connectAsRole(applicationRole);
    const protectedDeletes = [
      `DELETE FROM "Assertion" WHERE "id" = 'authors-cleanup'`,
      `DELETE FROM "AssertionAuthor" WHERE "assertionId" = 'authors-cleanup'`,
      `DELETE FROM "LiteratureIdentity" WHERE "id" = 'identity-cleanup'`,
      `DELETE FROM "RelationAssertion" WHERE "id" = 'relation-personal-1'`
    ];

    try {
      await application.query(enable);

      // When / Then
      for (const deletionSql of protectedDeletes) {
        await expect(application.query(deletionSql)).rejects.toMatchObject({ code: "P0001" });
      }
    } finally {
      await application.end();
    }
  });

  it("denies SET ROLE into the memberless cleanup owner", async () => {
    // Given
    const application = await connectAsRole(applicationRole);

    try {
      // When / Then
      await expect(application.query(`SET ROLE "${cleanupOwnerRole}"`)).rejects.toMatchObject({
        code: "42501"
      });
    } finally {
      await application.end();
    }
  });

  it("denies unauthorized execution of the aggregate cleanup entrypoint", async () => {
    // Given
    const unauthorized = await connectAsRole(unauthorizedRole);

    try {
      // When / Then
      await expect(
        unauthorized.query(
          `SELECT public."delete_literature_aggregate"('literature-personal-1')`
        )
      ).rejects.toMatchObject({ code: "42501" });
    } finally {
      await unauthorized.end();
    }
  });

  it("deletes only the requested Literature aggregate through the authorized entrypoint", async () => {
    // Given
    const application = await connectAsRole(applicationRole);

    try {
      // When
      const cleanup = await application.query<{ readonly deleted: boolean }>(
        `SELECT public."delete_literature_aggregate"('literature-personal-1') AS deleted`
      );

      // Then
      expect(cleanup.rows[0]?.deleted).toBe(true);
    } finally {
      await application.end();
    }

    const remaining = await requireHarness().query<{
      readonly targetLiterature: string;
      readonly targetAssertions: string;
      readonly targetAuthors: string;
      readonly targetIdentities: string;
      readonly targetRelations: string;
      readonly targetSourceRevisions: string;
      readonly targetCitations: string;
      readonly targetDocuments: string;
      readonly unrelatedLiterature: string;
      readonly unrelatedSourceRevisions: string;
      readonly unrelatedDocuments: string;
    }>(`
      SELECT
        (SELECT count(*)::text FROM "Literature" WHERE "id" = 'literature-personal-1') AS "targetLiterature",
        (SELECT count(*)::text FROM "Assertion" WHERE "literatureId" = 'literature-personal-1') AS "targetAssertions",
        (SELECT count(*)::text FROM "AssertionAuthor" WHERE "literatureId" = 'literature-personal-1') AS "targetAuthors",
        (SELECT count(*)::text FROM "LiteratureIdentity" WHERE "literatureId" = 'literature-personal-1') AS "targetIdentities",
        (SELECT count(*)::text FROM "RelationAssertion" WHERE "subjectLiteratureId" = 'literature-personal-1' OR "objectLiteratureId" = 'literature-personal-1') AS "targetRelations",
        (SELECT count(*)::text FROM "SourceRevision" WHERE "literatureId" = 'literature-personal-1') AS "targetSourceRevisions",
        (SELECT count(*)::text FROM "CitationOccurrence" WHERE "literatureId" = 'literature-personal-1') AS "targetCitations",
        (SELECT count(*)::text FROM "Document" WHERE "id" = 'document-personal-1') AS "targetDocuments",
        (SELECT count(*)::text FROM "Literature" WHERE "id" = 'literature-personal-2') AS "unrelatedLiterature",
        (SELECT count(*)::text FROM "SourceRevision" WHERE "literatureId" = 'literature-personal-2') AS "unrelatedSourceRevisions",
        (SELECT count(*)::text FROM "Document" WHERE "id" = 'document-personal-2') AS "unrelatedDocuments"
    `);
    expect(remaining.rows[0]).toEqual({
      targetLiterature: "0",
      targetAssertions: "0",
      targetAuthors: "0",
      targetIdentities: "0",
      targetRelations: "0",
      targetSourceRevisions: "0",
      targetCitations: "0",
      targetDocuments: "1",
      unrelatedLiterature: "1",
      unrelatedSourceRevisions: "1",
      unrelatedDocuments: "1"
    });
  });
});
