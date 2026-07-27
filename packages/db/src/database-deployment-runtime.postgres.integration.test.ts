import { afterAll, beforeAll, describe, expect, it } from "vitest";

import { deployDatabase } from "./database-deployment.js";
import { DatabaseDeploymentPostgresFixture } from "./database-deployment.postgres-fixture.js";

const runPostgresIntegration = process.env.JIXIA_RUN_POSTGRES_INTEGRATION === "1";
const deploymentTestTimeout = 30_000;

let fixture: DatabaseDeploymentPostgresFixture | undefined;

function requireFixture(): DatabaseDeploymentPostgresFixture {
  if (!fixture) {
    throw new Error("Database deployment fixture is not connected");
  }
  return fixture;
}

describe.skipIf(!runPostgresIntegration)("Database deployment runtime privileges", () => {
  beforeAll(async () => {
    fixture = await DatabaseDeploymentPostgresFixture.connectFromEnvironment();
  }, deploymentTestTimeout);

  afterAll(async () => {
    await fixture?.close();
  }, deploymentTestTimeout);

  it("supports ordinary runtime CRUD while preserving history and DDL boundaries", async () => {
    // Given
    const database = requireFixture();
    const environment = await database.createEnvironment("jixia_task25_deploy_runtime_crud");
    await deployDatabase(environment);
    const runtime = await database.connect(environment.DATABASE_URL ?? "");

    try {
      // When
      await runtime.query(`
        INSERT INTO "User" ("id", "email", "displayName", "passwordHash", "updatedAt")
        VALUES ('runtime-user', 'runtime@example.com', 'Runtime', 'hash', CURRENT_TIMESTAMP);
        UPDATE "User" SET "displayName" = 'Updated Runtime' WHERE "id" = 'runtime-user';
        INSERT INTO "Session" ("id", "userId", "expiresAt", "updatedAt")
        VALUES ('runtime-session', 'runtime-user', CURRENT_TIMESTAMP + INTERVAL '1 hour', CURRENT_TIMESTAMP);
        DELETE FROM "Session" WHERE "id" = 'runtime-session';
        INSERT INTO "Literature" ("id", "ownerUserId", "createdByUserId")
        VALUES ('runtime-literature', 'runtime-user', 'runtime-user');
        UPDATE "Literature" SET "nextAssertionOrdinal" = 2 WHERE "id" = 'runtime-literature';
      `);
      const selected = await runtime.query<{ readonly displayName: string }>(
        'SELECT "displayName" FROM "User" WHERE "id" = $1',
        ["runtime-user"]
      );

      // Then
      expect(selected.rows[0]?.displayName).toBe("Updated Runtime");
      await expect(runtime.query('DELETE FROM "Literature" WHERE "id" = $1', ["runtime-literature"]))
        .rejects.toMatchObject({ code: "42501" });
      await expect(runtime.query('TRUNCATE TABLE "User"')).rejects.toMatchObject({ code: "42501" });
      await expect(runtime.query('CREATE TABLE public."RuntimeDdlProbe" (id integer)'))
        .rejects.toMatchObject({ code: "42501" });
      await expect(runtime.query('SET ROLE "jixia_literature_cleanup_owner"'))
        .rejects.toMatchObject({ code: "42501" });
      const cleanup = await runtime.query<{ readonly deleted: boolean }>(
        "SELECT public.delete_literature_aggregate($1) AS deleted",
        ["runtime-literature"]
      );
      expect(cleanup.rows[0]?.deleted).toBe(true);
      await runtime.query('DELETE FROM "User" WHERE "id" = $1', ["runtime-user"]);
    } finally {
      await runtime.end();
    }
  }, deploymentTestTimeout);

  it("applies minimal deployer defaults to future tables sequences and functions", async () => {
    // Given
    const database = requireFixture();
    const environment = await database.createEnvironment("jixia_task25_deploy_runtime_defaults");
    await deployDatabase(environment);
    const migrator = await database.connect(environment.MIGRATION_DATABASE_URL ?? "");
    await migrator.query(`
      CREATE TABLE public."RuntimeDefaultTable" (id integer PRIMARY KEY, value integer NOT NULL);
      CREATE SEQUENCE public."RuntimeDefaultSequence";
      CREATE FUNCTION public.runtime_default_function() RETURNS integer
      LANGUAGE sql AS 'SELECT 1';
    `);
    const runtime = await database.connect(environment.DATABASE_URL ?? "");

    try {
      // When
      await runtime.query(`
        INSERT INTO public."RuntimeDefaultTable" (id, value) VALUES (1, 1);
        UPDATE public."RuntimeDefaultTable" SET value = 2 WHERE id = 1;
        DELETE FROM public."RuntimeDefaultTable" WHERE id = 1;
      `);
      const sequence = await runtime.query<{ readonly value: string }>(
        'SELECT nextval(\'public."RuntimeDefaultSequence"\')::text AS value'
      );
      const functionPrivileges = await runtime.query<{
        readonly publicExecute: boolean;
        readonly runtimeExecute: boolean;
      }>(`
        SELECT has_function_privilege('public', 'public.runtime_default_function()', 'EXECUTE') AS "publicExecute",
               has_function_privilege(current_user, 'public.runtime_default_function()', 'EXECUTE') AS "runtimeExecute"
      `);

      // Then
      expect(sequence.rows[0]?.value).toBe("1");
      expect(functionPrivileges.rows[0]).toEqual({ publicExecute: false, runtimeExecute: false });
    } finally {
      await runtime.end();
      await migrator.query(`
        DROP FUNCTION public.runtime_default_function();
        DROP SEQUENCE public."RuntimeDefaultSequence";
        DROP TABLE public."RuntimeDefaultTable";
      `);
      await migrator.end();
    }
  }, deploymentTestTimeout);
});
