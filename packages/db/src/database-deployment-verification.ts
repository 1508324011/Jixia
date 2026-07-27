import { Client, type QueryResultRow } from "pg";

import { assertDatabaseCatalogContract } from "./database-catalog-contract.js";
import { type DatabaseDeploymentConfig } from "./database-deployment-config.js";
import {
  DatabaseDeploymentContractError,
  DatabaseDeploymentPrivilegeError,
  type DatabaseDeploymentSummary
} from "./database-deployment-errors.js";
import {
  assertFixedRoleContract,
  assertRuntimeMembershipContract,
  databaseQuery
} from "./database-role-contract.js";

type ConnectedRoleRow = QueryResultRow & {
  readonly roleName: string;
  readonly rolbypassrls: boolean;
  readonly rolcanlogin: boolean;
  readonly rolcreatedb: boolean;
  readonly rolcreaterole: boolean;
  readonly rolinherit: boolean;
  readonly rolreplication: boolean;
  readonly rolsuper: boolean;
};

export async function withDatabaseClient<Result>(
  connectionString: string,
  operation: (client: Client) => Promise<Result>
): Promise<Result> {
  const client = new Client({ connectionString });
  await client.connect();
  try {
    return await operation(client);
  } finally {
    await client.end();
  }
}

async function readConnectedRole(client: Client): Promise<ConnectedRoleRow> {
  const result = await client.query<ConnectedRoleRow>(`
    SELECT role.rolname AS "roleName", role.rolsuper, role.rolcreatedb,
           role.rolcreaterole, role.rolinherit, role.rolreplication,
           role.rolbypassrls, role.rolcanlogin
    FROM pg_roles role
    WHERE role.rolname = session_user
  `);
  const role = result.rows[0];
  if (!role) {
    throw new DatabaseDeploymentContractError("fixed_role_contract_invalid");
  }
  return role;
}

export async function assertConnectedIdentities(config: DatabaseDeploymentConfig): Promise<void> {
  await withDatabaseClient(config.migrationDatabaseUrl, async (client) => {
    const role = await readConnectedRole(client);
    if (role.roleName !== config.migrationRole) {
      throw new DatabaseDeploymentPrivilegeError("migration_identity_mismatch");
    }
    if (!role.rolsuper) {
      throw new DatabaseDeploymentPrivilegeError("migration_superuser_required");
    }
  });
  await withDatabaseClient(config.runtimeDatabaseUrl, async (client) => {
    const role = await readConnectedRole(client);
    if (role.roleName !== config.runtimeRole) {
      throw new DatabaseDeploymentPrivilegeError("runtime_identity_mismatch");
    }
    if (
      !role.rolcanlogin || !role.rolinherit || role.rolsuper || role.rolcreatedb ||
      role.rolcreaterole || role.rolreplication || role.rolbypassrls
    ) {
      throw new DatabaseDeploymentPrivilegeError("runtime_role_privileged");
    }
  });
}

export async function verifyParsedDatabaseDeployment(
  config: DatabaseDeploymentConfig
): Promise<DatabaseDeploymentSummary> {
  await assertConnectedIdentities(config);
  await withDatabaseClient(config.migrationDatabaseUrl, async (client) => {
    const query = databaseQuery(client);
    await assertFixedRoleContract(query);
    await assertRuntimeMembershipContract(query, config.runtimeRole, true);
    await assertDatabaseCatalogContract(client, config.migrationRole, config.runtimeRole);
  });
  await withDatabaseClient(config.runtimeDatabaseUrl, async (client) => {
    const privileges = await client.query<{
      readonly canDeleteLiterature: boolean;
      readonly canExecuteCleanup: boolean;
    }>(`
      SELECT has_table_privilege(current_user, 'public."Literature"', 'DELETE') AS "canDeleteLiterature",
             has_function_privilege(current_user, 'public.delete_literature_aggregate(text)', 'EXECUTE') AS "canExecuteCleanup"
    `);
    if (privileges.rows[0]?.canDeleteLiterature || !privileges.rows[0]?.canExecuteCleanup) {
      throw new DatabaseDeploymentContractError("cleanup_function_contract_invalid");
    }
  });
  return { migrationRole: config.migrationRole, runtimeRole: config.runtimeRole };
}
