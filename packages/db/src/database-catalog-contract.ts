import { type Client, type QueryResultRow } from "pg";

import { DatabaseDeploymentContractError } from "./database-deployment-errors.js";
import {
  databaseApplicationTables,
  databaseFunctions,
  literatureCleanupTables,
  runtimeDeletableTables
} from "./database-privilege-contract.js";
import { databaseDeploymentRoles } from "./database-role-contract.js";

type CatalogRow = QueryResultRow & { readonly value: string };

const catalogQuery = `
  WITH catalog_values AS (
    SELECT format('database|owner|%s', owner.rolname) AS value
    FROM pg_database database
    JOIN pg_roles owner ON owner.oid = database.datdba
    WHERE database.datname = current_database()

    UNION ALL
    SELECT format('database|acl|%s|%s|%s',
                  COALESCE(grantee.rolname, 'PUBLIC'), acl.privilege_type, acl.is_grantable)
    FROM pg_database database
    CROSS JOIN LATERAL aclexplode(COALESCE(database.datacl, acldefault('d', database.datdba))) acl
    LEFT JOIN pg_roles grantee ON grantee.oid = acl.grantee
    WHERE database.datname = current_database() AND acl.grantee <> database.datdba

    UNION ALL
    SELECT format('schema|public|owner|%s', owner.rolname)
    FROM pg_namespace namespace
    JOIN pg_roles owner ON owner.oid = namespace.nspowner
    WHERE namespace.nspname = 'public'

    UNION ALL
    SELECT format('schema|public|acl|%s|%s|%s',
                  COALESCE(grantee.rolname, 'PUBLIC'), acl.privilege_type, acl.is_grantable)
    FROM pg_namespace namespace
    CROSS JOIN LATERAL aclexplode(COALESCE(namespace.nspacl, acldefault('n', namespace.nspowner))) acl
    LEFT JOIN pg_roles grantee ON grantee.oid = acl.grantee
    WHERE namespace.nspname = 'public' AND acl.grantee <> namespace.nspowner

    UNION ALL
    SELECT format('relation|%s|%s|owner|%s', relation.relkind, relation.relname, owner.rolname)
    FROM pg_class relation
    JOIN pg_namespace namespace ON namespace.oid = relation.relnamespace
    JOIN pg_roles owner ON owner.oid = relation.relowner
    WHERE namespace.nspname = 'public' AND relation.relkind IN ('r', 'p', 'S')

    UNION ALL
    SELECT format('relation|%s|%s|acl|%s|%s|%s', relation.relkind, relation.relname,
                  COALESCE(grantee.rolname, 'PUBLIC'), acl.privilege_type, acl.is_grantable)
    FROM pg_class relation
    JOIN pg_namespace namespace ON namespace.oid = relation.relnamespace
    CROSS JOIN LATERAL aclexplode(COALESCE(
      relation.relacl,
      acldefault(
        CASE WHEN relation.relkind = 'S' THEN 'S'::"char" ELSE 'r'::"char" END,
        relation.relowner
      )
    )) acl
    LEFT JOIN pg_roles grantee ON grantee.oid = acl.grantee
    WHERE namespace.nspname = 'public'
      AND relation.relkind IN ('r', 'p', 'S')
      AND acl.grantee <> relation.relowner

    UNION ALL
    SELECT format('function|%s|owner|%s|security_definer|%s|configuration|%s',
                  procedure.oid::regprocedure::text, owner.rolname, procedure.prosecdef,
                  COALESCE(array_to_string(procedure.proconfig, ','), ''))
    FROM pg_proc procedure
    JOIN pg_namespace namespace ON namespace.oid = procedure.pronamespace
    JOIN pg_roles owner ON owner.oid = procedure.proowner
    WHERE namespace.nspname = 'public' AND procedure.prokind = 'f'

    UNION ALL
    SELECT format('function|%s|acl|%s|%s|%s', procedure.oid::regprocedure::text,
                  COALESCE(grantee.rolname, 'PUBLIC'), acl.privilege_type, acl.is_grantable)
    FROM pg_proc procedure
    JOIN pg_namespace namespace ON namespace.oid = procedure.pronamespace
    CROSS JOIN LATERAL aclexplode(COALESCE(procedure.proacl, acldefault('f', procedure.proowner))) acl
    LEFT JOIN pg_roles grantee ON grantee.oid = acl.grantee
    WHERE namespace.nspname = 'public'
      AND procedure.prokind = 'f'
      AND acl.grantee <> procedure.proowner

    UNION ALL
    SELECT format('default|%s|%s|%s', owner.rolname,
                  COALESCE(namespace.nspname, '<global>'), defaults.defaclobjtype)
    FROM pg_default_acl defaults
    JOIN pg_roles owner ON owner.oid = defaults.defaclrole
    LEFT JOIN pg_namespace namespace ON namespace.oid = defaults.defaclnamespace
    WHERE owner.rolname = $1

    UNION ALL
    SELECT format('default|%s|%s|%s|acl|%s|%s|%s', owner.rolname,
                  COALESCE(namespace.nspname, '<global>'), defaults.defaclobjtype,
                  COALESCE(grantee.rolname, 'PUBLIC'), acl.privilege_type, acl.is_grantable)
    FROM pg_default_acl defaults
    JOIN pg_roles owner ON owner.oid = defaults.defaclrole
    LEFT JOIN pg_namespace namespace ON namespace.oid = defaults.defaclnamespace
    CROSS JOIN LATERAL aclexplode(defaults.defaclacl) acl
    LEFT JOIN pg_roles grantee ON grantee.oid = acl.grantee
    WHERE owner.rolname = $1 AND acl.grantee <> defaults.defaclrole
  )
  SELECT value FROM catalog_values ORDER BY value
`;

function expectedCatalog(migrationRole: string, runtimeRole: string): readonly string[] {
  const expected = [
    `database|owner|${migrationRole}`,
    `database|acl|${runtimeRole}|CONNECT|f`,
    `schema|public|owner|${migrationRole}`,
    `schema|public|acl|${databaseDeploymentRoles.application}|USAGE|f`,
    `schema|public|acl|${databaseDeploymentRoles.cleanupOwner}|USAGE|f`,
    `schema|public|acl|${runtimeRole}|USAGE|f`,
    `relation|r|_prisma_migrations|owner|${migrationRole}`,
    `function|delete_literature_aggregate(text)|owner|${databaseDeploymentRoles.cleanupOwner}|security_definer|t|configuration|search_path=pg_catalog, public, pg_temp`,
    `function|delete_literature_aggregate(text)|acl|${databaseDeploymentRoles.application}|EXECUTE|f`,
    `default|${migrationRole}|<global>|f`,
    `default|${migrationRole}|public|S`,
    `default|${migrationRole}|public|r`
  ];

  for (const tableName of databaseApplicationTables) {
    expected.push(`relation|r|${tableName}|owner|${migrationRole}`);
    for (const privilege of ["INSERT", "SELECT", "UPDATE"] as const) {
      expected.push(`relation|r|${tableName}|acl|${runtimeRole}|${privilege}|f`);
    }
  }
  for (const tableName of runtimeDeletableTables) {
    expected.push(`relation|r|${tableName}|acl|${runtimeRole}|DELETE|f`);
  }
  for (const tableName of literatureCleanupTables) {
    expected.push(
      `relation|r|${tableName}|acl|${databaseDeploymentRoles.cleanupOwner}|SELECT|f`,
      `relation|r|${tableName}|acl|${databaseDeploymentRoles.cleanupOwner}|DELETE|f`
    );
  }
  for (const signature of databaseFunctions) {
    if (signature === "delete_literature_aggregate(text)") {
      continue;
    }
    const configuration = signature === "reject_append_only_change()"
      ? "search_path=pg_catalog, pg_temp"
      : "";
    expected.push(
      `function|${signature}|owner|${migrationRole}|security_definer|f|configuration|${configuration}`
    );
  }
  for (const privilege of ["DELETE", "INSERT", "SELECT", "UPDATE"] as const) {
    expected.push(`default|${migrationRole}|public|r|acl|${runtimeRole}|${privilege}|f`);
  }
  expected.push(`default|${migrationRole}|public|S|acl|${runtimeRole}|USAGE|f`);
  return expected.sort();
}

export async function assertDatabaseCatalogContract(
  client: Client,
  migrationRole: string,
  runtimeRole: string
): Promise<void> {
  const result = await client.query<CatalogRow>(catalogQuery, [migrationRole]);
  const actual = result.rows.map(({ value }) => value).sort();
  const expected = expectedCatalog(migrationRole, runtimeRole);
  if (actual.length !== expected.length || actual.some((value, index) => value !== expected[index])) {
    throw new DatabaseDeploymentContractError("database_catalog_contract_invalid");
  }
}
