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
    expect(schema).toMatch(/model LibraryEntry[\s\S]*\n\s+scopeType\s+String/);
    expect(schema).toMatch(/model LibraryEntry[\s\S]*\n\s+scopeId\s+String/);
    expect(schema).toMatch(
      /model LibraryEntry[\s\S]*@@unique\(\[scopeType, scopeId, paperAssetId\]/,
    );
    expect(schema).toMatch(/model PaperAsset[\s\S]*\n\s+canonicalId\s+String\s+@unique/);
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
    expect(
      existsSync(
        'prisma/migrations/20260504000000_scoped_library_entries/migration.sql',
      ),
    ).toBe(true);
    expect(clientEntrypoint).toContain('PrismaClient');
    expect(clientEntrypoint).toContain('createPrismaClient');
    expect(dbIndex).toContain('createProjectRepository');
    expect(dbIndex).toContain('createSpaceRepository');
    expect(dbIndex).toContain('createLibraryRepository');
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

  it('cuts targeted server flows over to repository-backed space authority', () => {
    const appWiring = readFileSync('src/server/app.ts', 'utf8');
    const importService = readFileSync('src/server/services/import.service.ts', 'utf8');
    const libraryService = readFileSync('src/server/services/library.service.ts', 'utf8');
    const readingService = readFileSync('src/server/services/reading.service.ts', 'utf8');
    const writingService = readFileSync('src/server/services/writing.service.ts', 'utf8');
    const jobsRoutes = readFileSync('src/server/routes/jobs.routes.ts', 'utf8');
    const jobStreamRoutes = readFileSync('src/server/routes/job-stream.routes.ts', 'utf8');
    const jobGovernance = readFileSync('src/server/jobs/job-governance.ts', 'utf8');

    expect(appWiring).not.toContain('memberships: state.memberships');
    expect(appWiring).not.toContain('spaces: state.spaces');

    expect(importService).toContain('libraryRepository.importScopedEntry');
    expect(importService).not.toContain('actorUserId ?? input.requestedByUserId');
    expect(importService).not.toContain('store.memberships.some');
    expect(importService).not.toContain('store.spaces.find');

    expect(libraryService).toContain('projectRepository.getProjectMember');
    expect(libraryService).not.toContain('store.memberships.some');
    expect(libraryService).not.toContain('store.spaces.find');

    expect(readingService).toContain('libraryService.assertCanAccessEntry');
    expect(readingService).not.toContain('actorUserId ?? input.authorUserId');
    expect(readingService).not.toContain('actorUserId ?? input.startedByUserId');
    expect(readingService).not.toContain('store.memberships.some');
    expect(readingService).not.toContain('store.spaces.find');

    expect(writingService).toContain('spaceRepository.denyNonMember');
    expect(writingService).not.toContain('store.memberships.some');
    expect(writingService).not.toContain('store.spaces.some');

    expect(jobsRoutes).toContain('spaceRepository.denyNonMember');
    expect(jobsRoutes).not.toContain('actorUserId ?? input.requestedByUserId');
    expect(jobsRoutes).not.toContain('store.memberships.some');
    expect(jobsRoutes).not.toContain('store.spaces.find');

    expect(jobStreamRoutes).toContain('await findAuthorizedJob');
    expect(jobGovernance).toContain('spaceRepository.denyNonMember');
    expect(jobGovernance).not.toContain('store.memberships.some');
    expect(jobGovernance).not.toContain('store.spaces.find');
  });

  it('keeps library asset authority in Prisma scoped repositories', () => {
    const appWiring = readFileSync('src/server/app.ts', 'utf8');
    const importService = readFileSync('src/server/services/import.service.ts', 'utf8');
    const libraryService = readFileSync('src/server/services/library.service.ts', 'utf8');
    const readingService = readFileSync('src/server/services/reading.service.ts', 'utf8');
    const writingService = readFileSync('src/server/services/writing.service.ts', 'utf8');
    const versioningService = readFileSync('src/server/services/versioning.service.ts', 'utf8');
    const libraryRepository = readFileSync(
      'src/db/repositories/library.repository.ts',
      'utf8',
    );

    expect(libraryRepository).toContain('scopeType');
    expect(libraryRepository).toContain('LibraryEntry_scope_asset_unique');
    expect(libraryRepository).toContain('PRAGMA foreign_keys = ON');
    expect(libraryRepository).not.toContain('update: {}');

    expect(appWiring).toContain('createBootstrappedLibraryRepository');
    expect(appWiring).toContain('resolveLegacyLibraryBootstrapInput');
    expect(appWiring).toContain('parsed.paperAssets');
    expect(appWiring).toContain('parsed.libraryEntries');
    expect(appWiring).not.toContain('state.paperAssets');
    expect(appWiring).not.toContain('state.libraryEntries');
    expect(appWiring).not.toContain('paperAssets: state.paperAssets');
    expect(appWiring).not.toContain('libraryEntries: state.libraryEntries');

    expect(importService).toContain('libraryRepository.importScopedEntry');
    expect(importService).not.toContain('store.paperAssets');
    expect(importService).not.toContain('store.libraryEntries');

    expect(libraryService).toContain('libraryRepository.listLibraryEntriesForScope');
    expect(libraryService).not.toContain('store.paperAssets');
    expect(libraryService).not.toContain('store.libraryEntries');

    expect(readingService).toContain('libraryService.assertCanAccessEntry');
    expect(readingService).not.toContain('store.paperAssets');
    expect(readingService).not.toContain('store.libraryEntries');

    expect(writingService).not.toContain('paperAssets');
    expect(versioningService).toMatch(
      /store\.libraryService\s*\.assertCanAccessEntry/,
    );
    expect(versioningService).toContain('store.libraryService.assertCanAccessPaperAsset');
    expect(versioningService).not.toContain('store.paperAssets');
  });
});
