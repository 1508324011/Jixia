import { parseDatabaseDeploymentConfig } from "./database-deployment-config.js";
import { type DatabaseDeploymentSummary } from "./database-deployment-errors.js";
import { runPrismaMigration } from "./database-deployment-prisma.js";
import { provisionDatabaseRuntimePrivileges } from "./database-privilege-contract.js";
import {
  assertConnectedIdentities,
  verifyParsedDatabaseDeployment,
  withDatabaseClient
} from "./database-deployment-verification.js";
import {
  assertRuntimeMembershipContract,
  databaseQuery,
  grantDatabaseRuntimeCapability,
  provisionDatabaseDeploymentRoles
} from "./database-role-contract.js";

export {
  DatabaseDeploymentContractError,
  DatabaseDeploymentPrivilegeError,
  type DatabaseDeploymentContractErrorCode,
  type DatabaseDeploymentPrivilegeErrorCode,
  type DatabaseDeploymentSummary
} from "./database-deployment-errors.js";
export {
  databaseDeploymentRoles,
  grantDatabaseRuntimeCapability,
  provisionDatabaseDeploymentRoles,
  type DatabaseQuery
} from "./database-role-contract.js";

export async function verifyDatabaseDeployment(
  environment: Readonly<Record<string, string | undefined>>
): Promise<DatabaseDeploymentSummary> {
  return verifyParsedDatabaseDeployment(parseDatabaseDeploymentConfig(environment));
}

export async function deployDatabase(
  environment: Readonly<Record<string, string | undefined>>
): Promise<DatabaseDeploymentSummary> {
  const config = parseDatabaseDeploymentConfig(environment);
  await assertConnectedIdentities(config);
  await withDatabaseClient(config.migrationDatabaseUrl, async (client) => {
    const query = databaseQuery(client);
    await provisionDatabaseDeploymentRoles(query);
    await assertRuntimeMembershipContract(query, config.runtimeRole, false);
  });
  await runPrismaMigration(config.prismaMigrationDatabaseUrl);
  await withDatabaseClient(config.migrationDatabaseUrl, async (client) => {
    const query = databaseQuery(client);
    await grantDatabaseRuntimeCapability(query, config.runtimeRole);
    await provisionDatabaseRuntimePrivileges(query, config);
  });
  return verifyParsedDatabaseDeployment(config);
}
