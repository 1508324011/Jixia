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
  createNotebookRepository,
  initializeNotebookPersistence,
  type CreateNotebookDocumentParams,
  type CreateNotebookDocumentVersionParams,
  type NotebookRepository,
  type PersistedNotebookCitationRecord,
  type PersistedNotebookDocumentRecord,
  type PersistedNotebookDocumentSnapshot,
} from './repositories/notebook.repository';

export {
  createProjectDocRepository,
  initializeProjectDocPersistence,
  type CreateProjectDocParams,
  type CreateProjectDocVersionParams,
  type PersistedProjectDocCitationRecord,
  type PersistedProjectDocPublishState,
  type PersistedProjectDocRecord,
  type PersistedProjectDocSnapshot,
  type ProjectDocRepository,
} from './repositories/project-doc.repository';

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
