import { describe, expect, it } from "vitest";

import {
  requireDisposableDatabaseUrl,
  requireDisposableMigrationDatabaseUrl
} from "./postgres-integration-environment.js";

const enabledEnvironment = {
  JIXIA_RUN_POSTGRES_INTEGRATION: "1"
} as const;

describe("Postgres integration harness safety", () => {
  it("accepts a token-delimited disposable database with exact confirmation", () => {
    // Given
    const databaseUrl = "postgresql://user@127.0.0.1:5432/jixia_task25_integration";

    // When
    const resolved = requireDisposableDatabaseUrl({
      ...enabledEnvironment,
      DATABASE_URL: databaseUrl,
      JIXIA_DISPOSABLE_DATABASE: "jixia_task25_integration"
    });

    // Then
    expect(resolved).toBe(databaseUrl);
  });

  it.each(["jixia_latest", "contest", "production"])(
    "rejects an unsafe database name %s even when confirmation matches",
    (databaseName) => {
      // Given
      const databaseUrl = `postgresql://user@127.0.0.1:5432/${databaseName}`;

      // When
      const resolve = () =>
        requireDisposableDatabaseUrl({
          ...enabledEnvironment,
          DATABASE_URL: databaseUrl,
          JIXIA_DISPOSABLE_DATABASE: databaseName
        });

      // Then
      expect(resolve).toThrow("must contain a test or task25 name token");
    }
  );

  it("rejects a disposable database when the confirmation does not match", () => {
    // Given
    const databaseUrl = "postgresql://user@127.0.0.1:5432/jixia_task25_integration";

    // When
    const resolve = () =>
      requireDisposableDatabaseUrl({
        ...enabledEnvironment,
        DATABASE_URL: databaseUrl,
        JIXIA_DISPOSABLE_DATABASE: "jixia_task25_other"
      });

    // Then
    expect(resolve).toThrow("must exactly match the decoded database name");
  });

  it("accepts a migration URL with different credentials for the same disposable database", () => {
    // Given
    const runtimeUrl =
      "postgresql://runtime@127.0.0.1:5432/jixia_task25_integration?schema=public";
    const migrationUrl =
      "postgresql://migration@127.0.0.1:5432/jixia_task25_integration?schema=public";

    // When
    const resolved = requireDisposableMigrationDatabaseUrl({
      ...enabledEnvironment,
      DATABASE_URL: runtimeUrl,
      MIGRATION_DATABASE_URL: migrationUrl,
      JIXIA_DISPOSABLE_DATABASE: "jixia_task25_integration"
    });

    // Then
    expect(resolved).toBe(migrationUrl);
  });

  it.each([
    [
      "host",
      "postgresql://migration@database.internal:5432/jixia_task25_integration"
    ],
    ["port", "postgresql://migration@127.0.0.1:6432/jixia_task25_integration"],
    ["database", "postgresql://migration@127.0.0.1:5432/jixia_task25_other"]
  ])("rejects a migration URL targeting a different %s", (_target, migrationUrl) => {
    // Given
    const runtimeUrl = "postgresql://runtime@127.0.0.1:5432/jixia_task25_integration";

    // When
    const resolve = () =>
      requireDisposableMigrationDatabaseUrl({
        ...enabledEnvironment,
        DATABASE_URL: runtimeUrl,
        MIGRATION_DATABASE_URL: migrationUrl,
        JIXIA_DISPOSABLE_DATABASE: "jixia_task25_integration"
      });

    // Then
    expect(resolve).toThrow("must target the runtime disposable database");
  });

  it("rejects a missing migration URL", () => {
    // Given
    const runtimeUrl = "postgresql://runtime@127.0.0.1:5432/jixia_task25_integration";

    // When
    const resolve = () =>
      requireDisposableMigrationDatabaseUrl({
        ...enabledEnvironment,
        DATABASE_URL: runtimeUrl,
        JIXIA_DISPOSABLE_DATABASE: "jixia_task25_integration"
      });

    // Then
    expect(resolve).toThrow("require MIGRATION_DATABASE_URL");
  });
});
