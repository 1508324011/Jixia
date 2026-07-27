import { afterAll, beforeAll, describe, expect, it } from "vitest";

import {
  DatabaseDeploymentContractError,
  deployDatabase,
  verifyDatabaseDeployment
} from "./database-deployment.js";
import {
  DatabaseDeploymentPostgresFixture,
  deploymentTestRoles
} from "./database-deployment.postgres-fixture.js";

const runPostgresIntegration = process.env.JIXIA_RUN_POSTGRES_INTEGRATION === "1";
const deploymentTestTimeout = 30_000;

let fixture: DatabaseDeploymentPostgresFixture | undefined;

function requireFixture(): DatabaseDeploymentPostgresFixture {
  if (!fixture) {
    throw new Error("Database deployment fixture is not connected");
  }
  return fixture;
}

async function expectContractRejection(
  environment: Readonly<Record<string, string>>
): Promise<void> {
  await expect(verifyDatabaseDeployment(environment)).rejects.toBeInstanceOf(
    DatabaseDeploymentContractError
  );
}

describe.skipIf(!runPostgresIntegration)("Database deployment catalog drift", () => {
  beforeAll(async () => {
    fixture = await DatabaseDeploymentPostgresFixture.connectFromEnvironment();
  }, deploymentTestTimeout);

  afterAll(async () => {
    await fixture?.close();
  }, deploymentTestTimeout);

  it("rejects a missing direct runtime table privilege", async () => {
    // Given
    const database = requireFixture();
    const environment = await database.createEnvironment("jixia_task25_deploy_missing_table_acl");
    await deployDatabase(environment);
    const migrator = await database.connect(environment.MIGRATION_DATABASE_URL ?? "");
    await migrator.query(`REVOKE UPDATE ON TABLE public."User" FROM "${deploymentTestRoles.runtime}"`);
    await migrator.end();

    // When / Then
    await expectContractRejection(environment);
  }, deploymentTestTimeout);

  it("rejects an unexpected runtime table privilege", async () => {
    // Given
    const database = requireFixture();
    const environment = await database.createEnvironment("jixia_task25_deploy_extra_table_acl");
    await deployDatabase(environment);
    const migrator = await database.connect(environment.MIGRATION_DATABASE_URL ?? "");
    await migrator.query(`GRANT TRUNCATE ON TABLE public."User" TO "${deploymentTestRoles.runtime}"`);
    await migrator.end();

    // When / Then
    await expectContractRejection(environment);
  }, deploymentTestTimeout);

  it("rejects schema CREATE drift", async () => {
    // Given
    const database = requireFixture();
    const environment = await database.createEnvironment("jixia_task25_deploy_schema_create");
    await deployDatabase(environment);
    const migrator = await database.connect(environment.MIGRATION_DATABASE_URL ?? "");
    await migrator.query(`
      GRANT CREATE ON SCHEMA public TO "${deploymentTestRoles.runtime}";
    `);
    await migrator.end();

    // When / Then
    await expectContractRejection(environment);
  }, deploymentTestTimeout);

  it("rejects schema ownership drift", async () => {
    // Given
    const database = requireFixture();
    const environment = await database.createEnvironment("jixia_task25_deploy_schema_owner");
    await deployDatabase(environment);
    const migrator = await database.connect(environment.MIGRATION_DATABASE_URL ?? "");
    await migrator.query(`ALTER SCHEMA public OWNER TO "${deploymentTestRoles.runtime}"`);
    await migrator.end();

    // When / Then
    await expectContractRejection(environment);
  }, deploymentTestTimeout);

  it("rejects database CREATE drift", async () => {
    // Given
    const database = requireFixture();
    const databaseName = "jixia_task25_deploy_database_create";
    const environment = await database.createEnvironment(databaseName);
    await deployDatabase(environment);
    const migrator = await database.connect(environment.MIGRATION_DATABASE_URL ?? "");
    await migrator.query(
      `GRANT CREATE ON DATABASE "${databaseName}" TO "${deploymentTestRoles.runtime}"`
    );
    await migrator.end();

    // When / Then
    await expectContractRejection(environment);
  }, deploymentTestTimeout);

  it("rejects database ownership drift", async () => {
    // Given
    const database = requireFixture();
    const databaseName = "jixia_task25_deploy_database_owner";
    const environment = await database.createEnvironment(databaseName);
    await deployDatabase(environment);
    const migrator = await database.connect(environment.MIGRATION_DATABASE_URL ?? "");
    await migrator.query(
      `ALTER DATABASE "${databaseName}" OWNER TO "${deploymentTestRoles.runtime}"`
    );
    await migrator.end();

    // When / Then
    await expectContractRejection(environment);
  }, deploymentTestTimeout);

  it("rejects table ownership drift", async () => {
    // Given
    const database = requireFixture();
    const environment = await database.createEnvironment("jixia_task25_deploy_table_owner");
    await deployDatabase(environment);
    const migrator = await database.connect(environment.MIGRATION_DATABASE_URL ?? "");
    await migrator.query(`
      ALTER TABLE public."User" OWNER TO "${deploymentTestRoles.runtime}";
    `);
    await migrator.end();

    // When / Then
    await expectContractRejection(environment);
  }, deploymentTestTimeout);

  it("rejects capability-role table DML drift", async () => {
    // Given
    const database = requireFixture();
    const environment = await database.createEnvironment("jixia_task25_deploy_capability_dml");
    await deployDatabase(environment);
    const migrator = await database.connect(environment.MIGRATION_DATABASE_URL ?? "");
    await migrator.query(
      'GRANT SELECT ON TABLE public."Space" TO "jixia_literature_application"'
    );
    await migrator.end();

    // When / Then
    await expectContractRejection(environment);
  }, deploymentTestTimeout);

  it("rejects extra function execution", async () => {
    // Given
    const database = requireFixture();
    const environment = await database.createEnvironment("jixia_task25_deploy_function_acl");
    await deployDatabase(environment);
    const migrator = await database.connect(environment.MIGRATION_DATABASE_URL ?? "");
    await migrator.query(`
      GRANT EXECUTE ON FUNCTION public.enforce_literature_ownership_immutable() TO PUBLIC;
    `);
    await migrator.end();

    // When / Then
    await expectContractRejection(environment);
  }, deploymentTestTimeout);

  it("rejects function ownership drift", async () => {
    // Given
    const database = requireFixture();
    const environment = await database.createEnvironment("jixia_task25_deploy_function_owner");
    await deployDatabase(environment);
    const migrator = await database.connect(environment.MIGRATION_DATABASE_URL ?? "");
    await migrator.query(`
      ALTER FUNCTION public.enforce_import_operation_transition()
        OWNER TO "jixia_literature_cleanup_owner";
    `);
    await migrator.end();

    // When / Then
    await expectContractRejection(environment);
  }, deploymentTestTimeout);

  it("rejects default ACL drift", async () => {
    // Given
    const database = requireFixture();
    const environment = await database.createEnvironment("jixia_task25_deploy_default_acl");
    await deployDatabase(environment);
    const migrator = await database.connect(environment.MIGRATION_DATABASE_URL ?? "");
    await migrator.query(`
      ALTER DEFAULT PRIVILEGES FOR ROLE "${deploymentTestRoles.migrator}" IN SCHEMA public
        GRANT TRUNCATE ON TABLES TO "${deploymentTestRoles.runtime}";
    `);
    await migrator.end();

    // When / Then
    await expectContractRejection(environment);
  }, deploymentTestTimeout);

  it("rejects an unexpected sequence", async () => {
    // Given
    const database = requireFixture();
    const environment = await database.createEnvironment("jixia_task25_deploy_sequence_drift");
    await deployDatabase(environment);
    const migrator = await database.connect(environment.MIGRATION_DATABASE_URL ?? "");
    await migrator.query('CREATE SEQUENCE public."UnexpectedRuntimeSequence"');
    await migrator.end();

    // When / Then
    await expectContractRejection(environment);
  }, deploymentTestTimeout);

  it("rejects an outgoing membership from the application capability role", async () => {
    // Given
    const database = requireFixture();
    const environment = await database.createEnvironment("jixia_task25_deploy_membership_drift");
    await deployDatabase(environment);
    const migrator = await database.connect(environment.MIGRATION_DATABASE_URL ?? "");
    await migrator.query(
      `GRANT "${deploymentTestRoles.migrator}" TO "jixia_literature_application"`
    );

    try {
      // When / Then
      await expectContractRejection(environment);
    } finally {
      await migrator.query(
        `REVOKE "${deploymentTestRoles.migrator}" FROM "jixia_literature_application"`
      );
      await migrator.end();
    }
  }, deploymentTestTimeout);
});
