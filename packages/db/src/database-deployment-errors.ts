const privilegeErrorMessages = {
  migration_identity_mismatch: "MIGRATION_DATABASE_URL did not connect as its explicit role",
  migration_superuser_required: "MIGRATION_DATABASE_URL must connect as a PostgreSQL superuser",
  runtime_identity_mismatch: "DATABASE_URL did not connect as its explicit role",
  runtime_role_memberships_invalid: "DATABASE_URL must not inherit unrelated database roles",
  runtime_role_privileged: "DATABASE_URL must connect as an unprivileged runtime role"
} as const;

const contractErrorMessages = {
  capability_role_has_unexpected_members: "The literature application role has unexpected members",
  cleanup_function_contract_invalid: "The literature cleanup function violates its security contract",
  cleanup_owner_has_memberships: "The literature cleanup owner must remain memberless",
  database_catalog_contract_invalid: "The database catalog violates the deployment privilege contract",
  deployment_command_failed: "Prisma migration deployment failed",
  fixed_role_contract_invalid: "The fixed literature database roles violate their privilege contract",
  missing_runtime_membership: "The runtime role lacks the literature application capability"
} as const;

export type DatabaseDeploymentPrivilegeErrorCode = keyof typeof privilegeErrorMessages;
export type DatabaseDeploymentContractErrorCode = keyof typeof contractErrorMessages;

export type DatabaseDeploymentSummary = {
  readonly migrationRole: string;
  readonly runtimeRole: string;
};

export class DatabaseDeploymentPrivilegeError extends Error {
  readonly name = "DatabaseDeploymentPrivilegeError";

  constructor(readonly code: DatabaseDeploymentPrivilegeErrorCode) {
    super(privilegeErrorMessages[code]);
  }
}

export class DatabaseDeploymentContractError extends Error {
  readonly name = "DatabaseDeploymentContractError";

  constructor(readonly code: DatabaseDeploymentContractErrorCode) {
    super(contractErrorMessages[code]);
  }
}
