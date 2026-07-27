import { type Client, type QueryResult, type QueryResultRow } from "pg";

import {
  DatabaseDeploymentContractError,
  DatabaseDeploymentPrivilegeError
} from "./database-deployment-errors.js";

export const databaseDeploymentRoles = {
  application: "jixia_literature_application",
  cleanupOwner: "jixia_literature_cleanup_owner"
} as const;

export type DatabaseQuery = <Row extends QueryResultRow>(
  sql: string,
  values?: readonly unknown[]
) => Promise<QueryResult<Row>>;

type FixedRoleRow = QueryResultRow & {
  readonly roleName: string;
  readonly rolbypassrls: boolean;
  readonly rolcanlogin: boolean;
  readonly rolcreatedb: boolean;
  readonly rolcreaterole: boolean;
  readonly rolinherit: boolean;
  readonly rolreplication: boolean;
  readonly rolsuper: boolean;
};

type MembershipRow = QueryResultRow & {
  readonly adminOption: boolean;
  readonly grantedRole: string;
  readonly memberRole: string;
};

type SqlRow = QueryResultRow & { readonly sql: string };

export function databaseQuery(client: Client): DatabaseQuery {
  return <Row extends QueryResultRow>(sql: string, values: readonly unknown[] = []) =>
    client.query<Row>(sql, [...values]);
}

async function readMemberships(query: DatabaseQuery): Promise<readonly MembershipRow[]> {
  const result = await query<MembershipRow>(`
    SELECT granted.rolname AS "grantedRole", member.rolname AS "memberRole",
           membership.admin_option AS "adminOption"
    FROM pg_auth_members membership
    JOIN pg_roles granted ON granted.oid = membership.roleid
    JOIN pg_roles member ON member.oid = membership.member
  `);
  return result.rows;
}

export async function assertFixedRoleContract(query: DatabaseQuery): Promise<void> {
  const fixedRoles = await query<FixedRoleRow>(`
    SELECT rolname AS "roleName", rolsuper, rolcreatedb, rolcreaterole, rolinherit,
           rolreplication, rolbypassrls, rolcanlogin
    FROM pg_roles
    WHERE rolname = ANY($1::text[])
  `, [[databaseDeploymentRoles.application, databaseDeploymentRoles.cleanupOwner]]);
  if (
    fixedRoles.rows.length !== 2 ||
    fixedRoles.rows.some(
      (role) => role.rolsuper || role.rolcreatedb || role.rolcreaterole || role.rolinherit ||
        role.rolreplication || role.rolbypassrls || role.rolcanlogin
    )
  ) {
    throw new DatabaseDeploymentContractError("fixed_role_contract_invalid");
  }

  const memberships = await readMemberships(query);
  if (
    memberships.some(
      ({ grantedRole, memberRole }) =>
        grantedRole === databaseDeploymentRoles.cleanupOwner ||
        memberRole === databaseDeploymentRoles.cleanupOwner
    )
  ) {
    throw new DatabaseDeploymentContractError("cleanup_owner_has_memberships");
  }
}

export async function assertRuntimeMembershipContract(
  query: DatabaseQuery,
  runtimeRole: string,
  requireRuntimeMembership: boolean
): Promise<void> {
  const memberships = await readMemberships(query);
  const relevantRoles = new Set([
    databaseDeploymentRoles.application,
    databaseDeploymentRoles.cleanupOwner,
    runtimeRole
  ]);
  const relevantMemberships = memberships.filter(
    ({ grantedRole, memberRole }) => relevantRoles.has(grantedRole) || relevantRoles.has(memberRole)
  );
  if (relevantMemberships.length === 0) {
    if (requireRuntimeMembership) {
      throw new DatabaseDeploymentContractError("missing_runtime_membership");
    }
    return;
  }
  const expectedMemberships = relevantMemberships.filter(
    ({ adminOption, grantedRole, memberRole }) =>
      grantedRole === databaseDeploymentRoles.application &&
      memberRole === runtimeRole &&
      !adminOption
  );
  const unexpectedMemberships = relevantMemberships.filter(
    (membership) => !expectedMemberships.includes(membership)
  );
  if (
    unexpectedMemberships.some(
      ({ grantedRole, memberRole }) =>
        grantedRole === databaseDeploymentRoles.application ||
        memberRole === databaseDeploymentRoles.application
    )
  ) {
    throw new DatabaseDeploymentContractError("capability_role_has_unexpected_members");
  }
  if (unexpectedMemberships.length > 0) {
    throw new DatabaseDeploymentPrivilegeError("runtime_role_memberships_invalid");
  }
  if (expectedMemberships.length !== 1) {
    throw new DatabaseDeploymentContractError("missing_runtime_membership");
  }
}

export async function provisionDatabaseDeploymentRoles(query: DatabaseQuery): Promise<void> {
  await query("BEGIN");
  try {
    await query(`
      DO $roles$
      BEGIN
        IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'jixia_literature_cleanup_owner') THEN
          CREATE ROLE "jixia_literature_cleanup_owner" NOLOGIN;
        END IF;
        IF NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname = 'jixia_literature_application') THEN
          CREATE ROLE "jixia_literature_application" NOLOGIN;
        END IF;
      END
      $roles$;
      ALTER ROLE "jixia_literature_cleanup_owner"
        NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS;
      ALTER ROLE "jixia_literature_application"
        NOLOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOINHERIT NOREPLICATION NOBYPASSRLS;
    `);
    await assertFixedRoleContract(query);
    await query("COMMIT");
  } catch (error) {
    await query("ROLLBACK");
    throw error;
  }
}

export async function grantDatabaseRuntimeCapability(
  query: DatabaseQuery,
  runtimeRole: string
): Promise<void> {
  const formatted = await query<SqlRow>(
    `SELECT format(
       'GRANT jixia_literature_application TO %1$I; REVOKE ADMIN OPTION FOR jixia_literature_application FROM %1$I',
       $1::text
     ) AS sql`,
    [runtimeRole]
  );
  const sql = formatted.rows[0]?.sql;
  if (!sql) {
    throw new DatabaseDeploymentContractError("missing_runtime_membership");
  }
  await query(sql);
}
