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
    expect(schema).toContain('model ProjectReadingComment');
    expect(schema).toContain('model ReadingState');
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

    expect(schema).toMatch(/model Space[\s\S]*\n\s+kind\s+SpaceKind/);
    expect(schema).toMatch(/model Project[\s\S]*\n\s+spaceId\s+String/);
    expect(schema).toMatch(/model LibraryEntry[\s\S]*\n\s+scopeType\s+String/);
    expect(schema).toMatch(/model LibraryEntry[\s\S]*\n\s+scopeId\s+String/);
    expect(schema).toMatch(
      /model LibraryEntry[\s\S]*@@unique\(\[scopeType, scopeId, paperAssetId\]/,
    );
    expect(schema).toMatch(/model PaperAsset[\s\S]*\n\s+canonicalId\s+String\s+@unique/);
    expect(schema).toMatch(/model PaperAsset[\s\S]*@@index\(\[checksum\]\)/);
    expect(
      existsSync('prisma/migrations/20260519000000_paper_asset_checksum_index/migration.sql'),
    ).toBe(true);
    expect(
      readFileSync(
        'prisma/migrations/20260519000000_paper_asset_checksum_index/migration.sql',
        'utf8',
      ),
    ).toContain('PaperAsset_checksum_idx');
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
    expect(schema).toMatch(/model NotebookDocument[\s\S]*\n\s+ownerId\s+String/);
    expect(schema).toMatch(
      /model NotebookDocumentVersion[\s\S]*@@unique\(\[notebookDocumentId, versionNumber\]\)/,
    );
    expect(schema).toMatch(
      /model NotebookDocumentCitation[\s\S]*\n\s+notebookDocumentVersionId\s+String/,
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
    expect(existsSync('src/db/repositories/credentials.repository.ts')).toBe(true);
    expect(existsSync('src/db/repositories/reading.repository.ts')).toBe(true);
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
    expect(dbIndex).toContain('createNotebookRepository');
    expect(dbIndex).toContain('createProjectDocRepository');
    expect(dbIndex).toContain('createJobRepository');
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
    const credentialsRepository = readFileSync(
      'src/db/repositories/credentials.repository.ts',
      'utf8',
    );

    expect(projectRepository).not.toContain('@shared/contracts/');
    expect(spaceRepository).not.toContain('@shared/contracts/');
    expect(libraryRepository).not.toContain('@shared/contracts/');
    expect(notebookRepository).not.toContain('@shared/contracts/');
    expect(projectDocRepository).not.toContain('@shared/contracts/');
    expect(jobRepository).not.toContain('@shared/contracts/');
    expect(credentialsRepository).not.toContain('@shared/contracts/');
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
    expect(serializedStateBlock).not.toContain('credentials: state.legacyCredentials');
    expect(serializedStateBlock).not.toContain('workbenchSettings: state.legacyWorkbenchSettings');
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

    expect(jobRepository).toContain('createQueuedJobWithAudit');
    expect(jobRepository).toContain('scopeType');
    expect(jobRepository).toContain('scopeId');
    expect(jobRepository).toContain('listJobsForScope');
    expect(jobRepository).toContain('providerCredential.findUnique');
    expect(jobRepository).toContain('providerCredential.create');
    expect(jobRepository).toContain('providerCredential.update');
    expect(jobRepository).toContain('already belongs to another user');
    expect(jobRepository).toContain('jobEvent.create');
    expect(jobRepository).toContain('auditLog.create');
    expect(jobRepository).not.toContain('JobRepository.getJob is not implemented');
    expect(jobRepository).not.toContain('@shared/contracts/');

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

    expect(auditService).toContain('jobRepository.createAuditRecord');
    expect(auditService).toContain('jobRepository.listAuditRecordsByJob');
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

    expect(libraryRepository).toContain('scopeType');
    expect(libraryRepository).toContain('LibraryEntry_scope_asset_unique');
    expect(libraryRepository).toContain('PRAGMA foreign_keys = ON');
    expect(libraryRepository).not.toContain('update: {}');

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

    expect(importService).toContain('libraryRepository.importScopedEntry');
    expect(importService).not.toContain('store.paperAssets');
    expect(importService).not.toContain('store.libraryEntries');
    expect(importService).not.toContain('storageKey: asset.storageKey');

    expect(libraryService).toContain('libraryRepository.listLibraryEntriesForScope');
    expect(libraryService).toContain('fileStore.readBuffer');
    expect(libraryService).not.toContain('store.paperAssets');
    expect(libraryService).not.toContain('store.libraryEntries');

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

  it('keeps reading comments on explicit project authority instead of visibility-based sharing', () => {
    const readingRepository = readFileSync(
      'src/db/repositories/reading.repository.ts',
      'utf8',
    );
    const readingService = readFileSync('src/server/services/reading.service.ts', 'utf8');
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
    expect(httpClient).not.toContain('visibility: "space_shared"');
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
});
