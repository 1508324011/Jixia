export {
  createDatabaseConfig,
  createPrismaClient,
  databaseConfig,
  type JixiaPrismaClient,
  readDatabaseUrl,
} from './client';

export {
  createCredentialsRepository,
  initializeCredentialPersistence,
  type BootstrapLegacyCredentialAuthorityInput,
  type CreatePersistedCredentialParams,
  type CredentialSecretLookup,
  type CredentialsRepository,
  type LegacyCredentialBootstrapInput,
  type LegacyWorkbenchSettingsBootstrapInput,
  type PersistedCredentialRecord,
  type PersistedCredentialWithSecretRecord,
  type PersistedDefaultImportTarget,
  type PersistedEncryptedSecretRecord,
  type PersistedWorkbenchSettingsRecord,
  type UpsertWorkbenchSettingsParams,
} from './repositories/credentials.repository';

export {
  createJobRepository,
  initializeJobPersistence,
  type AppendJobEventParams,
  type CreateAuditRecordParams,
  type CreateJobParams,
  type CreateProviderCredentialReferenceParams,
  type CreateQueuedJobWithAuditParams,
  type JobLookup,
  type JobRepository,
  type ListJobsForScopeQuery,
  type PersistedJobLifecycleTransition,
  type PersistedAuditLogRecord,
  type PersistedJobEventRecord,
  type PersistedJobRecord,
  type PersistedJobScopeRef,
  type PersistedJobScopeType,
  type PersistedJobStatus,
  type PersistedProviderCredentialReferenceRecord,
  type PersistedQueuedJobWithAudit,
  type RecordJobLifecycleTransitionParams,
} from './repositories/job.repository';
export {
  assertJobStatusTransition,
  canTransitionJobStatus,
  isTerminalJobStatus,
  type GuardedJobStatus,
} from './repositories/job-status-transitions';

export {
  createLibraryRepository,
  initializeLibraryPersistence,
  type AdoptExistingLibraryEntryParams,
  type AdoptExistingLibraryEntryResult,
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
  createReadingRepository,
  initializeReadingPersistence,
  type CreatePersistedConversationParams,
  type CreatePersistedNoteParams,
  type CreatePersistedProjectReadingCommentParams,
  type ListEntryNotesQuery,
  type ListProjectCommentsQuery,
  type PersistedConversationRecord,
  type PersistedEvidenceSpanRecord,
  type PersistedGeneratedInsightRecord,
  type PersistedNoteRecord,
  type PersistedNoteVisibility,
  type PersistedProjectReadingCommentRecord,
  type PersistedReadingStateRecord,
  type ReadingRepository,
  type SavePersistedGeneratedInsightParams,
  type TouchReadingStateParams,
} from './repositories/reading.repository';

export {
  createSessionRepository,
  initializeSessionPersistence,
  type CreateUserSessionParams,
  type PersistedSessionUserRecord,
  type PersistedUserSessionRecord,
  type PersistedUserSessionWithUserRecord,
  type SeedUserParams,
  type SessionRepository,
} from './repositories/session.repository';

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
