import { readFile } from "node:fs/promises";

import { describe, expect, it } from "vitest";

const schemaPath = new URL("../prisma/schema.prisma", import.meta.url);
const migrationPath = new URL(
  "../prisma/migrations/00000000000000_mvp_init/migration.sql",
  import.meta.url
);
const modelProfileMigrationPath = new URL(
  "../prisma/migrations/20260701000000_ai_model_profiles/migration.sql",
  import.meta.url
);

async function readSchema(): Promise<string> {
  return readFile(schemaPath, "utf8");
}

async function readMigration(): Promise<string> {
  return readFile(migrationPath, "utf8");
}

async function readModelProfileMigration(): Promise<string> {
  return readFile(modelProfileMigrationPath, "utf8");
}

function block(source: string, kind: "enum" | "model", name: string): string {
  const match = source.match(new RegExp(`${kind} ${name} \\{([\\s\\S]*?)\\n\\}`));

  if (!match?.[1]) {
    throw new Error(`${kind} ${name} was not found`);
  }

  return match[1];
}

describe("Prisma MVP schema", () => {
  it("contains exactly the locked MVP models", async () => {
    const schema = await readSchema();
    const modelNames = Array.from(schema.matchAll(/^model\s+(\w+)\s+\{/gm), ([, name]) => name);

    expect(modelNames).toEqual([
      "User",
      "Space",
      "SpaceMember",
      "Project",
      "ProjectMember",
      "Session",
      "Invitation",
      "Document",
      "DocumentDraft",
      "DocumentRevision",
      "DocumentAttachment",
      "UploadIntent",
      "AIProviderConfig",
      "AIModelProfile",
      "AIConversation",
      "AIUsageAggregate",
      "AuditEvent"
    ]);
  });

  it("locks shared role, document, upload, attachment, and usage enums", async () => {
    const schema = await readSchema();

    expect(block(schema, "enum", "SpaceRole")).toContain("SpaceAdmin");
    expect(block(schema, "enum", "SpaceRole")).toContain("SpaceMember");
    expect(block(schema, "enum", "ProjectRole")).toContain("ProjectOwner");
    expect(block(schema, "enum", "ProjectRole")).toContain("ProjectEditor");
    expect(block(schema, "enum", "ProjectRole")).toContain("ProjectViewer");
    expect(block(schema, "enum", "DocumentType")).toContain("notebook");
    expect(block(schema, "enum", "DocumentType")).toContain("project");
    expect(block(schema, "enum", "DocumentStatus")).toContain("active");
    expect(block(schema, "enum", "DocumentStatus")).toContain("archived");
    expect(block(schema, "enum", "AttachmentBlockType")).toContain("image");
    expect(block(schema, "enum", "AttachmentBlockType")).toContain("file");
    expect(block(schema, "enum", "UploadIntentStatus")).toContain("pending");
    expect(block(schema, "enum", "UploadIntentStatus")).toContain("confirmed");
    expect(block(schema, "enum", "UploadIntentStatus")).toContain("failed");
    expect(block(schema, "enum", "UploadIntentStatus")).toContain("expired");
    expect(block(schema, "enum", "UploadIntentStatus")).toContain("cleaned");
    expect(block(schema, "enum", "UploadFailureReason")).toContain("object_missing");
    expect(block(schema, "enum", "UploadFailureReason")).toContain("permission_revoked");
    expect(block(schema, "enum", "AIUsageScope")).toContain("user");
    expect(block(schema, "enum", "AIUsageScope")).toContain("space");
  });

  it("represents the database document ownership check", async () => {
    const migration = await readMigration();

    expect(migration).toContain('CONSTRAINT "Document_type_owner_project_check"');
    expect(migration).toContain('"type" = \'notebook\'');
    expect(migration).toContain('"ownerUserId" IS NOT NULL');
    expect(migration).toContain('"projectId" IS NULL');
    expect(migration).toContain('"type" = \'project\'');
    expect(migration).toContain('"projectId" IS NOT NULL');
    expect(migration).toContain('"ownerUserId" IS NULL');
  });

  it("stores drafts and revisions as editor JSON snapshots", async () => {
    const schema = await readSchema();
    const draft = block(schema, "model", "DocumentDraft");
    const revision = block(schema, "model", "DocumentRevision");

    expect(draft).toContain("baseRevision Int");
    expect(draft).toContain("draftContent Json");
    expect(revision).toContain("contentSnapshot    Json");
    expect(`${draft}\n${revision}`).not.toMatch(/markdown|diff/i);
  });

  it("persists invitation token hashes without raw token or reset models", async () => {
    const schema = await readSchema();
    const invitation = block(schema, "model", "Invitation");

    expect(invitation).toContain("tokenHash");
    expect(invitation).not.toMatch(/\btoken\s+String|rawToken|plainToken|invitationToken/i);
    expect(schema).not.toMatch(/model\s+(PasswordReset|ResetPassword|PasswordResetToken)\s+\{/);
  });

  it("keeps upload persistence backend-owned and metadata-only", async () => {
    const schema = await readSchema();
    const intent = block(schema, "model", "UploadIntent");
    const attachment = block(schema, "model", "DocumentAttachment");
    const uploadPersistence = `${intent}\n${attachment}`;

    expect(uploadPersistence).toContain("storageKey");
    expect(uploadPersistence).toContain("checksum");
    expect(uploadPersistence).toContain("etag");
    expect(uploadPersistence).not.toMatch(
      /signedUrl|downloadUrl|uploadUrl|requiredHeaders|requestHeaders|credentials|accessKey|secretKey|fileContent|fileContents/i
    );
  });

  it("stores AI config safely and usage as aggregate rows only", async () => {
    const schema = await readSchema();
    const migration = await readMigration();
    const modelProfileMigration = await readModelProfileMigration();
    const config = block(schema, "model", "AIProviderConfig");
    const modelProfile = block(schema, "model", "AIModelProfile");
    const usage = block(schema, "model", "AIUsageAggregate");
    const modelNames = Array.from(schema.matchAll(/^model\s+(\w+)\s+\{/gm), ([, name]) => name);

    expect(config).toContain("encryptedApiKey");
    expect(config).toContain("keyPreview");
    expect(config).toContain("modelProfiles");
    expect(config).not.toMatch(/\bmodel\s+String|temperature\s+Float|maxTokens\s+Int/i);
    expect(config).not.toMatch(/\bapiKey\s+String|authHeader|requestHeader|credential/i);
    expect(modelProfile).toContain("providerConfigId");
    expect(modelProfile).toContain("model            String");
    expect(modelProfile).toContain("displayName");
    expect(modelProfile).toContain("temperature");
    expect(modelProfile).toContain("maxTokens");
    expect(modelProfile).toContain("enabled");
    expect(modelProfile).toContain("isDefault");
    expect(modelProfile).not.toMatch(/apiKey|encrypted|credential|authHeader|requestHeader/i);
    expect(migration).toContain('CREATE UNIQUE INDEX "AIProviderConfig_one_default_per_owner_key"');
    expect(migration).toContain('WHERE "isDefault" = true');
    expect(modelProfileMigration).toContain('CREATE TABLE "AIModelProfile"');
    expect(modelProfileMigration).toContain('INSERT INTO "AIModelProfile"');
    expect(modelProfileMigration).toContain('"AIProviderConfig" DROP COLUMN "model"');
    expect(modelProfileMigration).toContain('CREATE UNIQUE INDEX "AIModelProfile_one_default_per_provider_config_key"');
    expect(modelProfileMigration).toContain('WHERE "isDefault" = true');
    expect(usage).toContain("promptTokens");
    expect(usage).toContain("completionTokens");
    expect(usage).toContain("estimatedCostMicros");
    expect(usage).not.toMatch(/prompt\s+|response\s+|selectedContext|messages|headers|apiKey/i);
    expect(migration).toContain('CONSTRAINT "AIUsageAggregate_scope_owner_check"');
    expect(migration).toContain('"scope" = \'user\'');
    expect(migration).toContain('"userId" IS NOT NULL');
    expect(migration).toContain('"spaceId" IS NULL');
    expect(migration).toContain('"scope" = \'space\'');
    expect(migration).toContain('"spaceId" IS NOT NULL');
    expect(migration).toContain('"userId" IS NULL');
    expect(modelNames).not.toEqual(expect.arrayContaining(["AIUsageEvent", "AIUsageLog", "AICallLog"]));
  });

  it("keeps audit events metadata-only", async () => {
    const schema = await readSchema();
    const audit = block(schema, "model", "AuditEvent");

    expect(audit).toContain("metadata    Json");
    expect(audit).not.toMatch(/payload|content|body|prompt|response|signedUrl|token|headers|credentials|apiKey/i);
  });
});
