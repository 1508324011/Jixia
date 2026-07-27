import { describe, expect, it } from "vitest";

import { requireLiteraturePostgresEnvironment } from "./literature.postgres-environment.js";

const enabledEnvironment = {
  JIXIA_RUN_POSTGRES_INTEGRATION: "1"
} as const;

describe("Literature PostgreSQL integration environment", () => {
  it("accepts an exactly confirmed disposable database", () => {
    // Given
    const databaseUrl = "postgresql://user@127.0.0.1:5432/jixia_task25_api";

    // When
    const resolved = requireLiteraturePostgresEnvironment({
      ...enabledEnvironment,
      DATABASE_URL: databaseUrl,
      JIXIA_DISPOSABLE_DATABASE: "jixia_task25_api"
    });

    // Then
    expect(resolved).toBe(databaseUrl);
  });

  it("rejects an integration run without exact database confirmation", () => {
    // Given
    const databaseUrl = "postgresql://user@127.0.0.1:5432/jixia_task25_api";

    // When
    const resolve = () =>
      requireLiteraturePostgresEnvironment({
        ...enabledEnvironment,
        DATABASE_URL: databaseUrl
      });

    // Then
    expect(resolve).toThrow("must exactly match the decoded database name");
  });

  it("rejects a non-disposable database even when confirmation matches", () => {
    // Given
    const databaseUrl = "postgresql://user@127.0.0.1:5432/production";

    // When
    const resolve = () =>
      requireLiteraturePostgresEnvironment({
        ...enabledEnvironment,
        DATABASE_URL: databaseUrl,
        JIXIA_DISPOSABLE_DATABASE: "production"
      });

    // Then
    expect(resolve).toThrow("must contain a test or task25 name token");
  });
});
