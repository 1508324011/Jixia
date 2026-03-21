import { existsSync, readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

describe('prisma schema', () => {
  it('declares core bounded-context models', () => {
    const schema = readFileSync('prisma/schema.prisma', 'utf8');

    expect(schema).toContain('model User');
    expect(schema).toContain('model Space');
    expect(schema).toContain('model Membership');
    expect(schema).toContain('model PaperAsset');
    expect(schema).toContain('model LibraryEntry');
    expect(schema).toContain('model Note');
    expect(schema).toContain('model ReadingState');
    expect(schema).toContain('model Conversation');
    expect(schema).toContain('model WritingDoc');
    expect(schema).toContain('model DocVersion');
    expect(schema).toContain('model CitationLink');
    expect(schema).toContain('model ProviderCredential');
    expect(schema).toContain('model Job');
    expect(schema).toContain('model JobEvent');
    expect(schema).toContain('model AuditLog');

    expect(schema).toMatch(/model Space[\s\S]*\n\s+kind\s+SpaceKind/);
    expect(schema).toMatch(/model Note[\s\S]*\n\s+libraryEntryId\s+String/);
    expect(schema).toMatch(
      /model Conversation[\s\S]*\n\s+libraryEntryId\s+String/,
    );
    expect(schema).toMatch(
      /model CitationLink[\s\S]*\n\s+docVersionId\s+String/,
    );
    expect(schema).toMatch(
      /model CitationLink[\s\S]*\n\s+paperAssetId\s+String/,
    );
    expect(schema).toMatch(/model Job[\s\S]*\n\s+credentialRef\s+String/);
  });

  it('creates typed database entrypoints and repositories', () => {
    expect(existsSync('src/db/client.ts')).toBe(true);
    expect(existsSync('src/db/index.ts')).toBe(true);
    expect(existsSync('src/db/repositories/space.repository.ts')).toBe(true);
    expect(existsSync('src/db/repositories/library.repository.ts')).toBe(true);
    expect(existsSync('src/db/repositories/job.repository.ts')).toBe(true);
  });

  it('keeps db repositories decoupled from shared transport contracts', () => {
    const spaceRepository = readFileSync(
      'src/db/repositories/space.repository.ts',
      'utf8',
    );
    const libraryRepository = readFileSync(
      'src/db/repositories/library.repository.ts',
      'utf8',
    );
    const jobRepository = readFileSync(
      'src/db/repositories/job.repository.ts',
      'utf8',
    );

    expect(spaceRepository).not.toContain('@shared/contracts/');
    expect(libraryRepository).not.toContain('@shared/contracts/');
    expect(jobRepository).not.toContain('@shared/contracts/');
  });
});
