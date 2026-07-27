import { describe, expect, it } from "vitest";

import {
  DatabaseDeploymentConfigError,
  parseDatabaseDeploymentConfig
} from "./database-deployment-config.js";

const migrationDatabaseUrl =
  "postgresql://jixia_migrator:migration-secret@db.example.test:5432/jixia";
const runtimeDatabaseUrl =
  "postgresql://jixia_runtime:runtime-secret@db.example.test:5432/jixia";

function resolveError(environment: Readonly<Record<string, string | undefined>>): unknown {
  try {
    parseDatabaseDeploymentConfig(environment);
    return undefined;
  } catch (error) {
    return error;
  }
}

describe("Database deployment configuration", () => {
  it("parses distinct migration and runtime identities for one database target", () => {
    // Given
    const environment = {
      MIGRATION_DATABASE_URL: migrationDatabaseUrl,
      DATABASE_URL: runtimeDatabaseUrl
    } as const;

    // When
    const config = parseDatabaseDeploymentConfig(environment);

    // Then
    expect(config).toMatchObject({
      migrationDatabaseUrl,
      migrationRole: "jixia_migrator",
      runtimeDatabaseUrl,
      runtimeRole: "jixia_runtime"
    });
    expect(new URL(config.prismaMigrationDatabaseUrl).searchParams.get("options")).toContain(
      "jixia.phase2_deployment_contract=phase2-v1"
    );
  });

  it.each([
    ["MIGRATION_DATABASE_URL", { DATABASE_URL: runtimeDatabaseUrl }, "missing_migration_url"],
    ["DATABASE_URL", { MIGRATION_DATABASE_URL: migrationDatabaseUrl }, "missing_runtime_url"]
  ])("rejects an absent %s", (_name, environment, expectedCode) => {
    // Given / When
    const error = resolveError(environment);

    // Then
    expect(error).toBeInstanceOf(DatabaseDeploymentConfigError);
    expect(error).toMatchObject({ code: expectedCode });
  });

  it.each([
    [
      "migration protocol",
      { MIGRATION_DATABASE_URL: "https://db.example.test/jixia", DATABASE_URL: runtimeDatabaseUrl },
      "invalid_migration_url"
    ],
    [
      "runtime role",
      {
        MIGRATION_DATABASE_URL: migrationDatabaseUrl,
        DATABASE_URL: "postgresql://%00@db.example.test:5432/jixia"
      },
      "invalid_runtime_role"
    ]
  ])("rejects an invalid %s without exposing credentials", (_name, environment, expectedCode) => {
    // Given / When
    const error = resolveError(environment);

    // Then
    expect(error).toBeInstanceOf(DatabaseDeploymentConfigError);
    expect(error).toMatchObject({ code: expectedCode });
    expect(String(error)).not.toContain("migration-secret");
    expect(String(error)).not.toContain("runtime-secret");
  });

  it("rejects one role reused for migration and runtime", () => {
    // Given
    const environment = {
      MIGRATION_DATABASE_URL: migrationDatabaseUrl,
      DATABASE_URL: migrationDatabaseUrl
    } as const;

    // When
    const error = resolveError(environment);

    // Then
    expect(error).toMatchObject({ code: "shared_database_role" });
  });

  it.each([
    [
      "migration",
      "postgresql://jixia_literature_cleanup_owner@db.example.test:5432/jixia",
      runtimeDatabaseUrl
    ],
    [
      "runtime",
      migrationDatabaseUrl,
      "postgresql://jixia_literature_application@db.example.test:5432/jixia"
    ]
  ])("rejects a fixed capability role used as the %s identity", (_name, migrationUrl, runtimeUrl) => {
    // Given
    const environment = {
      MIGRATION_DATABASE_URL: migrationUrl,
      DATABASE_URL: runtimeUrl
    } as const;

    // When
    const error = resolveError(environment);

    // Then
    expect(error).toMatchObject({ code: "reserved_database_role" });
  });

  it("rejects migration and runtime URLs that target different databases", () => {
    // Given
    const environment = {
      MIGRATION_DATABASE_URL: migrationDatabaseUrl,
      DATABASE_URL: "postgresql://jixia_runtime@db.example.test:5432/other"
    } as const;

    // When
    const error = resolveError(environment);

    // Then
    expect(error).toMatchObject({ code: "database_target_mismatch" });
  });
});
