import { existsSync, readFileSync } from 'node:fs';

import { describe, expect, it } from 'vitest';

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
    expect(schema).toMatch(/model Project[\s\S]*\n\s+spaceId\s+String/);
    expect(schema).toMatch(
      /model ProjectMember[\s\S]*@@unique\(\[projectId, userId\]\)/,
    );
    expect(schema).toMatch(
      /model Membership[\s\S]*@@unique\(\[spaceId, userId\]\)/,
    );
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
    expect(existsSync('src/db/repositories/job.repository.ts')).toBe(true);
    expect(clientEntrypoint).toContain('PrismaClient');
    expect(clientEntrypoint).toContain('createPrismaClient');
    expect(dbIndex).toContain('createProjectRepository');
    expect(dbIndex).toContain('createSpaceRepository');
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
    const jobRepository = readFileSync(
      'src/db/repositories/job.repository.ts',
      'utf8',
    );

    expect(projectRepository).not.toContain('@shared/contracts/');
    expect(spaceRepository).not.toContain('@shared/contracts/');
    expect(libraryRepository).not.toContain('@shared/contracts/');
    expect(jobRepository).not.toContain('@shared/contracts/');
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
    const spaceService = readFileSync('src/server/services/spaces.service.ts', 'utf8');

    expect(spaceService).not.toContain('store.spaces.push');
    expect(spaceService).not.toContain('store.memberships.push');
    expect(spaceService).not.toContain('store.spaces.filter');
    expect(spaceService).not.toContain('store.memberships.filter');
    expect(spaceService).toContain('repository.listSpacesForActor');
    expect(spaceService).toContain('repository.listMemberships');
    expect(spaceService).toContain('repository.getMembership');
  });
});
