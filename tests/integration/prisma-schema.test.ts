import { existsSync, mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { describe, expect, it } from 'vitest';

import {
  createPrismaClient,
  initializeAiResultArtifactPersistence,
  initializeAiChatPersistence,
  initializeAuditPersistence,
  initializeJobPersistence,
  initializeNotebookPersistence,
  initializeProjectDocPersistence,
  initializeReadingPersistence,
  type JixiaPrismaClient,
} from '../../src/db';

interface SqliteForeignKeyRow {
  from: string;
  on_delete: string;
  on_update: string;
  table: string;
  to: string;
}

interface SqliteTableColumnRow {
  name: string;
}

interface SqliteTableSqlRow {
  sql: string | null;
}

async function foreignKeyList(
  prisma: JixiaPrismaClient,
  tableName: string,
): Promise<SqliteForeignKeyRow[]> {
  return prisma.$queryRawUnsafe<SqliteForeignKeyRow[]>(
    `PRAGMA foreign_key_list("${tableName}")`,
  );
}

function expectReaderExcerptForeignKey(foreignKeys: SqliteForeignKeyRow[]): void {
  expect(foreignKeys).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        from: 'readerExcerptId',
        on_delete: 'SET NULL',
        on_update: 'CASCADE',
        table: 'ReaderExcerpt',
        to: 'id',
      }),
    ]),
  );
}

function expectAuditLogJobForeignKey(foreignKeys: SqliteForeignKeyRow[]): void {
  expect(foreignKeys).toEqual(
    expect.arrayContaining([
      expect.objectContaining({
        from: 'jobId',
        on_delete: 'SET NULL',
        on_update: 'CASCADE',
        table: 'Job',
        to: 'id',
      }),
    ]),
  );
}

async function readColumnNames(
  prisma: JixiaPrismaClient,
  tableName: string,
): Promise<string[]> {
  const columns = await prisma.$queryRawUnsafe<SqliteTableColumnRow[]>(
    `PRAGMA table_info("${tableName}")`,
  );

  return columns.map((column) => column.name);
}

async function readCreateTableSql(
  prisma: JixiaPrismaClient,
  tableName: string,
): Promise<string> {
  const rows = await prisma.$queryRawUnsafe<SqliteTableSqlRow[]>(
    `SELECT sql FROM sqlite_master WHERE type = 'table' AND name = '${tableName}'`,
  );

  return rows[0]?.sql ?? '';
}

function expectReaderAnnotationPrivacyConstraints(createTableSql: string): void {
  expect(createTableSql).toContain('ReaderAnnotation_project_visibility_check');
  expect(createTableSql).toContain('ReaderAnnotation_project_note_check');
}

async function seedReaderAnnotationFixture(
  prisma: JixiaPrismaClient,
  suffix: string,
): Promise<{
  paperAssetId: string;
  personalLibraryEntryId: string;
  projectId: string;
  projectLibraryEntryId: string;
  userId: string;
}> {
  const userId = `user-reader-annotation-${suffix}`;
  const spaceId = `space-reader-annotation-${suffix}`;
  const projectId = `project-reader-annotation-${suffix}`;
  const paperAssetId = `paper-reader-annotation-${suffix}`;
  const personalLibraryEntryId = `library-personal-reader-annotation-${suffix}`;
  const projectLibraryEntryId = `library-project-reader-annotation-${suffix}`;

  await prisma.user.create({
    data: {
      displayName: `Reader Annotation ${suffix}`,
      email: `reader-annotation-${suffix}@example.test`,
      id: userId,
    },
  });
  await prisma.space.create({
    data: {
      id: spaceId,
      kind: 'shared',
      name: `Reader Annotation ${suffix}`,
    },
  });
  await prisma.project.create({
    data: {
      createdByUserId: userId,
      id: projectId,
      name: `Reader Annotation ${suffix}`,
      spaceId,
    },
  });
  await prisma.paperAsset.create({
    data: {
      canonicalId: `doi:10.1000/reader-annotation-${suffix}`,
      id: paperAssetId,
      importedByUserId: userId,
      sourceLocator: `10.1000/reader-annotation-${suffix}`,
      sourceType: 'doi',
      title: `Reader Annotation ${suffix}`,
    },
  });
  await prisma.libraryEntry.create({
    data: {
      addedByUserId: userId,
      id: personalLibraryEntryId,
      paperAssetId,
      scopeId: userId,
      scopeType: 'user',
    },
  });
  await prisma.libraryEntry.create({
    data: {
      addedByUserId: userId,
      id: projectLibraryEntryId,
      paperAssetId,
      scopeId: projectId,
      scopeType: 'project',
    },
  });

  return {
    paperAssetId,
    personalLibraryEntryId,
    projectId,
    projectLibraryEntryId,
    userId,
  };
}

describe('prisma schema', () => {
  it('declares core bounded-context models', () => {
    const schema = readFileSync('prisma/schema.prisma', 'utf8');

    expect(schema).toContain('model User');
    expect(schema).toContain('model Space');
    expect(schema).toContain('model Membership');
    expect(schema).toContain('model Project');
    expect(schema).toContain('model ProjectMember');
    expect(schema).toContain('model PaperAsset');
    expect(schema).toContain('model LibraryEntry');
    expect(schema).toContain('model Note');
    expect(schema).toContain('model ProjectReadingComment');
    expect(schema).toContain('model ReadingState');
    expect(schema).toContain('model ReaderExcerpt');
    expect(schema).toContain('model Conversation');
    expect(schema).toContain('model NotebookDocument');
    expect(schema).toContain('model NotebookDocumentVersion');
    expect(schema).toContain('model NotebookDocumentCitation');
    expect(schema).toContain('model ProjectDoc');
    expect(schema).toContain('model ProjectDocVersion');
    expect(schema).toContain('model ProjectDocCitation');
    expect(schema).toContain('model ProviderCredential');
    expect(schema).toContain('model ProviderCredentialSecret');
    expect(schema).toContain('model WorkbenchSettings');
    expect(schema).toContain('model Job');
    expect(schema).toContain('model JobEvent');
    expect(schema).toContain('model AuditLog');
    expect(schema).toContain('model AiSession');
    expect(schema).toContain('model AiContextPack');
    expect(schema).toContain('model AiContextItem');
    expect(schema).toContain('model AiResultArtifact');
    expect(schema).toContain('model SourceTextArtifact');
    expect(schema).toContain('model ReaderAnnotation');
    expect(schema).toContain('model ReaderNotebookBinding');
    expect(schema).toContain('model NotebookSourceLink');
    expect(schema).toContain('model AiChatSession');
    expect(schema).toContain('model AiChatMessage');
    expect(schema).toContain('model AiChatRequest');
    expect(schema).toContain('model AiChatRequestContextRef');
    expect(schema).toContain('enum ReferenceLifecycleStatus');
    expect(schema).toContain('enum SourceTextAvailabilityState');
    expect(schema).toContain('enum ReaderAnnotationVisibility');

    expect(schema).toMatch(/model Space[\s\S]*\n\s+kind\s+SpaceKind/);
    expect(schema).toMatch(/model Project[\s\S]*\n\s+spaceId\s+String/);
    expect(schema).toMatch(/model LibraryEntry[\s\S]*\n\s+scopeType\s+String/);
    expect(schema).toMatch(/model LibraryEntry[\s\S]*\n\s+scopeId\s+String/);
    expect(schema).toMatch(
      /model LibraryEntry[\s\S]*@@unique\(\[scopeType, scopeId, paperAssetId\]/,
    );
    expect(schema).toMatch(
      /model LibraryEntry[\s\S]*\n\s+lifecycleStatus\s+ReferenceLifecycleStatus\s+@default\(active\)/,
    );
    expect(schema).toMatch(
      /model LibraryEntry[\s\S]*@@index\(\[scopeType, scopeId, lifecycleStatus\]\)/,
    );
    expect(schema).toMatch(/model PaperAsset[\s\S]*\n\s+canonicalId\s+String\s+@unique/);
    expect(schema).toMatch(/model PaperAsset[\s\S]*\n\s+checksum\s+String\?\s+@unique/);
    expect(schema).toMatch(
      /model PaperAsset[\s\S]*\n\s+sourceTextArtifacts\s+SourceTextArtifact\[\]/,
    );
    expect(
      existsSync('prisma/migrations/20260519000000_paper_asset_checksum_index/migration.sql'),
    ).toBe(true);
    expect(
      readFileSync(
        'prisma/migrations/20260519000000_paper_asset_checksum_index/migration.sql',
        'utf8',
      ),
    ).toContain('PaperAsset_checksum_key');
    expect(schema).toMatch(
      /model ProjectMember[\s\S]*@@unique\(\[projectId, userId\]\)/,
    );
    expect(schema).toMatch(
      /model Membership[\s\S]*@@unique\(\[spaceId, userId\]\)/,
    );
    expect(schema).toMatch(/model Note[\s\S]*\n\s+libraryEntryId\s+String/);
    expect(schema).toMatch(/model Note[\s\S]*@@index\(\[libraryEntryId, authorUserId\]\)/);
    expect(schema).toMatch(/model ProjectReadingComment[\s\S]*\n\s+projectId\s+String/);
    expect(schema).toMatch(
      /model ProjectReadingComment[\s\S]*@@index\(\[libraryEntryId, projectId\]\)/,
    );
    expect(schema).toMatch(
      /model ProjectReadingComment[\s\S]*\n\s+libraryEntryId\s+String/,
    );
    expect(schema).toMatch(
      /model ProjectReadingComment[\s\S]*\n\s+projectId\s+String/,
    );
    expect(schema).toMatch(
      /model ProjectReadingComment[\s\S]*@@index\(\[libraryEntryId, projectId\]\)/,
    );
    expect(schema).toMatch(
      /model Conversation[\s\S]*\n\s+libraryEntryId\s+String/,
    );
    expect(schema).toMatch(
      /model ReaderExcerpt[\s\S]*\n\s+libraryEntryId\s+String/,
    );
    expect(schema).toMatch(
      /model ReaderExcerpt[\s\S]*\n\s+paperAssetId\s+String/,
    );
    expect(schema).toMatch(
      /model ReaderExcerpt[\s\S]*\n\s+createdByUserId\s+String/,
    );
    expect(schema).toMatch(/model ReaderExcerpt[\s\S]*\n\s+quote\s+String/);
    expect(schema).toMatch(/model ReaderExcerpt[\s\S]*\n\s+startOffset\s+Int/);
    expect(schema).toMatch(/model ReaderExcerpt[\s\S]*\n\s+endOffset\s+Int/);
    expect(schema).toMatch(/model ReaderExcerpt[\s\S]*\n\s+locator\s+String\?/);
    expect(schema).toMatch(/model ReaderExcerpt[\s\S]*\n\s+note\s+String\?/);
    expect(schema).toMatch(
      /model ReaderExcerpt[\s\S]*@@index\(\[libraryEntryId, createdAt\]\)/,
    );
    expect(schema).toMatch(
      /model ReaderExcerpt[\s\S]*@@index\(\[paperAssetId\]\)/,
    );
    expect(schema).toMatch(
      /model ReaderExcerpt[\s\S]*@@index\(\[createdByUserId\]\)/,
    );
    const readerExcerptModel = schema.slice(
      schema.indexOf('model ReaderExcerpt'),
      schema.indexOf('model Conversation'),
    );
    expect(readerExcerptModel).not.toContain('visibility');
    expect(readerExcerptModel).not.toContain('spaceId');
    expect(readerExcerptModel).not.toContain('projectId');
    expect(readerExcerptModel).not.toContain('scopeType');
    expect(readerExcerptModel).not.toContain('scopeId');
    expect(schema).toMatch(/model SourceTextArtifact[\s\S]*\n\s+paperAssetId\s+String/);
    expect(schema).toMatch(
      /model SourceTextArtifact[\s\S]*\n\s+availabilityState\s+SourceTextAvailabilityState/,
    );
    expect(schema).toMatch(
      /model SourceTextArtifact[\s\S]*\n\s+artifactRef\s+String\?/,
    );
    expect(schema).toMatch(
      /model SourceTextArtifact[\s\S]*@@index\(\[paperAssetId, kind\]\)/,
    );
    expect(schema).toMatch(
      /model SourceTextArtifact[\s\S]*@@index\(\[availabilityState, updatedAt\]\)/,
    );
    expect(schema).toMatch(/model ReaderAnnotation[\s\S]*\n\s+libraryEntryId\s+String/);
    expect(schema).toMatch(/model ReaderAnnotation[\s\S]*\n\s+paperAssetId\s+String/);
    expect(schema).toMatch(
      /model ReaderAnnotation[\s\S]*\n\s+sourceContextType\s+String/,
    );
    expect(schema).toMatch(
      /model ReaderAnnotation[\s\S]*\n\s+visibility\s+ReaderAnnotationVisibility\s+@default\(private\)/,
    );
    expect(schema).toMatch(
      /model ReaderAnnotation[\s\S]*\n\s+originalAnnotationId\s+String\?/,
    );
    expect(schema).toMatch(/model ReaderAnnotation[\s\S]*\n\s+selectorJson\s+String/);
    expect(schema).toMatch(/model ReaderAnnotation[\s\S]*\n\s+locatorJson\s+String\?/);
    expect(schema).toMatch(
      /model ReaderAnnotation[\s\S]*\n\s+lifecycleStatus\s+ReferenceLifecycleStatus\s+@default\(active\)/,
    );
    expect(schema).toMatch(
      /model ReaderAnnotation[\s\S]*@@index\(\[sourceContextType, sourceContextId, createdByUserId\]\)/,
    );
    expect(schema).toMatch(
      /model ReaderAnnotation[\s\S]*@@index\(\[projectId, visibility, createdAt\]\)/,
    );
    expect(schema).toContain('Runtime SQLite CHECK constraints enforce');
    const coreDomainMigration = readFileSync(
      'prisma/migrations/20260608000000_core_domain_contracts/migration.sql',
      'utf8',
    );
    expect(coreDomainMigration).toContain('ReaderAnnotation_project_visibility_check');
    expect(coreDomainMigration).toContain('ReaderAnnotation_project_note_check');
    expect(coreDomainMigration).toContain('ReaderAnnotation__core_domain_privacy_rebuild');
    expect(schema).toMatch(/model NotebookDocument[\s\S]*\n\s+ownerId\s+String/);
    expect(schema).toMatch(
      /model ReaderNotebookBinding[\s\S]*\n\s+sourceContextType\s+String/,
    );
    expect(schema).toMatch(
      /model ReaderNotebookBinding[\s\S]*\n\s+notebookDocumentId\s+String/,
    );
    expect(schema).toMatch(
      /model ReaderNotebookBinding[\s\S]*@@unique\(\[userId, sourceContextType, sourceContextId\], name: "ReaderNotebookBinding_user_source_unique"\)/,
    );
    expect(schema).toMatch(
      /model NotebookDocumentVersion[\s\S]*@@unique\(\[notebookDocumentId, versionNumber\]\)/,
    );
    expect(schema).toMatch(/model NotebookSourceLink[\s\S]*\n\s+sourceType\s+String/);
    expect(schema).toMatch(/model NotebookSourceLink[\s\S]*\n\s+sourceId\s+String/);
    expect(schema).toMatch(
      /model NotebookSourceLink[\s\S]*\n\s+readerAnnotationId\s+String\?/,
    );
    expect(schema).toMatch(
      /model NotebookSourceLink[\s\S]*\n\s+sourceTextArtifactId\s+String\?/,
    );
    expect(schema).toMatch(
      /model NotebookSourceLink[\s\S]*@@index\(\[notebookDocumentVersionId, sourceType\]\)/,
    );
    expect(schema).toMatch(
      /model NotebookDocumentCitation[\s\S]*\n\s+notebookDocumentVersionId\s+String/,
    );
    expect(schema).toMatch(
      /model NotebookDocumentCitation[\s\S]*\n\s+readerExcerptId\s+String\?/,
    );
    expect(schema).toMatch(
      /model NotebookDocumentCitation[\s\S]*@@index\(\[readerExcerptId\]\)/,
    );
    expect(schema).toMatch(/model ProjectDoc[\s\S]*\n\s+projectId\s+String/);
    expect(schema).toMatch(
      /model ProjectDoc[\s\S]*\n\s+publishState\s+PublishState/,
    );
    expect(schema).toMatch(
      /model ProjectDocVersion[\s\S]*@@unique\(\[projectDocId, versionNumber\]\)/,
    );
    expect(schema).toMatch(
      /model ProjectDocCitation[\s\S]*\n\s+projectDocVersionId\s+String/,
    );
    expect(schema).toMatch(
      /model ProjectDocCitation[\s\S]*\n\s+readerExcerptId\s+String\?/,
    );
    expect(schema).toMatch(
      /model ProjectDocCitation[\s\S]*\n\s+targetLibraryEntryId\s+String\?/,
    );
    expect(schema).toMatch(
      /model ProjectDocCitation[\s\S]*\n\s+occurrenceKey\s+String\?/,
    );
    expect(schema).toMatch(/model ProjectDocCitation[\s\S]*\n\s+locatorJson\s+String\?/);
    expect(schema).toMatch(
      /model ProjectDocCitation[\s\S]*\n\s+readerAnnotationId\s+String\?/,
    );
    expect(schema).toMatch(
      /model ProjectDocCitation[\s\S]*\n\s+sourceTextArtifactId\s+String\?/,
    );
    expect(schema).toMatch(
      /model ProjectDocCitation[\s\S]*\n\s+lifecycleStatus\s+ReferenceLifecycleStatus\s+@default\(active\)/,
    );
    expect(schema).toMatch(
      /model ProjectDocCitation[\s\S]*@@index\(\[readerExcerptId\]\)/,
    );
    expect(schema).toMatch(
      /model ProjectDocCitation[\s\S]*@@index\(\[targetLibraryEntryId, lifecycleStatus\]\)/,
    );
    expect(schema).toMatch(
      /model ProjectDocCitation[\s\S]*@@index\(\[projectDocVersionId, occurrenceKey\]\)/,
    );
    expect(
      existsSync(
        'prisma/migrations/20260520000000_reader_excerpts_evidence_anchors/migration.sql',
      ),
    ).toBe(true);
    const readerExcerptMigration = readFileSync(
      'prisma/migrations/20260520000000_reader_excerpts_evidence_anchors/migration.sql',
      'utf8',
    );
    expect(readerExcerptMigration).toContain(
      'CONSTRAINT "NotebookDocumentCitation_readerExcerptId_fkey" FOREIGN KEY ("readerExcerptId") REFERENCES "ReaderExcerpt" ("id") ON DELETE SET NULL ON UPDATE CASCADE',
    );
    expect(readerExcerptMigration).toContain(
      'CONSTRAINT "ProjectDocCitation_readerExcerptId_fkey" FOREIGN KEY ("readerExcerptId") REFERENCES "ReaderExcerpt" ("id") ON DELETE SET NULL ON UPDATE CASCADE',
    );
    expect(schema).toMatch(/model Job[\s\S]*\n\s+credentialRef\s+String/);
    expect(schema).toMatch(
      /model ProviderCredential[\s\S]*@@index\(\[userId, provider\]\)/,
    );
    expect(schema).not.toMatch(
      /model ProviderCredential[\s\S]*@@unique\(\[userId, provider\]\)/,
    );
    expect(schema).toMatch(
      /model ProviderCredentialSecret[\s\S]*\n\s+credentialRef\s+String\s+@id/,
    );
    expect(schema).toMatch(
      /model ProviderCredentialSecret[\s\S]*\n\s+encryptedSecret\s+String/,
    );
    expect(schema).toMatch(
      /model ProviderCredentialSecret[\s\S]*\n\s+credential\s+ProviderCredential\s+@relation\(fields: \[credentialRef\], references: \[id\], onDelete: Cascade\)/,
    );
    expect(schema).toMatch(
      /model WorkbenchSettings[\s\S]*\n\s+userId\s+String\s+@id/,
    );
    expect(schema).toMatch(
      /model WorkbenchSettings[\s\S]*\n\s+credentialRef\s+String\?/,
    );
    expect(schema).toMatch(
      /model WorkbenchSettings[\s\S]*\n\s+defaultImportTarget\s+String/,
    );
    expect(schema).toMatch(
      /model Job[\s\S]*@@index\(\[spaceId, requestedByUserId\]\)/,
    );
    expect(schema).toMatch(
      /model Job[\s\S]*@@index\(\[scopeType, scopeId\]\)/,
    );
    expect(schema).toMatch(/model JobEvent[\s\S]*@@index\(\[jobId\]\)/);
    expect(schema).toMatch(/model AuditLog[\s\S]*@@index\(\[jobId\]\)/);
    expect(schema).toMatch(/model AuditLog[\s\S]*\n\s+scopeType\s+String/);
    expect(schema).toMatch(/model AuditLog[\s\S]*\n\s+scopeId\s+String/);
    expect(schema).toMatch(/model AuditLog[\s\S]*\n\s+objectType\s+String/);
    expect(schema).toMatch(/model AuditLog[\s\S]*\n\s+objectId\s+String/);
    expect(schema).toMatch(/model AuditLog[\s\S]*\n\s+projectId\s+String\?/);
    expect(schema).toMatch(/model AuditLog[\s\S]*\n\s+metadataJson\s+String\?/);
    expect(schema).toMatch(
      /model AuditLog[\s\S]*@@index\(\[scopeType, scopeId, recordedAt\]\)/,
    );
    expect(schema).toMatch(
      /model AuditLog[\s\S]*@@index\(\[objectType, objectId, recordedAt\]\)/,
    );
    expect(schema).toMatch(
      /model AuditLog[\s\S]*@@index\(\[projectId, recordedAt\]\)/,
    );
    expect(schema).toMatch(
      /model AuditLog[\s\S]*@@index\(\[projectId, objectType, objectId, recordedAt\]\)/,
    );
    expect(
      existsSync('prisma/migrations/20260606000000_governance_audit_records/migration.sql'),
    ).toBe(true);
    const auditMigration = readFileSync(
      'prisma/migrations/20260606000000_governance_audit_records/migration.sql',
      'utf8',
    );
    expect(auditMigration).toContain('ALTER TABLE "AuditLog" ADD COLUMN "scopeType"');
    expect(auditMigration).toContain('ALTER TABLE "AuditLog" ADD COLUMN "objectType"');
    expect(auditMigration).toContain('AuditLog_projectId_objectType_objectId_recordedAt_idx');
    expect(schema).toMatch(/model AiSession[\s\S]*\n\s+scopeType\s+String/);
    expect(schema).toMatch(/model AiSession[\s\S]*\n\s+scopeId\s+String/);
    expect(schema).toMatch(/model AiSession[\s\S]*\n\s+createdByUserId\s+String/);
    expect(schema).toMatch(
      /model AiSession[\s\S]*@@index\(\[scopeType, scopeId, createdAt\]\)/,
    );
    expect(schema).toMatch(/model AiContextPack[\s\S]*\n\s+sessionId\s+String/);
    expect(schema).toMatch(
      /model AiContextPack[\s\S]*@@index\(\[sessionId, createdAt\]\)/,
    );
    expect(schema).toMatch(/model AiContextItem[\s\S]*\n\s+sourceType\s+String/);
    expect(schema).toMatch(/model AiContextItem[\s\S]*\n\s+sourceId\s+String/);
    expect(schema).toMatch(/model AiContextItem[\s\S]*\n\s+sourceVersionId\s+String\?/);
    expect(schema).toMatch(/model AiContextItem[\s\S]*\n\s+sourceDocumentId\s+String\?/);
    expect(schema).toMatch(/model AiContextItem[\s\S]*\n\s+sourceLibraryEntryId\s+String\?/);
    expect(schema).toMatch(
      /model AiContextItem[\s\S]*@@index\(\[sourceType, sourceId\]\)/,
    );
    expect(
      existsSync('prisma/migrations/20260605000000_ai_workspace_context_packs/migration.sql'),
    ).toBe(true);
    const aiWorkspaceMigration = readFileSync(
      'prisma/migrations/20260605000000_ai_workspace_context_packs/migration.sql',
      'utf8',
    );
    expect(aiWorkspaceMigration).toContain('CREATE TABLE IF NOT EXISTS "AiSession"');
    expect(aiWorkspaceMigration).toContain('CREATE TABLE IF NOT EXISTS "AiContextPack"');
    expect(aiWorkspaceMigration).toContain('CREATE TABLE IF NOT EXISTS "AiContextItem"');
    expect(aiWorkspaceMigration).toContain('"sourceType" TEXT NOT NULL');
    expect(aiWorkspaceMigration).toContain('"sourceId" TEXT NOT NULL');
    expect(aiWorkspaceMigration).toContain('AiContextItem_sourceType_sourceId_idx');
    expect(schema).toMatch(/model AiResultArtifact[\s\S]*\n\s+jobId\s+String/);
    expect(schema).toMatch(/model AiResultArtifact[\s\S]*\n\s+scopeType\s+String/);
    expect(schema).toMatch(/model AiResultArtifact[\s\S]*\n\s+scopeId\s+String/);
    expect(schema).toMatch(/model AiResultArtifact[\s\S]*\n\s+documentContent\s+String\?/);
    expect(schema).toMatch(/model AiResultArtifact[\s\S]*\n\s+provenanceJson\s+String/);
    expect(schema).toMatch(/model AiResultArtifact[\s\S]*\n\s+appliedTargetJson\s+String\?/);
    expect(schema).toMatch(/model AiResultArtifact[\s\S]*@@index\(\[scopeType, scopeId, createdAt\]\)/);
    const aiResultsMigration = readFileSync(
      'prisma/migrations/20260606010000_ai_result_artifacts/migration.sql',
      'utf8',
    );
    expect(aiResultsMigration).toContain('CREATE TABLE IF NOT EXISTS "AiResultArtifact"');
    expect(aiResultsMigration).toContain('"provenanceJson" TEXT NOT NULL');
    expect(aiResultsMigration).toContain('"appliedTargetJson" TEXT');
    expect(aiResultsMigration).toContain('AiResultArtifact_scopeType_scopeId_createdAt_idx');
    expect(schema).toMatch(/model AiChatSession[\s\S]*\n\s+ownerUserId\s+String/);
    expect(schema).toMatch(
      /model AiChatSession[\s\S]*\n\s+sourceContextType\s+String\?/,
    );
    expect(schema).toMatch(
      /model AiChatSession[\s\S]*\n\s+lifecycleStatus\s+ReferenceLifecycleStatus\s+@default\(active\)/,
    );
    expect(schema).toMatch(
      /model AiChatSession[\s\S]*@@index\(\[ownerUserId, updatedAt\]\)/,
    );
    expect(schema).toMatch(/model AiChatMessage[\s\S]*\n\s+role\s+AiChatMessageRole/);
    expect(schema).toMatch(/model AiChatMessage[\s\S]*\n\s+safeMetadataJson\s+String\?/);
    expect(schema).toMatch(/model AiChatRequest[\s\S]*\n\s+promptBuildVersion\s+String/);
    expect(schema).toMatch(
      /model AiChatRequest[\s\S]*\n\s+contextTokenEstimate\s+Int\?/,
    );
    expect(schema).toMatch(/model AiChatRequest[\s\S]*\n\s+overBudgetDecision\s+String\?/);
    expect(schema).toMatch(
      /model AiChatRequestContextRef[\s\S]*\n\s+sourceType\s+String/,
    );
    expect(schema).toMatch(
      /model AiChatRequestContextRef[\s\S]*\n\s+rangeStartOffset\s+Int\?/,
    );
    expect(schema).toMatch(
      /model AiChatRequestContextRef[\s\S]*\n\s+locatorJson\s+String\?/,
    );
    expect(schema).toMatch(
      /model AiChatRequestContextRef[\s\S]*\n\s+chipLabel\s+String/,
    );
    expect(schema).toMatch(
      /model AiChatRequestContextRef[\s\S]*@@index\(\[requestId, sourceType\]\)/,
    );
  });

  it('initializes AI result artifact persistence with job and user foreign keys', async () => {
    const tempRoot = mkdtempSync(join(tmpdir(), 'jixia-ai-results-schema-'));
    const prisma = createPrismaClient({
      url: `file:${join(tempRoot, 'ai-results-schema.db')}`,
    });

    try {
      await initializeAiResultArtifactPersistence(prisma);
      const columns = await prisma.$queryRawUnsafe<SqliteTableColumnRow[]>(
        'PRAGMA table_info("AiResultArtifact")',
      );
      const columnNames = columns.map((column) => column.name);
      const foreignKeys = await foreignKeyList(prisma, 'AiResultArtifact');

      expect(columnNames).toEqual(
        expect.arrayContaining([
          'id',
          'jobId',
          'kind',
          'scopeType',
          'scopeId',
          'createdByUserId',
          'status',
          'documentContent',
          'provenanceJson',
          'appliedTargetJson',
          'appliedAt',
        ]),
      );
      expect(foreignKeys).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            from: 'jobId',
            on_delete: 'CASCADE',
            on_update: 'CASCADE',
            table: 'Job',
            to: 'id',
          }),
          expect.objectContaining({
            from: 'createdByUserId',
            on_delete: 'CASCADE',
            on_update: 'CASCADE',
            table: 'User',
            to: 'id',
          }),
        ]),
      );
    } finally {
      await prisma.$disconnect();
      rmSync(tempRoot, { force: true, recursive: true });
    }
  });

  it('repairs upgraded citation tables with reader excerpt foreign keys', async () => {
    const tempRoot = mkdtempSync(join(tmpdir(), 'jixia-schema-'));
    const prisma = createPrismaClient({
      url: `file:${join(tempRoot, 'schema.db')}`,
    });

    try {
      await initializeReadingPersistence(prisma);

      await prisma.$executeRawUnsafe(`
        CREATE TABLE "NotebookDocument" (
          "id" TEXT NOT NULL PRIMARY KEY,
          "ownerId" TEXT NOT NULL,
          "title" TEXT NOT NULL,
          "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
      `);
      await prisma.$executeRawUnsafe(`
        CREATE TABLE "NotebookDocumentVersion" (
          "id" TEXT NOT NULL PRIMARY KEY,
          "notebookDocumentId" TEXT NOT NULL,
          "versionNumber" INTEGER NOT NULL,
          "snapshot" TEXT NOT NULL,
          "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          CONSTRAINT "NotebookDocumentVersion_notebookDocumentId_fkey" FOREIGN KEY ("notebookDocumentId") REFERENCES "NotebookDocument" ("id") ON DELETE CASCADE ON UPDATE CASCADE
        )
      `);
      await prisma.$executeRawUnsafe(`
        CREATE TABLE "NotebookDocumentCitation" (
          "id" TEXT NOT NULL PRIMARY KEY,
          "notebookDocumentVersionId" TEXT NOT NULL,
          "paperAssetId" TEXT NOT NULL,
          "evidenceSpan" TEXT,
          "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          CONSTRAINT "NotebookDocumentCitation_notebookDocumentVersionId_fkey" FOREIGN KEY ("notebookDocumentVersionId") REFERENCES "NotebookDocumentVersion" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
          CONSTRAINT "NotebookDocumentCitation_paperAssetId_fkey" FOREIGN KEY ("paperAssetId") REFERENCES "PaperAsset" ("id") ON DELETE CASCADE ON UPDATE CASCADE
        )
      `);

      await prisma.$executeRawUnsafe(`
        CREATE TABLE "ProjectDoc" (
          "id" TEXT NOT NULL PRIMARY KEY,
          "projectId" TEXT NOT NULL,
          "createdByUserId" TEXT NOT NULL,
          "title" TEXT NOT NULL,
          "publishState" TEXT NOT NULL DEFAULT 'draft',
          "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
      `);
      await prisma.$executeRawUnsafe(`
        CREATE TABLE "ProjectDocVersion" (
          "id" TEXT NOT NULL PRIMARY KEY,
          "projectDocId" TEXT NOT NULL,
          "versionNumber" INTEGER NOT NULL,
          "snapshot" TEXT NOT NULL,
          "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          CONSTRAINT "ProjectDocVersion_projectDocId_fkey" FOREIGN KEY ("projectDocId") REFERENCES "ProjectDoc" ("id") ON DELETE CASCADE ON UPDATE CASCADE
        )
      `);
      await prisma.$executeRawUnsafe(`
        CREATE TABLE "ProjectDocCitation" (
          "id" TEXT NOT NULL PRIMARY KEY,
          "projectDocVersionId" TEXT NOT NULL,
          "paperAssetId" TEXT NOT NULL,
          "evidenceSpan" TEXT,
          "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          CONSTRAINT "ProjectDocCitation_projectDocVersionId_fkey" FOREIGN KEY ("projectDocVersionId") REFERENCES "ProjectDocVersion" ("id") ON DELETE CASCADE ON UPDATE CASCADE,
          CONSTRAINT "ProjectDocCitation_paperAssetId_fkey" FOREIGN KEY ("paperAssetId") REFERENCES "PaperAsset" ("id") ON DELETE CASCADE ON UPDATE CASCADE
        )
      `);

      expect(
        await foreignKeyList(prisma, 'NotebookDocumentCitation'),
      ).not.toEqual(
        expect.arrayContaining([
          expect.objectContaining({ from: 'readerExcerptId' }),
        ]),
      );
      expect(await foreignKeyList(prisma, 'ProjectDocCitation')).not.toEqual(
        expect.arrayContaining([
          expect.objectContaining({ from: 'readerExcerptId' }),
        ]),
      );

      await initializeNotebookPersistence(prisma);
      await initializeProjectDocPersistence(prisma);

      expectReaderExcerptForeignKey(
        await foreignKeyList(prisma, 'NotebookDocumentCitation'),
      );
      expectReaderExcerptForeignKey(
        await foreignKeyList(prisma, 'ProjectDocCitation'),
      );
    } finally {
      await prisma.$disconnect();
      rmSync(tempRoot, { force: true, recursive: true });
    }
  });

  it('repairs audit log job foreign key when audit initializes before jobs', async () => {
    const tempRoot = mkdtempSync(join(tmpdir(), 'jixia-audit-fk-'));
    const prisma = createPrismaClient({
      url: `file:${join(tempRoot, 'audit-fk.db')}`,
    });

    try {
      await initializeAuditPersistence(prisma);
      await initializeJobPersistence(prisma);

      expectAuditLogJobForeignKey(await foreignKeyList(prisma, 'AuditLog'));

      await prisma.$executeRawUnsafe(`
        INSERT INTO "User" ("id", "email", "displayName")
        VALUES ('user-audit-fk', 'audit-fk@example.test', 'Audit FK')
      `);
      await prisma.$executeRawUnsafe(`
        INSERT INTO "Space" ("id", "name", "kind")
        VALUES ('space-audit-fk', 'Audit FK Space', 'shared')
      `);
      await prisma.$executeRawUnsafe(`
        INSERT INTO "ProviderCredential" ("id", "userId", "provider", "secretRef")
        VALUES ('cred-audit-fk', 'user-audit-fk', 'openai', 'secret-audit-fk')
      `);
      await prisma.$executeRawUnsafe(`
        INSERT INTO "Job" ("id", "spaceId", "scopeType", "scopeId", "requestedByUserId", "credentialRef", "kind", "status", "payload")
        VALUES ('job-audit-fk', 'space-audit-fk', 'user', 'user-audit-fk', 'user-audit-fk', 'cred-audit-fk', 'ai.summary', 'queued', '{}')
      `);
      await prisma.$executeRawUnsafe(`
        INSERT INTO "AuditLog" ("id", "spaceId", "scopeType", "scopeId", "objectType", "objectId", "actorUserId", "jobId", "action", "detail")
        VALUES ('audit-fk', 'space-audit-fk', 'user', 'user-audit-fk', 'job', 'job-audit-fk', 'user-audit-fk', 'job-audit-fk', 'job.created', 'Created job audit row.')
      `);
      await prisma.$executeRawUnsafe(`
        DELETE FROM "Job" WHERE "id" = 'job-audit-fk'
      `);

      const rows = await prisma.$queryRawUnsafe<Array<{ jobId: string | null }>>(
        `SELECT "jobId" FROM "AuditLog" WHERE "id" = 'audit-fk'`,
      );

      expect(rows).toEqual([{ jobId: null }]);
    } finally {
      await prisma.$disconnect();
      rmSync(tempRoot, { force: true, recursive: true });
    }
  });

  it('preserves populated audit rows while repairing the job foreign key', async () => {
    const tempRoot = mkdtempSync(join(tmpdir(), 'jixia-audit-fk-populated-'));
    const prisma = createPrismaClient({
      url: `file:${join(tempRoot, 'audit-fk-populated.db')}`,
    });

    try {
      await initializeAuditPersistence(prisma);

      await prisma.$executeRawUnsafe(`
        INSERT INTO "User" ("id", "email", "displayName")
        VALUES ('user-audit-fk-populated', 'audit-fk-populated@example.test', 'Audit FK Populated')
      `);
      await prisma.$executeRawUnsafe(`
        INSERT INTO "Space" ("id", "name", "kind")
        VALUES ('space-audit-fk-populated', 'Audit FK Populated Space', 'shared')
      `);
      await prisma.$executeRawUnsafe(`
        INSERT INTO "AuditLog" (
          "id",
          "spaceId",
          "scopeType",
          "scopeId",
          "objectType",
          "objectId",
          "projectId",
          "actorUserId",
          "jobId",
          "action",
          "detail",
          "metadataJson"
        )
        VALUES
          (
            'audit-fk-valid',
            'space-audit-fk-populated',
            'project',
            'project-audit-fk-populated',
            'job',
            'job-audit-fk-valid',
            'project-audit-fk-populated',
            'user-audit-fk-populated',
            'job-audit-fk-valid',
            'job.created',
            'Created valid job audit row.',
            '{"citationCount":2,"publishState":"draft"}'
          ),
          (
            'audit-fk-orphan',
            'space-audit-fk-populated',
            'project',
            'project-audit-fk-populated',
            'job',
            'job-audit-fk-orphan',
            'project-audit-fk-populated',
            'user-audit-fk-populated',
            'job-audit-fk-orphan',
            'job.failed',
            'Created orphan job audit row.',
            '{"itemCount":1}'
          )
      `);
      await prisma.$executeRawUnsafe(`
        CREATE TABLE "ProviderCredential" (
          "id" TEXT NOT NULL PRIMARY KEY,
          "userId" TEXT NOT NULL,
          "provider" TEXT NOT NULL,
          "secretRef" TEXT NOT NULL,
          "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
      `);
      await prisma.$executeRawUnsafe(`
        CREATE TABLE "Job" (
          "id" TEXT NOT NULL PRIMARY KEY,
          "spaceId" TEXT NOT NULL,
          "scopeType" TEXT NOT NULL DEFAULT 'user',
          "scopeId" TEXT NOT NULL,
          "requestedByUserId" TEXT NOT NULL,
          "credentialRef" TEXT NOT NULL,
          "kind" TEXT NOT NULL,
          "status" TEXT NOT NULL,
          "payload" TEXT NOT NULL,
          "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
      `);
      await prisma.$executeRawUnsafe(`
        INSERT INTO "ProviderCredential" ("id", "userId", "provider", "secretRef")
        VALUES ('cred-audit-fk-populated', 'user-audit-fk-populated', 'openai', 'secret-audit-fk-populated')
      `);
      await prisma.$executeRawUnsafe(`
        INSERT INTO "Job" ("id", "spaceId", "scopeType", "scopeId", "requestedByUserId", "credentialRef", "kind", "status", "payload")
        VALUES ('job-audit-fk-valid', 'space-audit-fk-populated', 'project', 'project-audit-fk-populated', 'user-audit-fk-populated', 'cred-audit-fk-populated', 'ai.summary', 'queued', '{}')
      `);

      await initializeAuditPersistence(prisma);

      expectAuditLogJobForeignKey(await foreignKeyList(prisma, 'AuditLog'));

      const rows = await prisma.$queryRawUnsafe<
        Array<{
          id: string;
          jobId: string | null;
          metadataJson: string | null;
          objectId: string;
          projectId: string | null;
          scopeId: string;
          scopeType: string;
        }>
      >(`
        SELECT
          "id",
          "jobId",
          "metadataJson",
          "objectId",
          "projectId",
          "scopeId",
          "scopeType"
        FROM "AuditLog"
        ORDER BY "id"
      `);

      expect(rows).toEqual([
        {
          id: 'audit-fk-orphan',
          jobId: null,
          metadataJson: '{"itemCount":1}',
          objectId: 'job-audit-fk-orphan',
          projectId: 'project-audit-fk-populated',
          scopeId: 'project-audit-fk-populated',
          scopeType: 'project',
        },
        {
          id: 'audit-fk-valid',
          jobId: 'job-audit-fk-valid',
          metadataJson: '{"citationCount":2,"publishState":"draft"}',
          objectId: 'job-audit-fk-valid',
          projectId: 'project-audit-fk-populated',
          scopeId: 'project-audit-fk-populated',
          scopeType: 'project',
        },
      ]);

      await prisma.$executeRawUnsafe(`
        DELETE FROM "Job" WHERE "id" = 'job-audit-fk-valid'
      `);

      const afterDeleteRows = await prisma.$queryRawUnsafe<
        Array<{ id: string; jobId: string | null; objectId: string }>
      >(`
        SELECT "id", "jobId", "objectId"
        FROM "AuditLog"
        ORDER BY "id"
      `);

      expect(afterDeleteRows).toEqual([
        { id: 'audit-fk-orphan', jobId: null, objectId: 'job-audit-fk-orphan' },
        { id: 'audit-fk-valid', jobId: null, objectId: 'job-audit-fk-valid' },
      ]);
    } finally {
      await prisma.$disconnect();
      rmSync(tempRoot, { force: true, recursive: true });
    }
  });

  it('creates typed database entrypoints and repositories', () => {
    const packageJson = JSON.parse(readFileSync('package.json', 'utf8')) as {
      scripts?: Record<string, string>;
    };
    const clientEntrypoint = readFileSync('src/db/client.ts', 'utf8');
    const dbIndex = readFileSync('src/db/index.ts', 'utf8');

    expect(existsSync('src/db/client.ts')).toBe(true);
    expect(existsSync('src/db/index.ts')).toBe(true);
    expect(existsSync('src/db/repositories/project.repository.ts')).toBe(true);
    expect(existsSync('src/db/repositories/space.repository.ts')).toBe(true);
    expect(existsSync('src/db/repositories/library.repository.ts')).toBe(true);
    expect(existsSync('src/db/repositories/notebook.repository.ts')).toBe(true);
    expect(existsSync('src/db/repositories/project-doc.repository.ts')).toBe(true);
    expect(existsSync('src/db/repositories/job.repository.ts')).toBe(true);
    expect(existsSync('src/db/repositories/audit.repository.ts')).toBe(true);
    expect(existsSync('src/db/repositories/credentials.repository.ts')).toBe(true);
    expect(existsSync('src/db/repositories/reading.repository.ts')).toBe(true);
    expect(existsSync('src/db/repositories/ai-chat.repository.ts')).toBe(true);
    expect(
      existsSync(
        'prisma/migrations/20260504000000_scoped_library_entries/migration.sql',
      ),
    ).toBe(true);
    expect(
      existsSync(
        'prisma/migrations/20260505000000_notebook_project_docs/migration.sql',
      ),
    ).toBe(true);
    expect(
      existsSync(
        'prisma/migrations/20260507000000_job_governance_persistence/migration.sql',
      ),
    ).toBe(true);
    expect(
      existsSync(
        'prisma/migrations/20260509000000_credentials_workbench_settings_authority/migration.sql',
      ),
    ).toBe(true);
    expect(
      existsSync(
        'prisma/migrations/20260510000000_job_scoperef_authority_cutover/migration.sql',
      ),
    ).toBe(true);
    expect(
      existsSync(
        'prisma/migrations/20260511000000_reading_project_comments/migration.sql',
      ),
    ).toBe(true);
    expect(clientEntrypoint).toContain('PrismaClient');
    expect(clientEntrypoint).toContain('createPrismaClient');
    expect(dbIndex).toContain('createProjectRepository');
    expect(dbIndex).toContain('createSpaceRepository');
    expect(dbIndex).toContain('createLibraryRepository');
    expect(dbIndex).toContain('createReadingRepository');
    expect(dbIndex).toContain('PersistedProjectReadingCommentRecord');
    expect(dbIndex).toContain('PersistedSourceTextArtifactRecord');
    expect(dbIndex).toContain('CreatePersistedSourceTextArtifactParams');
    expect(dbIndex).toContain('createNotebookRepository');
    expect(dbIndex).toContain('createProjectDocRepository');
    expect(dbIndex).toContain('initializeAiChatPersistence');
    expect(dbIndex).toContain('createJobRepository');
    expect(dbIndex).toContain('createAuditRepository');
    expect(dbIndex).toContain('createCredentialsRepository');
    expect(packageJson.scripts?.['prisma:generate']).toBe('prisma generate');
    expect(packageJson.scripts?.prebuild).toBe('npm run prisma:generate');
    expect(packageJson.scripts?.pretest).toBe('npm run prisma:generate');
    expect(packageJson.scripts?.pretypecheck).toBe('npm run prisma:generate');
  });

  it('keeps db repositories decoupled from shared transport contracts', () => {
    const projectRepository = readFileSync(
      'src/db/repositories/project.repository.ts',
      'utf8',
    );
    const spaceRepository = readFileSync(
      'src/db/repositories/space.repository.ts',
      'utf8',
    );
    const libraryRepository = readFileSync(
      'src/db/repositories/library.repository.ts',
      'utf8',
    );
    const notebookRepository = readFileSync(
      'src/db/repositories/notebook.repository.ts',
      'utf8',
    );
    const projectDocRepository = readFileSync(
      'src/db/repositories/project-doc.repository.ts',
      'utf8',
    );
    const jobRepository = readFileSync(
      'src/db/repositories/job.repository.ts',
      'utf8',
    );
    const auditRepository = readFileSync(
      'src/db/repositories/audit.repository.ts',
      'utf8',
    );
    const credentialsRepository = readFileSync(
      'src/db/repositories/credentials.repository.ts',
      'utf8',
    );
    const aiChatRepository = readFileSync(
      'src/db/repositories/ai-chat.repository.ts',
      'utf8',
    );

    expect(projectRepository).not.toContain('@shared/contracts/');
    expect(spaceRepository).not.toContain('@shared/contracts/');
    expect(libraryRepository).not.toContain('@shared/contracts/');
    expect(notebookRepository).not.toContain('@shared/contracts/');
    expect(projectDocRepository).not.toContain('@shared/contracts/');
    expect(jobRepository).not.toContain('@shared/contracts/');
    expect(auditRepository).not.toContain('@shared/contracts/');
    expect(credentialsRepository).not.toContain('@shared/contracts/');
    expect(aiChatRepository).not.toContain('@shared/contracts/');
  });

  it('initializes private AIChat trace tables with safe reference foreign keys', async () => {
    const tempRoot = mkdtempSync(join(tmpdir(), 'jixia-ai-chat-schema-'));
    const prisma = createPrismaClient({
      url: `file:${join(tempRoot, 'ai-chat-schema.db')}`,
    });

    try {
      await initializeAiChatPersistence(prisma);

      await expect(readColumnNames(prisma, 'AiChatSession')).resolves.toEqual(
        expect.arrayContaining([
          'id',
          'ownerUserId',
          'sourceContextType',
          'sourceContextId',
          'sourceContextVersionId',
          'title',
          'lifecycleStatus',
          'archivedAt',
          'createdAt',
          'updatedAt',
        ]),
      );
      await expect(readColumnNames(prisma, 'AiChatMessage')).resolves.toEqual(
        expect.arrayContaining([
          'id',
          'sessionId',
          'role',
          'body',
          'safeMetadataJson',
          'createdAt',
        ]),
      );
      await expect(readColumnNames(prisma, 'AiChatRequest')).resolves.toEqual(
        expect.arrayContaining([
          'id',
          'sessionId',
          'requestedMessageId',
          'responseMessageId',
          'status',
          'promptBuildVersion',
          'contextTokenEstimate',
          'responseTokenEstimate',
          'costEstimate',
          'budgetLimit',
          'overBudgetDecision',
          'safeMetadataJson',
          'createdAt',
          'updatedAt',
        ]),
      );
      await expect(readColumnNames(prisma, 'AiChatRequestContextRef')).resolves.toEqual(
        expect.arrayContaining([
          'id',
          'requestId',
          'sourceType',
          'sourceId',
          'sourceVersionId',
          'sourceDocumentId',
          'sourceLibraryEntryId',
          'readerAnnotationId',
          'sourceTextArtifactId',
          'paperAssetId',
          'rangeStartOffset',
          'rangeEndOffset',
          'locatorJson',
          'chipLabel',
          'tokenEstimate',
          'omittedReason',
          'createdAt',
        ]),
      );

      expect(await foreignKeyList(prisma, 'AiChatSession')).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            from: 'ownerUserId',
            on_delete: 'CASCADE',
            on_update: 'CASCADE',
            table: 'User',
            to: 'id',
          }),
        ]),
      );
      expect(await foreignKeyList(prisma, 'AiChatMessage')).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            from: 'sessionId',
            on_delete: 'CASCADE',
            on_update: 'CASCADE',
            table: 'AiChatSession',
            to: 'id',
          }),
        ]),
      );
      expect(await foreignKeyList(prisma, 'AiChatRequest')).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            from: 'sessionId',
            on_delete: 'CASCADE',
            on_update: 'CASCADE',
            table: 'AiChatSession',
            to: 'id',
          }),
        ]),
      );
      expect(await foreignKeyList(prisma, 'AiChatRequestContextRef')).toEqual(
        expect.arrayContaining([
          expect.objectContaining({
            from: 'requestId',
            on_delete: 'CASCADE',
            on_update: 'CASCADE',
            table: 'AiChatRequest',
            to: 'id',
          }),
          expect.objectContaining({
            from: 'sourceLibraryEntryId',
            on_delete: 'SET NULL',
            on_update: 'CASCADE',
            table: 'LibraryEntry',
            to: 'id',
          }),
          expect.objectContaining({
            from: 'readerAnnotationId',
            on_delete: 'SET NULL',
            on_update: 'CASCADE',
            table: 'ReaderAnnotation',
            to: 'id',
          }),
          expect.objectContaining({
            from: 'sourceTextArtifactId',
            on_delete: 'SET NULL',
            on_update: 'CASCADE',
            table: 'SourceTextArtifact',
            to: 'id',
          }),
          expect.objectContaining({
            from: 'paperAssetId',
            on_delete: 'SET NULL',
            on_update: 'CASCADE',
            table: 'PaperAsset',
            to: 'id',
          }),
        ]),
      );
    } finally {
      await prisma.$disconnect();
      rmSync(tempRoot, { force: true, recursive: true });
    }
  });

  it('enforces ReaderAnnotation privacy constraints at runtime', async () => {
    const tempRoot = mkdtempSync(join(tmpdir(), 'jixia-reader-annotation-privacy-'));
    const prisma = createPrismaClient({
      url: `file:${join(tempRoot, 'reader-annotation-privacy.db')}`,
    });

    try {
      await initializeReadingPersistence(prisma);
      expectReaderAnnotationPrivacyConstraints(
        await readCreateTableSql(prisma, 'ReaderAnnotation'),
      );

      const fixture = await seedReaderAnnotationFixture(prisma, 'privacy');
      const privateAnnotation = await prisma.readerAnnotation.create({
        data: {
          createdByUserId: fixture.userId,
          id: 'reader-annotation-private-note-allowed',
          libraryEntryId: fixture.personalLibraryEntryId,
          note: 'Private reader note remains private.',
          paperAssetId: fixture.paperAssetId,
          quote: 'private annotation quote',
          selectorJson: JSON.stringify({ exact: 'private annotation quote', type: 'textQuote' }),
          sourceContextId: fixture.personalLibraryEntryId,
          sourceContextType: 'libraryEntry',
          visibility: 'private',
        },
      });
      const projectAnnotation = await prisma.readerAnnotation.create({
        data: {
          createdByUserId: fixture.userId,
          id: 'reader-annotation-project-valid',
          libraryEntryId: fixture.projectLibraryEntryId,
          paperAssetId: fixture.paperAssetId,
          projectId: fixture.projectId,
          quote: 'project annotation quote',
          selectorJson: JSON.stringify({ exact: 'project annotation quote', type: 'textQuote' }),
          sourceContextId: fixture.projectLibraryEntryId,
          sourceContextType: 'libraryEntry',
          visibility: 'project',
        },
      });

      await expect(
        prisma.readerAnnotation.create({
          data: {
            createdByUserId: fixture.userId,
            id: 'reader-annotation-project-note-rejected',
            libraryEntryId: fixture.projectLibraryEntryId,
            note: 'Project-visible copies must not carry private notes.',
            paperAssetId: fixture.paperAssetId,
            projectId: fixture.projectId,
            quote: 'project note rejected quote',
            selectorJson: JSON.stringify({ exact: 'project note rejected quote', type: 'textQuote' }),
            sourceContextId: fixture.projectLibraryEntryId,
            sourceContextType: 'libraryEntry',
            visibility: 'project',
          },
        }),
      ).rejects.toThrow();
      await expect(
        prisma.readerAnnotation.create({
          data: {
            createdByUserId: fixture.userId,
            id: 'reader-annotation-project-null-project-rejected',
            libraryEntryId: fixture.projectLibraryEntryId,
            paperAssetId: fixture.paperAssetId,
            quote: 'project null project rejected quote',
            selectorJson: JSON.stringify({ exact: 'project null project rejected quote', type: 'textQuote' }),
            sourceContextId: fixture.projectLibraryEntryId,
            sourceContextType: 'libraryEntry',
            visibility: 'project',
          },
        }),
      ).rejects.toThrow();

      expect(privateAnnotation).toMatchObject({
        note: 'Private reader note remains private.',
        projectId: null,
        visibility: 'private',
      });
      expect(projectAnnotation).toMatchObject({
        note: null,
        projectId: fixture.projectId,
        visibility: 'project',
      });
    } finally {
      await prisma.$disconnect();
      rmSync(tempRoot, { force: true, recursive: true });
    }
  });

  it('repairs unconstrained ReaderAnnotation tables to preserve privacy invariants', async () => {
    const tempRoot = mkdtempSync(join(tmpdir(), 'jixia-reader-annotation-repair-'));
    const databaseUrl = `file:${join(tempRoot, 'reader-annotation-repair.db')}`;
    const prisma = createPrismaClient({ url: databaseUrl });

    try {
      await initializeReadingPersistence(prisma);
      const fixture = await seedReaderAnnotationFixture(prisma, 'repair');

      await prisma.$executeRawUnsafe('PRAGMA foreign_keys = OFF');
      await prisma.$executeRawUnsafe('DROP TABLE "ReaderAnnotation"');
      await prisma.$executeRawUnsafe(`
        CREATE TABLE "ReaderAnnotation" (
          "id" TEXT NOT NULL PRIMARY KEY,
          "libraryEntryId" TEXT NOT NULL,
          "paperAssetId" TEXT NOT NULL,
          "sourceContextType" TEXT NOT NULL,
          "sourceContextId" TEXT NOT NULL,
          "sourceContextVersionId" TEXT,
          "createdByUserId" TEXT NOT NULL,
          "visibility" TEXT NOT NULL DEFAULT 'private',
          "projectId" TEXT,
          "originalAnnotationId" TEXT,
          "sourceTextArtifactId" TEXT,
          "quote" TEXT NOT NULL,
          "selectorJson" TEXT NOT NULL,
          "locatorJson" TEXT,
          "note" TEXT,
          "lifecycleStatus" TEXT NOT NULL DEFAULT 'active',
          "archivedAt" DATETIME,
          "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
          "updatedAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP
        )
      `);
      await prisma.$executeRawUnsafe(`
        INSERT INTO "ReaderAnnotation" (
          "id",
          "libraryEntryId",
          "paperAssetId",
          "sourceContextType",
          "sourceContextId",
          "createdByUserId",
          "visibility",
          "projectId",
          "quote",
          "selectorJson",
          "note"
        )
        VALUES
          (
            'reader-annotation-repair-project-note',
            '${fixture.projectLibraryEntryId}',
            '${fixture.paperAssetId}',
            'libraryEntry',
            '${fixture.projectLibraryEntryId}',
            '${fixture.userId}',
            'project',
            '${fixture.projectId}',
            'project note is scrubbed',
            '{"type":"textQuote","exact":"project note is scrubbed"}',
            'private note to scrub'
          ),
          (
            'reader-annotation-repair-project-null-project',
            '${fixture.projectLibraryEntryId}',
            '${fixture.paperAssetId}',
            'libraryEntry',
            '${fixture.projectLibraryEntryId}',
            '${fixture.userId}',
            'project',
            NULL,
            'project without project becomes private',
            '{"type":"textQuote","exact":"project without project becomes private"}',
            'private note retained after demotion'
          ),
          (
            'reader-annotation-repair-private-note',
            '${fixture.personalLibraryEntryId}',
            '${fixture.paperAssetId}',
            'libraryEntry',
            '${fixture.personalLibraryEntryId}',
            '${fixture.userId}',
            'private',
            NULL,
            'private note stays private',
            '{"type":"textQuote","exact":"private note stays private"}',
            'private note retained'
          ),
          (
            'reader-annotation-repair-project-valid',
            '${fixture.projectLibraryEntryId}',
            '${fixture.paperAssetId}',
            'libraryEntry',
            '${fixture.projectLibraryEntryId}',
            '${fixture.userId}',
            'project',
            '${fixture.projectId}',
            'valid project copy',
            '{"type":"textQuote","exact":"valid project copy"}',
            NULL
          )
      `);
      await prisma.$executeRawUnsafe('PRAGMA foreign_keys = ON');
      await prisma.$disconnect();

      const repairedPrisma = createPrismaClient({ url: databaseUrl });

      try {
        await initializeReadingPersistence(repairedPrisma);

        expectReaderAnnotationPrivacyConstraints(
          await readCreateTableSql(repairedPrisma, 'ReaderAnnotation'),
        );
        const rows = await repairedPrisma.$queryRawUnsafe<
          Array<{
            id: string;
            note: string | null;
            projectId: string | null;
            visibility: string;
          }>
        >(`
          SELECT "id", "note", "projectId", "visibility"
          FROM "ReaderAnnotation"
          ORDER BY "id"
        `);

        expect(rows).toEqual([
          {
            id: 'reader-annotation-repair-private-note',
            note: 'private note retained',
            projectId: null,
            visibility: 'private',
          },
          {
            id: 'reader-annotation-repair-project-note',
            note: null,
            projectId: fixture.projectId,
            visibility: 'project',
          },
          {
            id: 'reader-annotation-repair-project-null-project',
            note: 'private note retained after demotion',
            projectId: null,
            visibility: 'private',
          },
          {
            id: 'reader-annotation-repair-project-valid',
            note: null,
            projectId: fixture.projectId,
            visibility: 'project',
          },
        ]);
        await expect(
          repairedPrisma.readerAnnotation.create({
            data: {
              createdByUserId: fixture.userId,
              id: 'reader-annotation-repair-project-note-rejected',
              libraryEntryId: fixture.projectLibraryEntryId,
              note: 'Project copy note rejected after repair.',
              paperAssetId: fixture.paperAssetId,
              projectId: fixture.projectId,
              quote: 'post repair rejected quote',
              selectorJson: JSON.stringify({ exact: 'post repair rejected quote', type: 'textQuote' }),
              sourceContextId: fixture.projectLibraryEntryId,
              sourceContextType: 'libraryEntry',
              visibility: 'project',
            },
          }),
        ).rejects.toThrow();
      } finally {
        await repairedPrisma.$disconnect();
      }
    } finally {
      rmSync(tempRoot, { force: true, recursive: true });
    }
  });

  it('keeps credential secrets and workbench settings on Prisma authority', () => {
    const appWiring = readFileSync('src/server/app.ts', 'utf8');
    const credentialsService = readFileSync(
      'src/server/services/credentials.service.ts',
      'utf8',
    );
    const credentialsRepository = readFileSync(
      'src/db/repositories/credentials.repository.ts',
      'utf8',
    );
    const migration = readFileSync(
      'prisma/migrations/20260509000000_credentials_workbench_settings_authority/migration.sql',
      'utf8',
    );
    const serializedStateBlock = appWiring.slice(
      appWiring.indexOf('const serializedState: SerializedJixiaAppState = {'),
      appWiring.indexOf('function markLibraryBootstrapComplete'),
    );

    expect(migration).toContain('CREATE TABLE IF NOT EXISTS "ProviderCredentialSecret"');
    expect(migration).toContain('CREATE TABLE IF NOT EXISTS "WorkbenchSettings"');
    expect(credentialsRepository).toContain('providerCredentialSecret.create');
    expect(credentialsRepository).toContain('workbenchSettings.upsert');
    expect(credentialsRepository).toContain('bootstrapLegacyAuthority');
    expect(credentialsRepository).toContain('hasStoredCredentials');
    expect(credentialsService).toContain('repository.createCredential');
    expect(credentialsService).toContain('repository.getWorkbenchSettings');
    expect(credentialsService).toContain('repository.upsertWorkbenchSettings');
    expect(credentialsService).not.toContain('store.credentials.push');
    expect(credentialsService).not.toContain('store.workbenchSettings.push');
    expect(credentialsService).not.toContain('store.persist');
    expect(credentialsService).not.toContain('actorUserId ?? input.userId');
    expect(credentialsService).not.toContain('actorUserId ?? query.userId');

    expect(appWiring).toContain('createCredentialAuthorityBootstrappedCredentialsRepository');
    expect(appWiring).toContain('createCredentialAuthorityBootstrappedJobRepository');
    expect(appWiring).toContain('legacyCredentials');
    expect(appWiring).toContain('legacyWorkbenchSettings');
    expect(appWiring).toContain('markCredentialAuthorityBootstrapComplete');
    expect(appWiring).toContain('ensureCredentialAuthorityUsable');
    expect(appWiring).not.toContain('credentials: state.credentials');
    expect(appWiring).not.toContain('workbenchSettings: state.workbenchSettings');
    expect(appWiring).toContain('Compatibility-only bootstrap input');
    expect(serializedStateBlock).toContain('pending one-time');
    expect(serializedStateBlock).toContain('clearLegacyCredentialState removes these fields');
    expect(serializedStateBlock).toContain('state.legacyCredentials.length > 0');
    expect(serializedStateBlock).toContain('? state.legacyCredentials');
    expect(serializedStateBlock).toContain('state.legacyWorkbenchSettings.length > 0');
    expect(serializedStateBlock).toContain('? state.legacyWorkbenchSettings');
  });

  it('keeps project service authority out of legacy json project arrays', () => {
    const projectService = readFileSync(
      'src/server/services/projects.service.ts',
      'utf8',
    );

    expect(projectService).not.toContain('store.projects.push');
    expect(projectService).not.toContain('store.projectMembers.push');
    expect(projectService).not.toContain('store.projects.filter');
    expect(projectService).not.toContain('store.projectMembers.filter');
  });

  it('keeps space service authority out of legacy json space arrays', () => {
    const appWiring = readFileSync('src/server/app.ts', 'utf8');
    const spaceService = readFileSync('src/server/services/spaces.service.ts', 'utf8');

    expect(appWiring).not.toContain('legacyMirror');
    expect(appWiring).not.toContain('state.memberships');
    expect(appWiring).not.toContain('state.spaces');
    expect(appWiring).not.toContain('parsed.memberships');
    expect(appWiring).not.toContain('parsed.spaces');
    expect(appWiring).not.toContain('memberships: state.legacy');
    expect(appWiring).not.toContain('spaces: state.legacy');
    expect(spaceService).not.toContain('SpacesLegacyMirror');
    expect(spaceService).not.toContain('legacyMirror');
    expect(spaceService).not.toContain('store.spaces.push');
    expect(spaceService).not.toContain('store.memberships.push');
    expect(spaceService).not.toContain('store.spaces.filter');
    expect(spaceService).not.toContain('store.memberships.filter');
    expect(spaceService).toContain('repository.listSpacesForActor');
    expect(spaceService).toContain('repository.listMemberships');
    expect(spaceService).toContain('repository.getMembership');
  });

  it('cuts targeted server flows over to repository-backed document authority', () => {
    const appWiring = readFileSync('src/server/app.ts', 'utf8');
    const demoApi = readFileSync('src/web/lib/demo-api.ts', 'utf8');
    const httpApi = readFileSync('src/server/http-api.ts', 'utf8');
    const httpServer = readFileSync('src/server/http-server.ts', 'utf8');
    const importService = readFileSync('src/server/services/import.service.ts', 'utf8');
    const libraryService = readFileSync('src/server/services/library.service.ts', 'utf8');
    const readingService = readFileSync('src/server/services/reading.service.ts', 'utf8');
    const notebookService = readFileSync('src/server/services/notebooks.service.ts', 'utf8');
    const projectDocsService = readFileSync('src/server/services/project-docs.service.ts', 'utf8');
    const jobsRoutes = readFileSync('src/server/routes/jobs.routes.ts', 'utf8');
    const jobStreamRoutes = readFileSync('src/server/routes/job-stream.routes.ts', 'utf8');
    const jobGovernance = readFileSync('src/server/jobs/job-governance.ts', 'utf8');

    expect(appWiring).not.toContain('memberships: state.memberships');
    expect(appWiring).not.toContain('spaces: state.spaces');
    expect(demoApi).toContain('createDemoApi(');
    expect(demoApi).toContain('function requestHeaders()');
    expect(demoApi).toContain('Cookie: options.cookie');
    expect(demoApi).not.toContain("'x-jixia-actor'");
    expect(httpApi).toContain('requireActor(actor)');
    expect(httpApi).not.toContain('requestedByUserId: DEFAULT_WORKBENCH_USER_ID');
    expect(httpApi).not.toContain('userId: DEFAULT_WORKBENCH_USER_ID');
    expect(httpServer).toContain('function isWorkbenchHttpApiPath');
    expect(httpServer).toContain('getOptionalActor(request, actorOptions)');
    expect(httpServer).toContain('sessionRoutes: app.session');

    expect(importService).toContain('libraryRepository.importScopedEntry');
    expect(importService).toContain('scope: { id: actorUserId, type: "user" }');
    expect(importService).not.toContain('scope: { id: input.requestedByUserId, type: "user" }');
    expect(importService).not.toContain('actorUserId ?? input.requestedByUserId');
    expect(importService).not.toContain('store.memberships.some');
    expect(importService).not.toContain('store.spaces.find');

    expect(libraryService).toContain('projectRepository.getProjectMember');
    expect(libraryService).not.toContain('store.memberships.some');
    expect(libraryService).not.toContain('store.spaces.find');

    expect(readingService).toContain('libraryService.assertCanAccessEntry');
    expect(readingService).toContain('readingRepository.listPrivateNotesForEntry');
    expect(readingService).toContain('readingRepository.listProjectCommentsForEntry');
    expect(readingService).toContain('readingRepository.createProjectComment');
    expect(readingService).toContain('readingRepository.saveGeneratedInsight');
    expect(readingService).not.toContain('actorUserId ?? input.authorUserId');
    expect(readingService).not.toContain('actorUserId ?? input.startedByUserId');
    expect(readingService).not.toContain('store.memberships.some');
    expect(readingService).not.toContain('store.spaces.find');

    expect(notebookService).toContain('notebookRepository.getDocumentForOwner');
    expect(notebookService).toContain('libraryService.assertCanAccessPaperAsset');
    expect(notebookService).not.toContain('store.memberships.some');
    expect(notebookService).not.toContain('store.spaces.some');

    expect(projectDocsService).toContain('projectRepository.getProjectMember');
    expect(projectDocsService).toContain('projectDocRepository.saveVersion');
    expect(projectDocsService).toContain('libraryRepository.listLibraryEntriesForAsset');
    expect(projectDocsService).not.toContain('SpaceMembership');
    expect(projectDocsService).not.toContain('store.projectMembers.some');

    expect(jobsRoutes).toContain('resolveAuthorizedCreateJobScopeContext');
    expect(jobsRoutes).toContain('jobRepository.createQueuedJobWithAudit');
    expect(jobsRoutes).toContain('jobRepository.listJobsForScope');
    expect(jobsRoutes).not.toContain('actorUserId ?? input.requestedByUserId');
    expect(jobsRoutes).not.toContain('store.memberships.some');
    expect(jobsRoutes).not.toContain('store.spaces.find');
    expect(jobsRoutes).not.toContain('store.jobs.push');
    expect(jobsRoutes).not.toContain('store.jobs.find');
    expect(jobsRoutes).not.toContain('store.jobs.filter');

    const credentialsService = readFileSync(
      'src/server/services/credentials.service.ts',
      'utf8',
    );
    expect(credentialsService).not.toContain('actorUserId ?? input.userId');
    expect(credentialsService).not.toContain('actorUserId ?? query.userId');

    expect(jobStreamRoutes).toContain('await findAuthorizedJob');
    expect(jobStreamRoutes).toContain('jobRepository.listJobEvents');
    expect(jobGovernance).toContain('projectRepository.getProjectMember');
    expect(jobGovernance).toContain("job.scope.type === 'project'");
    expect(jobGovernance).toContain('jobRepository.getJob');
    expect(jobGovernance).not.toContain('store.memberships.some');
    expect(jobGovernance).not.toContain('store.spaces.find');
    expect(jobGovernance).not.toContain('store.jobs.find');
  });

  it('keeps governed jobs on Prisma repositories instead of json runtime arrays', () => {
    const appWiring = readFileSync('src/server/app.ts', 'utf8');
    const jobRepository = readFileSync(
      'src/db/repositories/job.repository.ts',
      'utf8',
    );
    const jobsRoutes = readFileSync('src/server/routes/jobs.routes.ts', 'utf8');
    const jobRunner = readFileSync('src/server/jobs/job-runner.ts', 'utf8');
    const jobBus = readFileSync('src/server/jobs/job-bus.ts', 'utf8');
    const jobStreamRoutes = readFileSync('src/server/routes/job-stream.routes.ts', 'utf8');
    const auditService = readFileSync('src/server/services/audit.service.ts', 'utf8');
    const auditRepository = readFileSync(
      'src/db/repositories/audit.repository.ts',
      'utf8',
    );

    expect(jobRepository).toContain('createQueuedJobWithAudit');
    expect(jobRepository).toContain('scopeType');
    expect(jobRepository).toContain('scopeId');
    expect(jobRepository).toContain('listJobsForScope');
    expect(jobRepository).toContain('providerCredential.findUnique');
    expect(jobRepository).toContain('providerCredential.create');
    expect(jobRepository).toContain('providerCredential.update');
    expect(jobRepository).toContain('already belongs to another user');
    expect(jobRepository).toContain('jobEvent.create');
    expect(jobRepository).toContain('insertGovernanceAuditRecord');
    expect(jobRepository).not.toContain('JobRepository.getJob is not implemented');
    expect(jobRepository).not.toContain('@shared/contracts/');
    expect(auditRepository).toContain('auditLog.create');
    expect(auditRepository).toContain('listAuditRecordsByProject');
    expect(auditRepository).not.toContain('@shared/contracts/');

    expect(appWiring).toContain('createJobRepository');
    expect(appWiring).toContain('jobRepository');
    expect(appWiring).not.toContain('jobs: state.jobs');
    expect(appWiring).not.toContain('jobEvents: state.jobEvents');
    expect(appWiring).not.toContain('auditLogs: state.auditLogs');
    expect(appWiring).not.toContain('createJobBus(state.jobEvents');

    expect(jobsRoutes).not.toContain('store.jobs.push');
    expect(jobsRoutes).not.toContain('store.jobs.find');
    expect(jobsRoutes).not.toContain('store.jobs.filter');
    expect(jobsRoutes).not.toContain('store.persist');

    expect(jobRunner).toContain('jobRepository.recordJobLifecycleTransition');
    expect(jobRunner).not.toContain('jobRepository.updateJobStatus');
    expect(jobRunner).not.toContain('jobRepository.appendJobEvent');
    expect(jobRepository).toContain('insertJobEvent');
    expect(jobRepository).toContain('assertJobStatusTransition');
    expect(jobRepository).toContain('recordJobLifecycleTransition');
    expect(jobRunner).not.toContain('store.jobs.find');
    expect(jobRunner).not.toContain('store.persist');

    expect(jobBus).not.toContain('events.push');
    expect(jobBus).not.toContain('events.filter');
    expect(jobBus).not.toContain('persist()');
    expect(jobStreamRoutes).toContain('jobRepository.listJobEvents');

    expect(auditService).toContain('auditRepository.createAuditRecord');
    expect(auditService).toContain('auditRepository.listAuditRecordsByJob');
    expect(auditService).toContain('sanitizeAuditMetadata');
    expect(auditService).not.toContain('jobRepository.createAuditRecord');
    expect(auditService).not.toContain('jobRepository.listAuditRecordsByJob');
    expect(auditService).not.toContain('store.auditLogs');
  });

  it('keeps library asset authority in Prisma scoped repositories', () => {
    const appWiring = readFileSync('src/server/app.ts', 'utf8');
    const importService = readFileSync('src/server/services/import.service.ts', 'utf8');
    const libraryService = readFileSync('src/server/services/library.service.ts', 'utf8');
    const readingService = readFileSync('src/server/services/reading.service.ts', 'utf8');
    const notebookService = readFileSync('src/server/services/notebooks.service.ts', 'utf8');
    const projectDocsService = readFileSync('src/server/services/project-docs.service.ts', 'utf8');
    const libraryContract = readFileSync('src/shared/contracts/library.ts', 'utf8');
    const httpServer = readFileSync('src/server/http-server.ts', 'utf8');
    const libraryRepository = readFileSync(
      'src/db/repositories/library.repository.ts',
      'utf8',
    );
    const mapLibraryEntryBlock = libraryRepository.slice(
      libraryRepository.indexOf('function mapLibraryEntry'),
      libraryRepository.indexOf('function mapLibraryEntryView'),
    );

    expect(libraryRepository).toContain('scopeType');
    expect(libraryRepository).toContain('LibraryEntry_scope_asset_unique');
    expect(libraryRepository).toContain('PRAGMA foreign_keys = ON');
    expect(libraryRepository).toContain('Deprecated migration-only columns kept inert');
    expect(libraryRepository).not.toContain('update: {}');
    expect(libraryRepository).not.toContain('legacySpaceId:');
    expect(libraryRepository).not.toContain('legacyVisibility:');
    expect(mapLibraryEntryBlock).not.toContain('legacySpaceId');
    expect(mapLibraryEntryBlock).not.toContain('legacyVisibility');

    expect(appWiring).toContain('createBootstrappedLibraryRepository');
    expect(appWiring).toContain('resolveLegacyLibraryBootstrapInput');
    expect(appWiring).toContain('hadLegacyCollaborativeKeys');
    expect(appWiring).toContain("hasOwnProperty(parsed, 'writingDocs')");
    expect(appWiring).toContain('parsed.paperAssets');
    expect(appWiring).toContain('parsed.libraryEntries');
    expect(appWiring).not.toContain('state.paperAssets');
    expect(appWiring).not.toContain('state.libraryEntries');
    expect(appWiring).not.toContain('paperAssets: state.paperAssets');
    expect(appWiring).not.toContain('libraryEntries: state.libraryEntries');
    expect(appWiring).not.toContain('projectMembers: state.projectMembers');
    expect(appWiring).not.toContain('projects: state.projects');
    expect(appWiring).toContain('legacyCredentials');
    expect(appWiring).toContain('legacyWorkbenchSettings');
    expect(appWiring).not.toContain('state.credentials');
    expect(appWiring).not.toContain('state.workbenchSettings');

    expect(importService).toContain('libraryRepository.importScopedEntry');
    expect(importService).not.toContain('store.paperAssets');
    expect(importService).not.toContain('store.libraryEntries');
    expect(importService).not.toContain('storageKey: asset.storageKey');
    expect(importService).not.toContain('legacySpaceId');
    expect(importService).not.toContain('legacyVisibility');

    expect(libraryService).toContain('libraryRepository.listLibraryEntriesForScope');
    expect(libraryService).toContain('fileStore.readBuffer');
    expect(libraryService).not.toContain('store.paperAssets');
    expect(libraryService).not.toContain('store.libraryEntries');
    expect(libraryService).not.toContain('legacySpaceId');
    expect(libraryService).not.toContain('legacyVisibility');

    expect(readingService).toContain('libraryService.assertCanAccessEntry');
    expect(readingService).toContain('readingRepository.listProjectCommentsForEntry');
    expect(readingService).toContain('readingRepository.createProjectComment');
    expect(appWiring).toContain('createReadingRepository(prismaClient)');
    expect(appWiring).toContain('initializeReadingPersistence(prismaClient)');
    expect(appWiring).toContain('legacyConversations');
    expect(appWiring).toContain('legacyInsights');
    expect(appWiring).toContain('legacyNotes');
    expect(appWiring).not.toContain('conversations: state.conversations');
    expect(appWiring).not.toContain('insights: state.insights');
    expect(appWiring).not.toContain('notes: state.notes');
    expect(readingService).not.toContain('store.paperAssets');
    expect(readingService).not.toContain('store.libraryEntries');

    expect(notebookService).toContain('libraryService.assertCanAccessPaperAsset');
    expect(notebookService).not.toContain('store.paperAssets');
    expect(notebookService).not.toContain('store.libraryEntries');
    expect(projectDocsService).toMatch(/assertCanAccessEntry/);
    expect(projectDocsService).toMatch(/listLibraryEntriesForAsset/);
    expect(projectDocsService).not.toContain('store.paperAssets');
    expect(projectDocsService).not.toContain('store.libraryEntries');
    expect(libraryContract).not.toContain('storageKey?: string');
    expect(httpServer).toContain('const libraryEntryFileMatch = pathname.match');
    expect(httpServer).toContain('^\\/api\\/library\\/([^/]+)\\/file$');
  });

  it('does not synthesize PubMed records in the production connector', () => {
    const pubmedConnector = readFileSync('src/server/connectors/pubmed.connector.ts', 'utf8');

    expect(pubmedConnector).not.toContain('fallbackDiscoveryRecords');
    expect(pubmedConnector).not.toContain('buildFallbackLookup');
    expect(pubmedConnector).not.toContain('buildFallbackSearch');
    expect(pubmedConnector).not.toContain('Tumor board biomarkers for rapid review');
    expect(pubmedConnector).not.toContain('pmid:654321');
    expect(pubmedConnector).not.toContain('return fallbackResults');
    expect(pubmedConnector).not.toContain('return buildFallbackLookup');
    expect(pubmedConnector).not.toContain('Imported PMID paper');
    expect(pubmedConnector).not.toContain('Imported DOI paper');
    expect(pubmedConnector).not.toContain('PubMed result ${pmid}');
    expect(pubmedConnector).toContain('searchLivePubmed(trimmedQuery)');
  });

  it('keeps reading comments on explicit project authority instead of visibility-based sharing', () => {
    const readingRepository = readFileSync(
      'src/db/repositories/reading.repository.ts',
      'utf8',
    );
    const readingService = readFileSync('src/server/services/reading.service.ts', 'utf8');
    const httpServer = readFileSync('src/server/http-server.ts', 'utf8');
    const httpApi = readFileSync('src/server/http-api.ts', 'utf8');
    const httpClient = readFileSync('src/web/lib/http-client.ts', 'utf8');
    const readerPresenter = readFileSync('src/web/presenters/reader-presenter.ts', 'utf8');
    const readerPage = readFileSync('src/web/pages/reader-page.tsx', 'utf8');
    const migration = readFileSync(
      'prisma/migrations/20260511000000_reading_project_comments/migration.sql',
      'utf8',
    );
    const repositoryRuntimeListBlock = readingRepository.slice(
      readingRepository.indexOf('async listPrivateNotesForEntry'),
      readingRepository.indexOf('async saveGeneratedInsight'),
    );
    const serviceDetailBlock = readingService.slice(
      readingService.indexOf('const notes = await'),
      readingService.indexOf('const insights = await'),
    );

    expect(readingRepository).toContain('ProjectReadingComment');
    expect(readingRepository).toContain('createPrivateNote');
    expect(readingRepository).toContain('createProjectComment');
    expect(readingRepository).toContain('listPrivateNotesForEntry');
    expect(readingRepository).toContain('listProjectCommentsForEntry');
    expect(repositoryRuntimeListBlock).not.toContain('space_shared');
    expect(repositoryRuntimeListBlock).not.toContain('visibility');

    expect(migration).toContain('CREATE TABLE IF NOT EXISTS "ProjectReadingComment"');
    expect(migration).toContain('WHERE "Note"."visibility" = \'space_shared\'');
    expect(migration).toContain('AND "LibraryEntry"."scopeType" = \'project\'');

    expect(serviceDetailBlock).toContain('listPrivateNotesForEntry');
    expect(serviceDetailBlock).toContain('listProjectCommentsForEntry');
    expect(serviceDetailBlock).toContain('view.entry.scope.id');
    expect(readingService).toContain('Project comments require a project-scoped library entry.');
    expect(readingService).toContain('Project comments must use the project-comments endpoint instead of note visibility.');
    expect(readingService).not.toContain('includeSharedNotes');

    expect(httpClient).toContain('createProjectReadingComment');
    const httpClientProjectCommentMethod = httpClient.slice(
      httpClient.indexOf('createProjectReadingComment'),
      httpClient.indexOf('createSpace', httpClient.indexOf('createProjectReadingComment')),
    );
    expect(httpClientProjectCommentMethod).not.toContain('projectId');
    expect(httpClientProjectCommentMethod).not.toContain('visibility');
    expect(httpClientProjectCommentMethod).not.toContain('scopeType');
    expect(httpClientProjectCommentMethod).not.toContain('spaceId');
    expect(httpClient).not.toContain('visibility: "space_shared"');
    const httpServerProjectCommentHandler = httpServer.slice(
      httpServer.indexOf('pathname === "/api/reading/project-comments"'),
      httpServer.indexOf('pathname === "/api/reading/insights"'),
    );
    const httpServerNoteHandler = httpServer.slice(
      httpServer.indexOf('pathname === "/api/reading/notes"'),
      httpServer.indexOf('pathname === "/api/reading/project-comments"'),
    );
    const httpServerInsightHandler = httpServer.slice(
      httpServer.indexOf('pathname === "/api/reading/insights"'),
      httpServer.indexOf('const membershipsMatch', httpServer.indexOf('pathname === "/api/reading/insights"')),
    );
    const httpApiNoteHandler = httpApi.slice(
      httpApi.indexOf('const readingNoteMatch'),
      httpApi.indexOf('const projectReadingCommentMatch'),
    );
    const httpApiInsightHandler = httpApi.slice(
      httpApi.indexOf('const readingInsightMatch'),
      httpApi.indexOf('const writingDocumentMatch'),
    );
    expect(httpServerProjectCommentHandler).toContain('rejectProjectReadingCommentAuthorityQueryFields(actor, requestUrl)');
    expect(httpServerProjectCommentHandler).toContain('rejectProjectReadingCommentAuthorityBodyFields(actor, body)');
    expect(httpServerProjectCommentHandler).not.toContain('projectId: body.projectId');
    expect(httpServerNoteHandler).toContain('rejectReaderWriteAuthorityQueryFields(actor, requestUrl)');
    expect(httpServerNoteHandler).toContain('rejectReaderWriteAuthorityBodyFields(actor, body)');
    expect(httpServerNoteHandler).not.toContain('visibility: body.visibility');
    expect(httpServerInsightHandler).toContain('rejectReaderWriteAuthorityQueryFields(actor, requestUrl)');
    expect(httpServerInsightHandler).toContain('rejectReaderWriteAuthorityBodyFields(actor, body)');
    expect(httpApiNoteHandler).toContain('rejectReaderWriteAuthorityQueryFields(requiredActor, requestUrl)');
    expect(httpApiNoteHandler).toContain('rejectReaderWriteAuthorityBodyFields(requiredActor, requestBody)');
    expect(httpApiNoteHandler).not.toContain('visibility: payload.visibility');
    expect(httpApiInsightHandler).toContain('rejectReaderWriteAuthorityQueryFields(requiredActor, requestUrl)');
    expect(httpApiInsightHandler).toContain('rejectReaderWriteAuthorityBodyFields(requiredActor, requestBody)');
    expect(readerPresenter).not.toContain('NoteVisibility');
    expect(readerPage).not.toContain('note.visibility');
  });

  it('keeps credentials and settings ownership on the server-derived actor boundary', () => {
    const credentialsService = readFileSync(
      'src/server/services/credentials.service.ts',
      'utf8',
    );
    const credentialsRoutes = readFileSync(
      'src/server/routes/credentials.routes.ts',
      'utf8',
    );
    const workbenchHttpApi = readFileSync('src/server/http-api.ts', 'utf8');

    expect(credentialsService).not.toContain('actorUserId ?? input.userId');
    expect(credentialsService).not.toContain('actorUserId ?? query.userId');
    expect(credentialsRoutes).not.toContain('saveWorkbenchSettings(input)');
    expect(workbenchHttpApi).not.toContain('userId: DEFAULT_WORKBENCH_USER_ID');
    expect(workbenchHttpApi).toContain("requestUrl.searchParams.get('actorUserId')");
    expect(workbenchHttpApi).toContain('rejectLegacyIdentityBodyFields(requiredActor, requestBody)');
    expect(workbenchHttpApi).not.toContain('payload.actorUserId');
    expect(workbenchHttpApi).not.toContain('payload.userId');
  });

  it('keeps core domain slice contracts transport safe', () => {
    const sourceTextContract = readFileSync(
      'src/shared/contracts/source-text.ts',
      'utf8',
    );
    const readerAnnotationsContract = readFileSync(
      'src/shared/contracts/reader-annotations.ts',
      'utf8',
    );
    const notebookContract = readFileSync(
      'src/shared/contracts/notebook.ts',
      'utf8',
    );
    const projectDocsContract = readFileSync(
      'src/shared/contracts/project-docs.ts',
      'utf8',
    );
    const aiChatContract = readFileSync(
      'src/shared/contracts/ai-chat.ts',
      'utf8',
    );
    const combinedContracts = [
      sourceTextContract,
      readerAnnotationsContract,
      notebookContract,
      projectDocsContract,
      aiChatContract,
    ].join('\n');

    expect(sourceTextContract).toContain('SourceTextAvailabilityState');
    expect(sourceTextContract).toContain("'pdf_unavailable'");
    expect(sourceTextContract).toContain("'text_unavailable'");
    expect(sourceTextContract).toContain("'ocr_required'");
    expect(sourceTextContract).toContain('SourceTextRangeLocator');
    expect(sourceTextContract).not.toContain('storageKey');
    expect(sourceTextContract).not.toContain('checksum');

    expect(readerAnnotationsContract).toContain('ReaderAnnotationRecord');
    expect(readerAnnotationsContract).toContain('SourceContextRef');
    expect(readerAnnotationsContract).toContain('PublishReaderAnnotationToProjectRequest');
    expect(readerAnnotationsContract).toContain('targetLibraryEntryId');
    expect(readerAnnotationsContract).toContain('private_original');
    expect(readerAnnotationsContract).toContain('project_copy');
    expect(readerAnnotationsContract).not.toContain('createdByUserId');
    expect(readerAnnotationsContract).not.toContain('actorUserId');

    expect(notebookContract).toContain('ReaderNotebookBindingRecord');
    expect(notebookContract).toContain('GetReaderDefaultNotebookRequest');
    expect(notebookContract).toContain('NotebookSourceLinkRecord');
    expect(notebookContract).toContain('sourceLinks');
    expect(notebookContract).not.toContain('storageKey');
    expect(notebookContract).not.toContain('checksum');

    expect(projectDocsContract).toContain('ProjectDocCitationTarget');
    expect(projectDocsContract).toContain('libraryEntryId: string');
    expect(projectDocsContract).toContain('ProjectDocCitationOccurrence');
    expect(projectDocsContract).toContain('ProjectDocCitationLocatorSource');
    expect(projectDocsContract).toContain('PROJECT_SOURCE_ARCHIVE_BLOCKED');
    expect(projectDocsContract).not.toContain('storageKey');
    expect(projectDocsContract).not.toContain('checksum');

    expect(aiChatContract).toContain('AiChatRequestTraceRecord');
    expect(aiChatContract).toContain('AiChatRequestContextRefRecord');
    expect(aiChatContract).toContain('promptBuildVersion');
    expect(aiChatContract).toContain('overBudgetDecision');
    expect(aiChatContract).toContain('chipLabel');
    expect(aiChatContract).toContain('sourceTextArtifactRange');
    expect(aiChatContract).not.toContain('rawContext');
    expect(aiChatContract).not.toContain('rawSecret');
    expect(aiChatContract).not.toContain('providerPayload');

    expect(combinedContracts).not.toContain('@prisma/client');
    expect(combinedContracts).not.toContain('encryptedSecret');
    expect(combinedContracts).not.toContain('storageKey');
    expect(combinedContracts).not.toContain('checksum');
  });
});
