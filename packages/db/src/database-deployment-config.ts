import { z } from "zod";

export const phase2DeploymentContract = {
  setting: "jixia.phase2_deployment_contract",
  value: "phase2-v1"
} as const;

const postgresqlUrlSchema = z.url();
const reservedDatabaseRoles = new Set([
  "jixia_literature_application",
  "jixia_literature_cleanup_owner"
]);
const roleNameSchema = z
  .string()
  .min(1)
  .refine((value) => !value.includes("\0") && new TextEncoder().encode(value).byteLength <= 63);

const configErrorMessages = {
  missing_migration_url: "Database deployment requires MIGRATION_DATABASE_URL",
  missing_runtime_url: "Database deployment requires DATABASE_URL",
  invalid_migration_url: "MIGRATION_DATABASE_URL must be a PostgreSQL URL with an explicit role",
  invalid_runtime_url: "DATABASE_URL must be a PostgreSQL URL with an explicit role",
  invalid_migration_role: "MIGRATION_DATABASE_URL contains an invalid PostgreSQL role",
  invalid_runtime_role: "DATABASE_URL contains an invalid PostgreSQL role",
  reserved_database_role: "Deployment URLs cannot use a fixed literature capability role",
  shared_database_role: "Migration and runtime database roles must be distinct",
  database_target_mismatch: "MIGRATION_DATABASE_URL and DATABASE_URL must target the same database"
} as const;

export type DatabaseDeploymentConfigErrorCode = keyof typeof configErrorMessages;

type ParsedDatabaseUrl = {
  readonly connectionString: string;
  readonly role: string;
  readonly target: string;
};

export type DatabaseDeploymentConfig = {
  readonly migrationDatabaseUrl: string;
  readonly migrationRole: string;
  readonly prismaMigrationDatabaseUrl: string;
  readonly runtimeDatabaseUrl: string;
  readonly runtimeRole: string;
};

export class DatabaseDeploymentConfigError extends Error {
  readonly name = "DatabaseDeploymentConfigError";

  constructor(readonly code: DatabaseDeploymentConfigErrorCode) {
    super(configErrorMessages[code]);
  }
}

function parseDatabaseUrl(
  input: string | undefined,
  kind: "migration" | "runtime"
): ParsedDatabaseUrl {
  const missingCode = kind === "migration" ? "missing_migration_url" : "missing_runtime_url";
  const invalidUrlCode = kind === "migration" ? "invalid_migration_url" : "invalid_runtime_url";
  const invalidRoleCode =
    kind === "migration" ? "invalid_migration_role" : "invalid_runtime_role";
  if (!input) {
    throw new DatabaseDeploymentConfigError(missingCode);
  }

  const parsedInput = postgresqlUrlSchema.safeParse(input);
  if (!parsedInput.success) {
    throw new DatabaseDeploymentConfigError(invalidUrlCode);
  }

  const url = new URL(parsedInput.data);
  if (!['postgres:', 'postgresql:'].includes(url.protocol) || !url.hostname) {
    throw new DatabaseDeploymentConfigError(invalidUrlCode);
  }

  let role: string;
  let databaseName: string;
  try {
    role = decodeURIComponent(url.username);
    databaseName = decodeURIComponent(url.pathname.slice(1));
  } catch {
    throw new DatabaseDeploymentConfigError(invalidRoleCode);
  }

  if (!roleNameSchema.safeParse(role).success) {
    throw new DatabaseDeploymentConfigError(invalidRoleCode);
  }
  if (!databaseName) {
    throw new DatabaseDeploymentConfigError(invalidUrlCode);
  }

  return {
    connectionString: url.toString(),
    role,
    target: `${url.hostname.toLowerCase()}:${url.port || "5432"}/${databaseName}`
  };
}

export function parseDatabaseDeploymentConfig(
  environment: Readonly<Record<string, string | undefined>>
): DatabaseDeploymentConfig {
  const migration = parseDatabaseUrl(environment.MIGRATION_DATABASE_URL, "migration");
  const runtime = parseDatabaseUrl(environment.DATABASE_URL, "runtime");
  if (reservedDatabaseRoles.has(migration.role) || reservedDatabaseRoles.has(runtime.role)) {
    throw new DatabaseDeploymentConfigError("reserved_database_role");
  }
  if (migration.role === runtime.role) {
    throw new DatabaseDeploymentConfigError("shared_database_role");
  }
  if (migration.target !== runtime.target) {
    throw new DatabaseDeploymentConfigError("database_target_mismatch");
  }

  const prismaMigrationUrl = new URL(migration.connectionString);
  const existingOptions = prismaMigrationUrl.searchParams.get("options");
  const contractOption = `-c ${phase2DeploymentContract.setting}=${phase2DeploymentContract.value}`;
  prismaMigrationUrl.searchParams.set(
    "options",
    existingOptions ? `${existingOptions} ${contractOption}` : contractOption
  );

  return {
    migrationDatabaseUrl: migration.connectionString,
    migrationRole: migration.role,
    prismaMigrationDatabaseUrl: prismaMigrationUrl.toString(),
    runtimeDatabaseUrl: runtime.connectionString,
    runtimeRole: runtime.role
  };
}
