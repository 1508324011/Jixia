import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

const schemaPath = new URL("../prisma/schema.prisma", import.meta.url);
const migrationPath = new URL(
  "../prisma/migrations/20260717000000_literature_domain_foundation/migration.sql",
  import.meta.url
);
const rollbackPath = new URL(
  "../prisma/migrations/20260717000000_literature_domain_foundation/rollback.sql",
  import.meta.url
);

async function readSchema(): Promise<string> {
  return readFile(schemaPath, "utf8");
}

async function readMigration(): Promise<string> {
  return readFile(migrationPath, "utf8");
}

async function readRollback(): Promise<string> {
  return readFile(rollbackPath, "utf8");
}

function block(source: string, kind: "enum" | "model", name: string): string {
  const match = source.match(new RegExp(`${kind} ${name} \\{([\\s\\S]*?)\\n\\}`));

  if (!match?.[1]) {
    throw new Error(`${kind} ${name} was not found`);
  }

  return match[1];
}

describe("Literature Prisma schema", () => {
  it("defines closed assertion and relation kinds", async () => {
    // Given
    const schema = await readSchema();

    // When
    const assertionKind = block(schema, "enum", "AssertionKind");
    const relationKind = block(schema, "enum", "RelationKind");

    // Then
    expect(assertionKind.match(/^\s+\w+/gm)?.map((value) => value.trim())).toEqual([
      "title",
      "abstract",
      "publicationYear",
      "doi",
      "publicationDate",
      "venue",
      "publicationType",
      "authors",
      "identifiers",
      "openAccess",
      "publisher"
    ]);
    expect(relationKind.match(/^\s+\w+/gm)?.map((value) => value.trim())).toEqual(["cites"]);
  });

  it("defines the Literature ownership root and ordinal allocator", async () => {
    // Given
    const schema = await readSchema();

    // When
    const literature = block(schema, "model", "Literature");

    // Then
    expect(literature).toMatch(/ownerUserId\s+String\?/);
    expect(literature).toMatch(/projectId\s+String\?/);
    expect(literature).toMatch(/createdByUserId\s+String/);
    expect(literature).toMatch(/nextAssertionOrdinal\s+Int\s+@default\(1\)/);
    expect(literature).not.toMatch(/payload|content|body|providerData|metadata\s+Json/i);
  });

  it("enforces ownership, provenance, typed values, and append-only history in SQL", async () => {
    // Given
    const migration = await readMigration();

    // When
    const normalized = migration.replace(/\s+/g, " ");

    // Then
    expect(normalized).toContain('CONSTRAINT "Literature_owner_xor_check" CHECK');
    expect(normalized).toContain('CONSTRAINT "ImportOperation_owner_xor_check" CHECK');
    expect(normalized).toContain('CONSTRAINT "Assertion_typed_value_check" CHECK');
    expect(normalized).toContain('FOREIGN KEY ("providerRecordId", "literatureId")');
    expect(normalized).toContain('FOREIGN KEY ("sourceRevisionId", "literatureId")');
    expect(normalized).toContain('CREATE TRIGGER "RelationAssertion_same_scope_trigger"');
    expect(normalized).toContain('CREATE TRIGGER "CitationOccurrence_same_scope_trigger"');
    expect(normalized).toContain('CREATE TRIGGER "Document_scope_immutable_trigger"');
    expect(normalized).toContain('CREATE TRIGGER "Assertion_append_only_trigger"');
    expect(normalized).toContain('CREATE TRIGGER "RelationAssertion_append_only_trigger"');
  });

  it("persists citation occurrence creation timestamps", async () => {
    // Given
    const schema = await readSchema();
    const migration = await readMigration();

    // When
    const citationOccurrence = block(schema, "model", "CitationOccurrence");
    const normalizedMigration = migration.replace(/\s+/g, " ");

    // Then
    expect(citationOccurrence).toMatch(/createdAt\s+DateTime\s+@default\(now\(\)\)/);
    expect(normalizedMigration).toMatch(
      /CREATE TABLE "CitationOccurrence" \([^;]*"createdAt" TIMESTAMP\(3\) NOT NULL DEFAULT CURRENT_TIMESTAMP/
    );
  });

  it("matches the canonical DOI alphabet enforced by the API", async () => {
    // Given
    const migration = await readMigration();

    // When
    const canonicalDoiPattern =
      '"textValue" ~ \'^10\\.[0-9]{4,9}/[-._;()/:a-z0-9]+$\'';

    // Then
    expect(migration).toContain(canonicalDoiPattern);
  });

  it("provides a guarded explicit rollback without broad cascading drops", async () => {
    // Given
    const rollback = await readRollback();

    // When
    const normalized = rollback.replace(/\s+/g, " ");

    // Then
    expect(normalized).toContain("refusing to roll back non-empty literature foundation tables");
    expect(normalized).toContain('DROP TRIGGER IF EXISTS "Document_scope_immutable_trigger"');
    expect(normalized).toContain('DROP TABLE "CitationOccurrence"');
    expect(normalized).toContain('DROP TYPE "AssertionKind"');
    expect(normalized).not.toMatch(/DROP[\s\S]*CASCADE/i);
  });

  it("runs the rollback guard and destructive DDL under exclusive locks in one transaction", async () => {
    // Given
    const rollback = await readRollback();

    // When
    const normalized = rollback.replace(/\s+/g, " ").trim();
    const lockPosition = normalized.indexOf("LOCK TABLE");
    const guardPosition = normalized.indexOf("DO $$");
    const firstDropPosition = normalized.indexOf("DROP TRIGGER");

    // Then
    expect(normalized).toMatch(/^BEGIN;/);
    expect(normalized).toContain(
      'LOCK TABLE "CitationOccurrence", "NotebookProjection", "Evidence", "Annotation", "Excerpt", "RelationAssertion", "SourceRevision", "Assertion", "ProviderRecord", "ImportOperation", "Literature" IN ACCESS EXCLUSIVE MODE;'
    );
    expect(lockPosition).toBeGreaterThan(-1);
    expect(guardPosition).toBeGreaterThan(lockPosition);
    expect(firstDropPosition).toBeGreaterThan(guardPosition);
    expect(normalized).toMatch(/COMMIT;$/);
  });
});
