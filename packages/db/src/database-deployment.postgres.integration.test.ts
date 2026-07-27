import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  DatabaseDeploymentContractError,
  DatabaseDeploymentPrivilegeError,
  deployDatabase,
  verifyDatabaseDeployment
} from "./database-deployment.js";
import {
  DatabaseDeploymentPostgresFixture,
  deploymentTestRoles
} from "./database-deployment.postgres-fixture.js";

const runPostgresIntegration = process.env.JIXIA_RUN_POSTGRES_INTEGRATION === "1";
const deploymentTestTimeout = 30_000;

type CountRow = { readonly count: string };
type RoleRow = {
  readonly applicationMember: boolean;
  readonly cleanupOwnerMember: boolean;
  readonly roleName: string;
};

let fixture: DatabaseDeploymentPostgresFixture | undefined;

function requireFixture(): DatabaseDeploymentPostgresFixture {
  if (!fixture) {
    throw new Error("Database deployment fixture is not connected");
  }
  return fixture;
}

describe.skipIf(!runPostgresIntegration)("Database deployment contract", () => {
  beforeAll(async () => {
    fixture = await DatabaseDeploymentPostgresFixture.connectFromEnvironment();
  }, deploymentTestTimeout);

  afterAll(async () => {
    await fixture?.close();
  }, 30_000);

  it("rejects a migration identity that is not a PostgreSQL superuser", async () => {
    // Given
    const environment = await requireFixture().createEnvironment(
      "jixia_task25_deploy_insufficient",
      deploymentTestRoles.insufficient
    );

    // When
    const deployment = deployDatabase(environment);

    // Then
    await expect(deployment).rejects.toEqual(
      new DatabaseDeploymentPrivilegeError("migration_superuser_required")
    );
  }, deploymentTestTimeout);

  it("rejects a runtime identity that cannot inherit its cleanup capability", async () => {
    // Given
    const database = requireFixture();
    const environment = await database.createEnvironment("jixia_task25_deploy_noinherit");
    const migrator = await database.connect(environment.MIGRATION_DATABASE_URL ?? "");
    await migrator.query(`ALTER ROLE "${deploymentTestRoles.runtime}" NOINHERIT`);
    await migrator.end();

    try {
      // When
      const deployment = deployDatabase(environment);

      // Then
      await expect(deployment).rejects.toEqual(
        new DatabaseDeploymentPrivilegeError("runtime_role_privileged")
      );
    } finally {
      const restorer = await database.connect(environment.MIGRATION_DATABASE_URL ?? "");
      await restorer.query(`ALTER ROLE "${deploymentTestRoles.runtime}" INHERIT`);
      await restorer.end();
    }
  }, deploymentTestTimeout);

  it("rejects direct Phase 2 migration invocation without the wrapper marker", async () => {
    // Given
    const database = requireFixture();
    const environment = await database.createEnvironment("jixia_task25_deploy_direct");
    const migrationUrl = environment.MIGRATION_DATABASE_URL ?? "";
    await database.applyMigrationsBeforePhase2(migrationUrl);

    // When
    const migration = database.applyPhase2Directly(migrationUrl);

    // Then
    await expect(migration).rejects.toMatchObject({
      code: "42501",
      message: expect.stringContaining("pnpm db:deploy")
    });
  }, deploymentTestTimeout);

  it("deploys through a named migrator and grants only the runtime capability", async () => {
    // Given
    const database = requireFixture();
    const environment = await database.createEnvironment("jixia_task25_deploy_success");

    // When
    await deployDatabase(environment);

    // Then
    await expect(verifyDatabaseDeployment(environment)).resolves.toMatchObject({
      migrationRole: deploymentTestRoles.migrator,
      runtimeRole: deploymentTestRoles.runtime
    });
    const runtime = await database.connect(environment.DATABASE_URL ?? "");
    try {
      const roles = await runtime.query<RoleRow>(`
        SELECT current_user AS "roleName",
               pg_has_role(current_user, 'jixia_literature_application', 'MEMBER') AS "applicationMember",
               pg_has_role(current_user, 'jixia_literature_cleanup_owner', 'MEMBER') AS "cleanupOwnerMember"
      `);
      expect(roles.rows[0]).toEqual({
        applicationMember: true,
        cleanupOwnerMember: false,
        roleName: deploymentTestRoles.runtime
      });
    } finally {
      await runtime.end();
    }
  }, deploymentTestTimeout);

  it("reports a revoked runtime capability during deployment verification", async () => {
    // Given
    const database = requireFixture();
    const environment = await database.createEnvironment("jixia_task25_deploy_revoked");
    await deployDatabase(environment);
    const migrator = await database.connect(environment.MIGRATION_DATABASE_URL ?? "");
    await migrator.query(
      'REVOKE "jixia_literature_application" FROM "task25_deploy_runtime"'
    );
    await migrator.end();

    // When
    const verification = verifyDatabaseDeployment(environment);

    // Then
    await expect(verification).rejects.toEqual(
      new DatabaseDeploymentContractError("missing_runtime_membership")
    );
  }, deploymentTestTimeout);

  it("prevents the runtime identity from direct deletion or owner impersonation", async () => {
    // Given
    const database = requireFixture();
    const environment = await database.createEnvironment("jixia_task25_deploy_denied");
    await deployDatabase(environment);
    const runtime = await database.connect(environment.DATABASE_URL ?? "");

    // When
    const directDelete = runtime.query('DELETE FROM "Literature"');
    const ownerImpersonation = runtime.query('SET ROLE "jixia_literature_cleanup_owner"');

    // Then
    await expect(directDelete).rejects.toMatchObject({ code: "42501" });
    await expect(ownerImpersonation).rejects.toMatchObject({ code: "42501" });
    await runtime.end();
  }, deploymentTestTimeout);

  it("allows runtime cleanup only through the security-definer function", async () => {
    // Given
    const database = requireFixture();
    const environment = await database.createEnvironment("jixia_task25_deploy_cleanup");
    await deployDatabase(environment);
    const migrator = await database.connect(environment.MIGRATION_DATABASE_URL ?? "");
    await migrator.query(`
      INSERT INTO "User" ("id", "email", "displayName", "passwordHash", "updatedAt")
      VALUES ('deploy-user', 'deploy@example.com', 'Deploy', 'hash', CURRENT_TIMESTAMP);
      INSERT INTO "Literature" ("id", "ownerUserId", "createdByUserId")
      VALUES ('deploy-literature', 'deploy-user', 'deploy-user')
    `);
    await migrator.end();
    const runtime = await database.connect(environment.DATABASE_URL ?? "");

    // When
    const cleanup = await runtime.query<{ readonly deleted: boolean }>(
      "SELECT public.delete_literature_aggregate($1) AS deleted",
      ["deploy-literature"]
    );

    // Then
    expect(cleanup.rows[0]?.deleted).toBe(true);
    await runtime.end();
    const verifier = await database.connect(environment.MIGRATION_DATABASE_URL ?? "");
    const remaining = await verifier.query<CountRow>(
      'SELECT count(*)::text AS count FROM "Literature" WHERE "id" = $1',
      ["deploy-literature"]
    );
    expect(remaining.rows[0]?.count).toBe("0");
    await verifier.end();
  }, deploymentTestTimeout);

  it("rolls back database objects without removing cluster role boundaries", async () => {
    // Given
    const database = requireFixture();
    const environment = await database.createEnvironment("jixia_task25_deploy_rollback");
    await deployDatabase(environment);

    // When
    await database.rollbackPhase2(environment.MIGRATION_DATABASE_URL ?? "");

    // Then
    const migrator = await database.connect(environment.MIGRATION_DATABASE_URL ?? "");
    const roles = await migrator.query<CountRow>(`
      SELECT count(*)::text AS count
      FROM pg_roles
      WHERE rolname IN ('jixia_literature_application', 'jixia_literature_cleanup_owner')
    `);
    expect(roles.rows[0]?.count).toBe("2");
    const cleanupFunction = await migrator.query<{ readonly functionName: string | null }>(
      "SELECT to_regprocedure('public.delete_literature_aggregate(text)')::text AS \"functionName\""
    );
    expect(cleanupFunction.rows[0]?.functionName).toBeNull();
    await migrator.end();
  }, deploymentTestTimeout);
});
