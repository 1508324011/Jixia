import { PrismaPg } from "@prisma/adapter-pg";

import { PrismaClient } from "./generated/prisma/client";

type PostgresIntegrationEnvironment = Readonly<Record<string, string | undefined>>;

function parseDatabaseUrl(rawDatabaseUrl: string): URL {
  const databaseUrl = new URL(rawDatabaseUrl);
  const databaseName = decodeURIComponent(databaseUrl.pathname.slice(1));
  if (!/(?:^|[_-])(?:test|task25)(?:[_-]|$)/iu.test(databaseName)) {
    throw new Error(
      "PostgreSQL integration database name must contain a test or task25 name token"
    );
  }
  return databaseUrl;
}

function databaseTarget(databaseUrl: URL): string {
  const protocol = databaseUrl.protocol === "postgres:" ? "postgresql:" : databaseUrl.protocol;
  const port = databaseUrl.port || "5432";
  const databaseName = decodeURIComponent(databaseUrl.pathname.slice(1));
  return `${protocol}//${databaseUrl.hostname}:${port}/${databaseName}`;
}

export function requireDisposableDatabaseUrl(
  environment: PostgresIntegrationEnvironment = process.env
): string {
  if (environment.JIXIA_RUN_POSTGRES_INTEGRATION !== "1") {
    throw new Error("PostgreSQL integration tests require JIXIA_RUN_POSTGRES_INTEGRATION=1");
  }

  const rawDatabaseUrl = environment.DATABASE_URL;
  if (!rawDatabaseUrl) {
    throw new Error("PostgreSQL integration tests require DATABASE_URL");
  }

  const databaseUrl = parseDatabaseUrl(rawDatabaseUrl);
  const databaseName = decodeURIComponent(databaseUrl.pathname.slice(1));
  if (environment.JIXIA_DISPOSABLE_DATABASE !== databaseName) {
    throw new Error(
      "JIXIA_DISPOSABLE_DATABASE must exactly match the decoded database name"
    );
  }

  return databaseUrl.toString();
}

export function requireDisposableMigrationDatabaseUrl(
  environment: PostgresIntegrationEnvironment = process.env
): string {
  const runtimeDatabaseUrl = new URL(requireDisposableDatabaseUrl(environment));
  const rawMigrationDatabaseUrl = environment.MIGRATION_DATABASE_URL;
  if (!rawMigrationDatabaseUrl) {
    throw new Error("PostgreSQL integration tests require MIGRATION_DATABASE_URL for fixture DDL");
  }

  const migrationDatabaseUrl = parseDatabaseUrl(rawMigrationDatabaseUrl);
  if (databaseTarget(migrationDatabaseUrl) !== databaseTarget(runtimeDatabaseUrl)) {
    throw new Error("MIGRATION_DATABASE_URL must target the runtime disposable database");
  }

  return migrationDatabaseUrl.toString();
}

export function createPostgresIntegrationMigrationClient(
  environment: PostgresIntegrationEnvironment = process.env
): PrismaClient {
  const connectionString = requireDisposableMigrationDatabaseUrl(environment);
  return new PrismaClient({
    adapter: new PrismaPg({ connectionString })
  });
}
