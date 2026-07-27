import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

const schemaPath = new URL("../prisma/schema.prisma", import.meta.url);
const migrationPath = new URL(
  "../prisma/migrations/20260718000000_literature_discovery_import_library/migration.sql",
  import.meta.url
);
const rollbackPath = new URL(
  "../prisma/migrations/20260718000000_literature_discovery_import_library/rollback.sql",
  import.meta.url
);
const packagePath = new URL("../package.json", import.meta.url);
const deploymentSourcePath = new URL("database-role-contract.ts", import.meta.url);

function block(source: string, kind: "enum" | "model", name: string): string {
  const match = source.match(new RegExp(`${kind} ${name} \\{([\\s\\S]*?)\\n\\}`));
  if (!match?.[1]) {
    throw new Error(`${kind} ${name} was not found`);
  }
  return match[1];
}

describe("Literature Phase 2 schema rules", () => {
  it("models every structured assertion variant relationally without JSON", async () => {
    // Given
    const schema = await readFile(schemaPath, "utf8");

    // When
    const assertion = block(schema, "model", "Assertion");
    const structuredModels = [
      "AssertionAuthor",
      "AssertionIdentifier",
      "AssertionOpenAccess",
      "AssertionPublisher"
    ].map((name) => block(schema, "model", name));

    // Then
    expect(assertion).toMatch(/structuredItemCount\s+Int\?/u);
    expect(assertion).toMatch(/valueFingerprint\s+String\?/u);
    expect(assertion).toContain("@@unique([id, literatureId])");
    expect(structuredModels.join("\n")).not.toMatch(/\bJson\b/u);
    expect(structuredModels).toEqual(
      expect.arrayContaining([
        expect.stringContaining("position"),
        expect.stringContaining("scheme"),
        expect.stringContaining("isOpenAccess"),
        expect.stringContaining("landingPageUrl")
      ])
    );
  });

  it("keeps assertion fingerprints non-unique", async () => {
    // Given
    const schema = await readFile(schemaPath, "utf8");
    const migration = await readFile(migrationPath, "utf8");

    // When
    const assertion = block(schema, "model", "Assertion");

    // Then
    expect(assertion).not.toMatch(/@@unique\([^\n]*valueFingerprint/u);
    expect(migration).not.toMatch(/CREATE UNIQUE INDEX[^;]*valueFingerprint/iu);
  });

  it("defines immutable scope-local identity claims and four partial unique indexes", async () => {
    // Given
    const schema = await readFile(schemaPath, "utf8");
    const migration = await readFile(migrationPath, "utf8");

    // When
    const identity = block(schema, "model", "LiteratureIdentity");
    const partialIdentityIndexes = migration.match(
      /CREATE UNIQUE INDEX "LiteratureIdentity_(?:personal|project)_(?:doi|provider)_key"/g
    );

    // Then
    expect(identity).toMatch(/ownerUserId\s+String\?/u);
    expect(identity).toMatch(/projectId\s+String\?/u);
    expect(identity).toMatch(/kind\s+LiteratureIdentityKind/u);
    expect(identity).toMatch(/providerKey\s+String\?/u);
    expect(identity).toMatch(/identityValue\s+String/u);
    expect(partialIdentityIndexes).toHaveLength(4);
    expect(migration).toContain('CREATE TRIGGER "LiteratureIdentity_scope_trigger"');
    expect(migration).toContain('CREATE TRIGGER "LiteratureIdentity_append_only_trigger"');
  });

  it("binds lifecycle cleanup to a memberless owner and explicit execute grants", async () => {
    // Given
    const migration = await readFile(migrationPath, "utf8");
    const deploymentSource = await readFile(deploymentSourcePath, "utf8");

    // When
    const normalized = migration.replace(/\s+/g, " ").trim();

    // Then
    expect(deploymentSource).toContain('CREATE ROLE "jixia_literature_cleanup_owner"');
    expect(deploymentSource).toContain('CREATE ROLE "jixia_literature_application"');
    expect(normalized).toContain("jixia_literature_cleanup_owner must remain memberless");
    expect(normalized).toContain('current_user = \'jixia_literature_cleanup_owner\'');
    expect(normalized).toContain('CREATE FUNCTION "delete_literature_aggregate"(target_literature_id TEXT)');
    expect(normalized).toContain("SECURITY DEFINER");
    expect(normalized).toContain("SET search_path = pg_catalog, public, pg_temp");
    expect(normalized).toContain(
      'REVOKE ALL ON FUNCTION "delete_literature_aggregate"(TEXT) FROM PUBLIC'
    );
    expect(normalized).toContain(
      'GRANT EXECUTE ON FUNCTION "delete_literature_aggregate"(TEXT) TO "jixia_literature_application"'
    );
    expect(normalized).not.toContain(
      'GRANT EXECUTE ON FUNCTION "delete_literature_aggregate"(TEXT) TO CURRENT_USER'
    );
    expect(normalized).not.toContain("current_setting('jixia.literature_lifecycle_cleanup'");
  });

  it("routes Phase 2 deployment through the privileged migration wrapper", async () => {
    // Given
    const packageJson = await readFile(packagePath, "utf8");
    const migration = await readFile(migrationPath, "utf8");

    // When
    const normalizedMigration = migration.replace(/\s+/g, " ").trim();

    // Then
    expect(packageJson).toContain('"db:deploy": "tsx src/database-deploy-cli.ts deploy"');
    expect(packageJson).toContain(
      '"db:deploy:verify": "tsx src/database-deploy-cli.ts verify"'
    );
    expect(normalizedMigration).toContain("jixia.phase2_deployment_contract");
    expect(normalizedMigration).not.toContain('CREATE ROLE "jixia_literature_cleanup_owner"');
    expect(normalizedMigration).not.toContain('ALTER ROLE "jixia_literature_cleanup_owner"');
  });

  it("defines the complete closed import operation state", async () => {
    // Given
    const schema = await readFile(schemaPath, "utf8");

    // When
    const operation = block(schema, "model", "ImportOperation");

    // Then
    for (const field of [
      "idempotencyKey",
      "requestFingerprint",
      "sourceProviderKey",
      "sourceRecordKey",
      "status",
      "attemptCount",
      "attemptStartedAt",
      "takeoverAfter",
      "finishedAttemptCount",
      "finishedAt",
      "literatureId",
      "warningCodes",
      "failureCode"
    ]) {
      expect(operation).toContain(field);
    }
    expect(operation).toContain("@@unique([createdByUserId, idempotencyKey])");
  });

  it("uses one atomic migration with deferred validation and ambiguity preflight", async () => {
    // Given
    const migration = await readFile(migrationPath, "utf8");

    // When
    const normalized = migration.replace(/\s+/g, " ").trim();

    // Then
    expect(normalized).toMatch(/^BEGIN;/u);
    expect(normalized).toMatch(/COMMIT;$/u);
    expect(normalized).toContain("DEFERRABLE INITIALLY DEFERRED");
    expect(normalized).toContain("ambiguous provider identity backfill");
    expect(normalized).toContain("ambiguous DOI identity backfill");
    expect(normalized).toContain('CONSTRAINT "Assertion_structured_value_check"');
    expect(normalized).toContain('CONSTRAINT "ImportOperation_state_shape_check"');
  });

  it("guards rollback and recreates the Phase 1 assertion enum without cascade", async () => {
    // Given
    const rollback = await readFile(rollbackPath, "utf8");

    // When
    const normalized = rollback.replace(/\s+/g, " ").trim();

    // Then
    expect(normalized).toMatch(/^BEGIN;/u);
    expect(normalized).toContain("refusing to roll back populated literature discovery state");
    expect(normalized).toContain('DROP FUNCTION "delete_literature_aggregate"(TEXT)');
    expect(normalized).toContain("CREATE TYPE \"AssertionKind\" AS ENUM ('title', 'abstract', 'publicationYear', 'doi')");
    expect(normalized).not.toMatch(/\bCASCADE\b/iu);
    expect(normalized).toMatch(/COMMIT;$/u);
  });
});
