import { spawn } from "node:child_process";
import { resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { deployDatabase } from "./database-deployment.js";
import { parseDatabaseDeploymentConfig } from "./database-deployment-config.js";
import {
  assertConnectedIdentities,
  withDatabaseClient
} from "./database-deployment-verification.js";
import {
  assertRuntimeMembershipContract,
  databaseDeploymentRoles,
  databaseQuery,
  provisionDatabaseDeploymentRoles
} from "./database-role-contract.js";
import { requireDisposableMigrationDatabaseUrl } from "./postgres-integration-environment.js";

export type PostgresTestEnvironment = Readonly<Record<string, string | undefined>>;

export type PostgresTestCommand = {
  readonly command: string;
  readonly args: readonly string[];
  readonly environment: PostgresTestEnvironment;
};

export type PostgresTestCommandRunner = (
  command: PostgresTestCommand
) => Promise<void>;

export type PostgresTestGateDependencies = {
  readonly revokeConfiguredRuntimeCapability?: (
    environment: PostgresTestEnvironment
  ) => Promise<void>;
  readonly resetAndDeployDatabase?: (
    environment: PostgresTestEnvironment
  ) => Promise<void>;
  readonly runCommand?: PostgresTestCommandRunner;
};

type MembershipRow = {
  readonly adminOption: boolean;
  readonly grantedRole: string;
  readonly memberRole: string;
};

type SqlRow = {
  readonly sql: string;
};

async function resolveDeploymentConfig(environment: PostgresTestEnvironment) {
  requireDisposableMigrationDatabaseUrl(environment);
  const config = parseDatabaseDeploymentConfig(environment);
  await assertConnectedIdentities(config);
  return config;
}

export async function revokeConfiguredRuntimeCapability(
  environment: PostgresTestEnvironment
): Promise<void> {
  const config = await resolveDeploymentConfig(environment);
  await withDatabaseClient(config.migrationDatabaseUrl, async (client) => {
    const query = databaseQuery(client);
    await provisionDatabaseDeploymentRoles(query);
    await assertRuntimeMembershipContract(query, config.runtimeRole, false);

    const memberships = await query<MembershipRow>(
      `
        SELECT granted.rolname AS "grantedRole",
               member.rolname AS "memberRole",
               membership.admin_option AS "adminOption"
        FROM pg_auth_members membership
        JOIN pg_roles granted ON granted.oid = membership.roleid
        JOIN pg_roles member ON member.oid = membership.member
        WHERE granted.rolname = $1 AND member.rolname = $2
      `,
      [databaseDeploymentRoles.application, config.runtimeRole]
    );
    if (memberships.rows.length === 0) {
      return;
    }

    const formatted = await query<SqlRow>(
      `SELECT format('REVOKE %I FROM %I', $1::text, $2::text) AS sql`,
      [databaseDeploymentRoles.application, config.runtimeRole]
    );
    const sql = formatted.rows[0]?.sql;
    if (!sql) {
      throw new Error("PostgreSQL did not format the runtime capability revoke");
    }
    await query(sql);
    await assertRuntimeMembershipContract(query, config.runtimeRole, false);
  });
}

export async function resetAndDeployDatabaseForApiTests(
  environment: PostgresTestEnvironment
): Promise<void> {
  const config = await resolveDeploymentConfig(environment);
  await revokeConfiguredRuntimeCapability(environment);
  await withDatabaseClient(config.migrationDatabaseUrl, async (client) => {
    await client.query("DROP SCHEMA IF EXISTS public CASCADE; CREATE SCHEMA public;");
  });
  await deployDatabase(environment);
}

export async function runPostgresTestGate(
  environment: PostgresTestEnvironment,
  dependencies: PostgresTestGateDependencies = {}
): Promise<void> {
  const revokeConfiguredRuntime =
    dependencies.revokeConfiguredRuntimeCapability ?? revokeConfiguredRuntimeCapability;
  const resetAndDeploy =
    dependencies.resetAndDeployDatabase ?? resetAndDeployDatabaseForApiTests;
  const runCommand = dependencies.runCommand ?? runPostgresTestCommand;

  await revokeConfiguredRuntime(environment);
  await runCommand({
    command: "pnpm",
    args: ["--filter", "@jixia/db", "test:postgres"],
    environment
  });
  await revokeConfiguredRuntime(environment);
  await resetAndDeploy(environment);
  await runCommand({
    command: "pnpm",
    args: ["--filter", "@jixia/api", "test:postgres"],
    environment
  });
}

function runPostgresTestCommand(command: PostgresTestCommand): Promise<void> {
  return new Promise<void>((resolveCommand, rejectCommand) => {
    const child = spawn(command.command, [...command.args], {
      env: { ...process.env, ...command.environment },
      stdio: "inherit"
    });
    child.once("error", rejectCommand);
    child.once("exit", (exitCode, signal) => {
      if (exitCode === 0) {
        resolveCommand();
        return;
      }
      rejectCommand(
        new Error(
          `PostgreSQL test command failed: ${command.command} ${command.args.join(" ")} ` +
            `(exit=${exitCode ?? "null"}, signal=${signal ?? "none"})`
        )
      );
    });
  });
}

async function main(): Promise<void> {
  await runPostgresTestGate(process.env);
}

const entrypoint = process.argv[1]
  ? pathToFileURL(resolve(process.argv[1])).href
  : "";
if (entrypoint === import.meta.url) {
  main().catch((error: unknown) => {
    console.error(error);
    process.exitCode = 1;
  });
}

export const orchestratorEntrypoint = fileURLToPath(import.meta.url);
