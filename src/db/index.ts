export {
  createDatabaseConfig,
  createPrismaClient,
  databaseConfig,
  type JixiaPrismaClient,
  readDatabaseUrl,
} from './client';

export {
  createLibraryRepository,
  initializeLibraryPersistence,
  type BootstrapLegacyLibraryInput,
  type ImportScopedLibraryEntryParams,
  type LegacyLibraryAssetInput,
  type LegacyLibraryEntryInput,
  type LibraryRepository,
  type PersistedImportSourceType,
  type PersistedLibraryEntryRecord,
  type PersistedLibraryEntryView,
  type PersistedLibraryEntryVisibility,
  type PersistedLibraryScopeRef,
  type PersistedLibraryScopeType,
  type PersistedPaperAssetRecord,
  type UpsertLibraryEntryParams,
  type UpsertPaperAssetParams,
} from './repositories/library.repository';

export {
  createProjectRepository,
  initializeProjectPersistence,
  type AddProjectMemberParams,
  type CreateProjectParams,
  type PersistedProjectMemberRecord,
  type PersistedProjectRecord,
  type PersistedProjectRole,
  type PersistedProjectStatus,
  type PersistedProjectWithMembership,
  type ProjectRepository,
} from './repositories/project.repository';

export {
  createSpaceRepository,
  initializeSpacePersistence,
  type AddSpaceMembershipParams,
  type CreateSpaceParams,
  type MembershipLookup,
  type PersistedSpaceKind,
  type PersistedSpaceMembershipRecord,
  type PersistedSpaceRecord,
  type PersistedSpaceRole,
  type SpaceRepository,
} from './repositories/space.repository';
