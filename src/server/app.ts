import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import type { GeneratedInsightRecord } from '@shared/contracts/evidence';
import type { ConversationRecord, NoteRecord } from '@shared/contracts/reading';
import type { SpaceMembership } from '@shared/contracts/spaces';

import {
  createPrismaClient,
  createCredentialsRepository,
  createJobRepository,
  createNotebookRepository,
  createProjectDocRepository,
  createLibraryRepository,
  createProjectRepository,
  createReadingRepository,
  createSessionRepository,
  initializeReadingPersistence,
  createSpaceRepository,
  type BootstrapLegacyCredentialAuthorityInput,
  type BootstrapLegacyLibraryInput,
  type CredentialsRepository,
  type JobRepository,
  type LegacyCredentialBootstrapInput,
  type LegacyWorkbenchSettingsBootstrapInput,
  type LibraryRepository,
  readDatabaseUrl,
} from '../db';
import {
  createArxivConnector,
  type ArxivConnector,
} from './connectors/arxiv.connector';
import {
  createPubmedConnector,
  type PubmedConnector,
} from './connectors/pubmed.connector';
import {
  createCredentialsRoutes,
  type CredentialsRoutes,
} from './routes/credentials.routes';
import {
  createSessionRoutes,
  type SessionRoutes,
} from './routes/session.routes';
import {
  createImportRoutes,
  type ImportRoutes,
} from './routes/import.routes';
import {
  createJobsRoutes,
  type JobsRoutes,
} from './routes/jobs.routes';
import {
  createJobStreamRoutes,
  type JobStreamRoutes,
} from './routes/job-stream.routes';
import {
  createLibraryRoutes,
  type LibraryRoutes,
} from './routes/library.routes';
import {
  createNotebooksRoutes,
  type NotebooksRoutes,
} from './routes/notebooks.routes';
import {
  createProjectDocsRoutes,
  type ProjectDocsRoutes,
} from './routes/project-docs.routes';
import {
  createReadingRoutes,
  type ReadingRoutes,
} from './routes/reading.routes';
import {
  createHealthRoutes,
  type HealthRoutes,
} from './routes/health.routes';
import {
  createProjectsRoutes,
  type ProjectsRoutes,
} from './routes/projects.routes';
import {
  createSpacesRoutes,
  type SpacesRoutes,
} from './routes/spaces.routes';
import {
  createCredentialsService,
} from './services/credentials.service';
import { createSessionService } from './services/session.service';
import { createSecretBox, hasSecretBoxKey } from './security/secret-box';
import { createAuditService } from './services/audit.service';
import { createImportService } from './services/import.service';
import { createJobBus } from './jobs/job-bus';
import { createJobRunner } from './jobs/job-runner';
import { createLibraryService } from './services/library.service';
import { createNotebookService } from './services/notebooks.service';
import { createProjectDocsService } from './services/project-docs.service';
import { createReadingService } from './services/reading.service';
import {
  createProjectsService,
} from './services/projects.service';
import {
  createSpacesService,
  type StoredSpace,
} from './services/spaces.service';
import { createFileStore } from './storage/file-store';
import {
  resolveStorageRoot,
  type StorageRootEnv,
} from './storage/storage-root';

const APP_STATE_FILE = 'server-state.json';
const CREDENTIAL_AUTHORITY_BOOTSTRAP_MARKER_FILE =
  '.credential-authority-prisma-bootstrap-complete';
const LIBRARY_BOOTSTRAP_MARKER_FILE = '.library-prisma-bootstrap-complete';

interface LegacyReadingStateRecord {
  lastReadAt: string;
  libraryEntryId: string;
  progressPercent: number;
  userId: string;
}

export interface CreateJixiaAppOptions {
  connectors?: {
    arxiv?: ArxivConnector;
    pubmed?: PubmedConnector;
  };
  env?: JixiaAppEnv;
}

export interface JixiaAppEnv extends StorageRootEnv {
  JIXIA_DATABASE_URL?: string;
  NODE_ENV?: string;
}

export interface JixiaAppState {
  legacyConversations: ConversationRecord[];
  legacyCredentials: LegacyCredentialBootstrapInput[];
  legacyInsights: GeneratedInsightRecord[];
  legacyLibraryEntries: LegacyStoredLibraryEntry[];
  legacyNotes: NoteRecord[];
  legacyReadingStates: LegacyReadingStateRecord[];
  legacyPaperAssets: LegacyStoredPaperAsset[];
  legacyWorkbenchSettings: LegacyWorkbenchSettingsBootstrapInput[];
  memberships: SpaceMembership[];
  nextSequence: number;
  spaces: StoredSpace[];
}

type SerializedJixiaAppState = Partial<
  Omit<
    JixiaAppState,
    | 'legacyCredentials'
    | 'legacyLibraryEntries'
    | 'legacyPaperAssets'
    | 'legacyWorkbenchSettings'
  >
> & {
  citationLinks?: unknown;
  docVersions?: unknown;
  libraryEntries?: LegacyStoredLibraryEntry[];
  conversations?: ConversationRecord[];
  credentials?: LegacyCredentialBootstrapInput[];
  insights?: GeneratedInsightRecord[];
  notes?: NoteRecord[];
  readingStates?: LegacyReadingStateRecord[];
  paperAssets?: LegacyStoredPaperAsset[];
  projectMembers?: unknown;
  projects?: unknown;
  workbenchSettings?: LegacyWorkbenchSettingsBootstrapInput[];
  writingDocs?: unknown;
};

interface LoadedJixiaAppState {
  hadLegacyCollaborativeKeys: boolean;
  hadLegacyReadingKeys: boolean;
  state: JixiaAppState;
}

interface LegacyStoredPaperAsset {
  abstractText?: string;
  canonicalId: string;
  createdAt: string;
  id: string;
  importedByUserId: string;
  storageKey?: string;
  title: string;
}

interface LegacyStoredLibraryEntry {
  addedAt: string;
  id: string;
  paperAssetId: string;
  spaceId: string;
  visibility: 'private' | 'space_shared' | 'published_to_project';
}

export interface JixiaApp {
  close(): Promise<void>;
  credentials: CredentialsRoutes;
  health: HealthRoutes;
  imports: ImportRoutes;
  jobs: JobsRoutes;
  jobStream: JobStreamRoutes;
  library: LibraryRoutes;
  notebooks: NotebooksRoutes;
  projectDocs: ProjectDocsRoutes;
  projects: ProjectsRoutes;
  reading: ReadingRoutes;
  session: SessionRoutes;
  spaces: SpacesRoutes;
}

function createState(): JixiaAppState {
  return {
    legacyConversations: [],
    legacyCredentials: [],
    legacyInsights: [],
    legacyLibraryEntries: [],
    legacyNotes: [],
    legacyReadingStates: [],
    legacyPaperAssets: [],
    legacyWorkbenchSettings: [],
    memberships: [],
    nextSequence: 0,
    spaces: [],
  };
}

function hasOwnProperty(
  value: object,
  key: PropertyKey,
): boolean {
  return Object.prototype.hasOwnProperty.call(value, key);
}

function resolveAppStatePath(env: StorageRootEnv = process.env): string {
  return join(resolveStorageRoot(env), APP_STATE_FILE);
}

function resolveLibraryBootstrapMarkerPath(
  env: StorageRootEnv = process.env,
): string {
  return join(resolveStorageRoot(env), LIBRARY_BOOTSTRAP_MARKER_FILE);
}

function resolveCredentialAuthorityBootstrapMarkerPath(
  env: StorageRootEnv = process.env,
): string {
  return join(resolveStorageRoot(env), CREDENTIAL_AUTHORITY_BOOTSTRAP_MARKER_FILE);
}

function loadState(env: StorageRootEnv = process.env): LoadedJixiaAppState {
  const initialState = createState();
  const statePath = resolveAppStatePath(env);

  if (!existsSync(statePath)) {
    return {
      hadLegacyCollaborativeKeys: false,
      hadLegacyReadingKeys: false,
      state: initialState,
    };
  }

  const parsed = JSON.parse(readFileSync(statePath, 'utf8')) as SerializedJixiaAppState;
  const hadLegacyCollaborativeKeys =
    hasOwnProperty(parsed, 'projects') ||
    hasOwnProperty(parsed, 'projectMembers') ||
    hasOwnProperty(parsed, 'writingDocs') ||
    hasOwnProperty(parsed, 'docVersions') ||
    hasOwnProperty(parsed, 'citationLinks');
  const hadLegacyReadingKeys =
    hasOwnProperty(parsed, 'conversations') ||
    hasOwnProperty(parsed, 'insights') ||
    hasOwnProperty(parsed, 'notes') ||
    hasOwnProperty(parsed, 'readingStates');

  return {
    hadLegacyCollaborativeKeys,
    hadLegacyReadingKeys,
    state: {
      legacyConversations:
        parsed.conversations ?? initialState.legacyConversations,
      legacyCredentials:
        parsed.credentials ?? initialState.legacyCredentials,
      legacyInsights: parsed.insights ?? initialState.legacyInsights,
      legacyLibraryEntries:
        parsed.libraryEntries ?? initialState.legacyLibraryEntries,
      legacyNotes: parsed.notes ?? initialState.legacyNotes,
      legacyReadingStates:
        parsed.readingStates ?? initialState.legacyReadingStates,
      legacyPaperAssets: parsed.paperAssets ?? initialState.legacyPaperAssets,
      legacyWorkbenchSettings:
        parsed.workbenchSettings ?? initialState.legacyWorkbenchSettings,
      memberships: parsed.memberships ?? initialState.memberships,
      nextSequence: parsed.nextSequence ?? initialState.nextSequence,
      spaces: parsed.spaces ?? initialState.spaces,
    },
  };
}

function persistState(
  state: JixiaAppState,
  env: StorageRootEnv = process.env,
): void {
  const rootDirectory = resolveStorageRoot(env);
  const memberships = state.memberships;
  const spaces = state.spaces;

  mkdirSync(rootDirectory, { recursive: true });
  const serializedState: SerializedJixiaAppState = {
    conversations: state.legacyConversations,
    insights: state.legacyInsights,
    libraryEntries: state.legacyLibraryEntries,
    memberships,
    nextSequence: state.nextSequence,
    notes: state.legacyNotes,
    paperAssets: state.legacyPaperAssets,
    readingStates: state.legacyReadingStates,
    spaces,
  };

  writeFileSync(resolveAppStatePath(env), JSON.stringify(serializedState, null, 2));
}

function markLibraryBootstrapComplete(
  env: StorageRootEnv = process.env,
): void {
  const rootDirectory = resolveStorageRoot(env);

  mkdirSync(rootDirectory, { recursive: true });
  writeFileSync(
    resolveLibraryBootstrapMarkerPath(env),
    JSON.stringify({ completedAt: new Date().toISOString() }, null, 2),
  );
}

function markCredentialAuthorityBootstrapComplete(
  env: StorageRootEnv = process.env,
): void {
  const rootDirectory = resolveStorageRoot(env);

  mkdirSync(rootDirectory, { recursive: true });
  writeFileSync(
    resolveCredentialAuthorityBootstrapMarkerPath(env),
    JSON.stringify({ completedAt: new Date().toISOString() }, null, 2),
  );
}

function nextId(state: JixiaAppState, prefix: string): string {
  state.nextSequence += 1;

  return `${prefix}-${state.nextSequence}`;
}

function resolveAppDatabaseUrl(env: JixiaAppEnv = process.env): string {
  const configuredDatabaseUrl = env.JIXIA_DATABASE_URL?.trim();

  if (configuredDatabaseUrl) {
    return configuredDatabaseUrl;
  }

  if (env.JIXIA_STORAGE_ROOT?.trim()) {
    return `file:${join(resolveStorageRoot(env), 'jixia.db')}`;
  }

  return readDatabaseUrl(env as NodeJS.ProcessEnv);
}

function hasLegacyLibraryBootstrapInput(
  state: Pick<JixiaAppState, 'legacyLibraryEntries' | 'legacyPaperAssets'>,
): boolean {
  return state.legacyPaperAssets.length > 0 || state.legacyLibraryEntries.length > 0;
}

function resolveLegacyLibraryBootstrapInput(
  state: Pick<JixiaAppState, 'legacyLibraryEntries' | 'legacyPaperAssets'>,
  libraryBootstrapMarkerExists: boolean,
): BootstrapLegacyLibraryInput {
  if (libraryBootstrapMarkerExists || !hasLegacyLibraryBootstrapInput(state)) {
    return {
      assets: [],
      entries: [],
    };
  }

  return {
    assets: state.legacyPaperAssets,
    entries: state.legacyLibraryEntries,
  };
}

function clearLegacyLibraryState(
  state: Pick<JixiaAppState, 'legacyLibraryEntries' | 'legacyPaperAssets'>,
): boolean {
  if (!hasLegacyLibraryBootstrapInput(state)) {
    return false;
  }

  state.legacyLibraryEntries = [];
  state.legacyPaperAssets = [];

  return true;
}

function hasLegacyReadingBootstrapInput(
  state: Pick<
    JixiaAppState,
    'legacyConversations' | 'legacyInsights' | 'legacyNotes' | 'legacyReadingStates'
  >,
): boolean {
  return (
    state.legacyConversations.length > 0 ||
    state.legacyInsights.length > 0 ||
    state.legacyNotes.length > 0 ||
    state.legacyReadingStates.length > 0
  );
}

function clearLegacyReadingState(
  state: Pick<
    JixiaAppState,
    'legacyConversations' | 'legacyInsights' | 'legacyNotes' | 'legacyReadingStates'
  >,
): boolean {
  if (!hasLegacyReadingBootstrapInput(state)) {
    return false;
  }

  state.legacyConversations = [];
  state.legacyInsights = [];
  state.legacyNotes = [];
  state.legacyReadingStates = [];

  return true;
}

function hasLegacyCredentialBootstrapInput(
  state: Pick<JixiaAppState, 'legacyCredentials' | 'legacyWorkbenchSettings'>,
): boolean {
  return state.legacyCredentials.length > 0 || state.legacyWorkbenchSettings.length > 0;
}

function resolveLegacyCredentialBootstrapInput(
  state: Pick<JixiaAppState, 'legacyCredentials' | 'legacyWorkbenchSettings'>,
  credentialAuthorityBootstrapMarkerExists: boolean,
): BootstrapLegacyCredentialAuthorityInput {
  if (
    credentialAuthorityBootstrapMarkerExists ||
    !hasLegacyCredentialBootstrapInput(state)
  ) {
    return {
      credentials: [],
      workbenchSettings: [],
    };
  }

  return {
    credentials: state.legacyCredentials,
    workbenchSettings: state.legacyWorkbenchSettings,
  };
}

function clearLegacyCredentialState(
  state: Pick<JixiaAppState, 'legacyCredentials' | 'legacyWorkbenchSettings'>,
): boolean {
  if (!hasLegacyCredentialBootstrapInput(state)) {
    return false;
  }

  state.legacyCredentials = [];
  state.legacyWorkbenchSettings = [];

  return true;
}

async function bootstrapLegacyReadingState(
  readingRepository: ReturnType<typeof createReadingRepository>,
  state: Pick<
    JixiaAppState,
    'legacyConversations' | 'legacyInsights' | 'legacyNotes' | 'legacyReadingStates'
  >,
): Promise<boolean> {
  if (!hasLegacyReadingBootstrapInput(state)) {
    return false;
  }

  for (const conversation of state.legacyConversations) {
    await readingRepository.createConversation({
      createdAt: conversation.createdAt,
      id: conversation.id,
      libraryEntryId: conversation.libraryEntryId,
      startedByUserId: conversation.startedByUserId,
      title: conversation.title,
    });
  }

  for (const note of state.legacyNotes) {
    await readingRepository.createNote({
      authorUserId: note.authorUserId,
      body: note.body,
      createdAt: note.createdAt,
      id: note.id,
      libraryEntryId: note.libraryEntryId,
      visibility: note.visibility,
    });
  }

  for (const insight of state.legacyInsights) {
    await readingRepository.saveGeneratedInsight({
      conversationId: insight.conversationId,
      createdAt: insight.createdAt,
      createdByUserId:
        state.legacyConversations.find(
          (conversation) => conversation.id === insight.conversationId,
        )?.startedByUserId ?? 'user-alice',
      evidenceSpans: insight.evidenceSpans.map((span, index) => ({
        ...span,
        orderIndex: index,
      })),
      id: insight.id,
      libraryEntryId: insight.libraryEntryId,
      summary: insight.summary,
    });
  }

  for (const readingState of state.legacyReadingStates) {
    await readingRepository.touchReadingState({
      lastReadAt: readingState.lastReadAt,
      libraryEntryId: readingState.libraryEntryId,
      progressPercent: readingState.progressPercent,
      userId: readingState.userId,
    });
  }

  return true;
}

function createBootstrappedLibraryRepository(
  repository: LibraryRepository,
  legacyInput: BootstrapLegacyLibraryInput,
  onBootstrapped: () => void,
): LibraryRepository {
  let bootstrapped: Promise<void> | null = null;

  async function ensureBootstrapped(): Promise<void> {
    bootstrapped ??= repository
      .bootstrapLegacyLibrary(legacyInput)
      .then(onBootstrapped);

    await bootstrapped;
  }

  return {
    async bootstrapLegacyLibrary(input: BootstrapLegacyLibraryInput): Promise<void> {
      await ensureBootstrapped();
      await repository.bootstrapLegacyLibrary(input);
    },
    async findPaperAsset(assetId) {
      await ensureBootstrapped();

      return repository.findPaperAsset(assetId);
    },
    async getLibraryEntry(entryId) {
      await ensureBootstrapped();

      return repository.getLibraryEntry(entryId);
    },
    async importScopedEntry(input) {
      await ensureBootstrapped();

      return repository.importScopedEntry(input);
    },
    async listLibraryEntriesForAsset(paperAssetId) {
      await ensureBootstrapped();

      return repository.listLibraryEntriesForAsset(paperAssetId);
    },
    async listLibraryEntriesForScope(scope) {
      await ensureBootstrapped();

      return repository.listLibraryEntriesForScope(scope);
    },
  };
}

function createCredentialAuthorityBootstrappedJobRepository(
  repository: JobRepository,
  credentialsRepository: CredentialsRepository,
  ensureBootstrapped: () => Promise<void>,
  env: JixiaAppEnv | undefined,
): JobRepository {
  return {
    async appendJobEvent(input) {
      await ensureBootstrapped();

      return repository.appendJobEvent(input);
    },
    async createAuditRecord(input) {
      await ensureBootstrapped();

      return repository.createAuditRecord(input);
    },
    async createProviderCredentialReference(input) {
      await ensureBootstrapped();

      return repository.createProviderCredentialReference(input);
    },
    async createQueuedJobWithAudit(input) {
      await ensureBootstrapped();

      return repository.createQueuedJobWithAudit(input);
    },
    async getJob(query) {
      await ensureBootstrapped();

      return repository.getJob(query);
    },
    async getProviderCredentialReference(credentialRef) {
      await ensureBootstrapped();

      const credential = await repository.getProviderCredentialReference(credentialRef);

      if (credential) {
        await assertCredentialSecretUsable(
          credentialsRepository,
          credentialRef,
          env,
        );
      }

      return credential;
    },
    async listAuditRecordsByJob(jobId) {
      await ensureBootstrapped();

      return repository.listAuditRecordsByJob(jobId);
    },
    async listJobEvents(jobId) {
      await ensureBootstrapped();

      return repository.listJobEvents(jobId);
    },
    async listJobsForActor(query) {
      await ensureBootstrapped();

      return repository.listJobsForActor(query);
    },
    async updateJobStatus(jobId, status) {
      await ensureBootstrapped();

      return repository.updateJobStatus(jobId, status);
    },
  };
}

async function ensureCredentialAuthorityUsable(
  repository: CredentialsRepository,
  env: JixiaAppEnv | undefined,
): Promise<void> {
  if ((await repository.hasStoredCredentials()) && !hasSecretBoxKey(env)) {
    throw new Error(
      'Credential encryption key is missing from the storage root. Existing credential rows cannot be used until credentials.key is restored.',
    );
  }
}

async function assertCredentialSecretUsable(
  repository: CredentialsRepository,
  credentialRef: string,
  env: JixiaAppEnv | undefined,
): Promise<void> {
  const credential = await repository.getCredentialByRef(credentialRef);

  if (!credential) {
    throw new Error(
      `Credential ${credentialRef} is missing encrypted secret material.`,
    );
  }

  createSecretBox(env, { allowKeyCreation: false }).decrypt(credential);
}

function createCredentialAuthorityBootstrappedCredentialsRepository(
  repository: CredentialsRepository,
  ensureBootstrapped: () => Promise<void>,
): CredentialsRepository {
  return {
    async bootstrapLegacyAuthority(input) {
      await repository.bootstrapLegacyAuthority(input);
    },
    async createCredential(input) {
      await ensureBootstrapped();

      return repository.createCredential(input);
    },
    async replaceCredentialSecret(input) {
      await ensureBootstrapped();

      return repository.replaceCredentialSecret(input);
    },
    async getCredentialByRef(credentialRef) {
      await ensureBootstrapped();

      return repository.getCredentialByRef(credentialRef);
    },
    async getCredentialForUser(query) {
      await ensureBootstrapped();

      return repository.getCredentialForUser(query);
    },
    async getWorkbenchSettings(userId) {
      await ensureBootstrapped();

      return repository.getWorkbenchSettings(userId);
    },
    async hasStoredCredentials() {
      await ensureBootstrapped();

      return repository.hasStoredCredentials();
    },
    async listCredentialsForUser(userId) {
      await ensureBootstrapped();

      return repository.listCredentialsForUser(userId);
    },
    async upsertWorkbenchSettings(input) {
      await ensureBootstrapped();

      return repository.upsertWorkbenchSettings(input);
    },
  };
}

export function createJixiaApp(options: CreateJixiaAppOptions = {}): JixiaApp {
  const loadedState = loadState(options.env);
  const state = loadedState.state;
  const persist = (): void => {
    persistState(state, options.env);
  };
  const persistedNextId = (prefix: string): string => {
    const id = nextId(state, prefix);

    persist();

    return id;
  };

  if (loadedState.hadLegacyCollaborativeKeys) {
    persist();
  }

  if (loadedState.hadLegacyReadingKeys) {
    persist();
  }

  const prismaClient = createPrismaClient({ url: resolveAppDatabaseUrl(options.env) });
  const spaceRepository = createSpaceRepository(prismaClient);
  const spacesService = createSpacesService({
    legacyMirror: {
      syncMembership(record): void {
        const existingMembership = state.memberships.find(
          (membership) =>
            membership.spaceId === record.spaceId && membership.userId === record.userId,
        );

        if (!existingMembership) {
          state.memberships.push(record);
          persist();
        }
      },
      syncSpace(record): void {
        const existingSpace = state.spaces.find((space) => space.id === record.id);

        if (!existingSpace) {
          state.spaces.push(record);
          persist();
        }
      },
    },
    nextId(prefix: string): string {
      return nextId(state, prefix);
    },
    repository: spaceRepository,
  });
  const projectRepository = createProjectRepository(prismaClient);
  const sessionRepository = createSessionRepository(prismaClient);
  const fileStore = createFileStore(options.env);
  const rawCredentialsRepository = createCredentialsRepository(prismaClient);
  const credentialAuthorityBootstrapMarkerPath =
    resolveCredentialAuthorityBootstrapMarkerPath(options.env);
  const credentialAuthorityBootstrapMarkerExists = existsSync(
    credentialAuthorityBootstrapMarkerPath,
  );
  const legacyCredentialBootstrapInput = resolveLegacyCredentialBootstrapInput(
    state,
    credentialAuthorityBootstrapMarkerExists,
  );
  const clearLegacyCredentialAuthority = (): void => {
    markCredentialAuthorityBootstrapComplete(options.env);

    if (clearLegacyCredentialState(state)) {
      persist();
    }
  };

  if (
    credentialAuthorityBootstrapMarkerExists &&
    clearLegacyCredentialState(state)
  ) {
    persist();
  }
  let credentialAuthorityBootstrap: Promise<void> | null = null;

  async function ensureCredentialAuthorityBootstrap(): Promise<void> {
    credentialAuthorityBootstrap ??= rawCredentialsRepository
      .bootstrapLegacyAuthority(legacyCredentialBootstrapInput)
      .then(clearLegacyCredentialAuthority);

    await credentialAuthorityBootstrap;
  }

  const credentialsRepository = createCredentialAuthorityBootstrappedCredentialsRepository(
    rawCredentialsRepository,
    ensureCredentialAuthorityBootstrap,
  );
  const jobRepository = createCredentialAuthorityBootstrappedJobRepository(
    createJobRepository(prismaClient),
    credentialsRepository,
    ensureCredentialAuthorityBootstrap,
    options.env,
  );
  const libraryBootstrapMarkerPath = resolveLibraryBootstrapMarkerPath(options.env);
  const libraryBootstrapMarkerExists = existsSync(libraryBootstrapMarkerPath);
  const legacyLibraryBootstrapInput = resolveLegacyLibraryBootstrapInput(
    state,
    libraryBootstrapMarkerExists,
  );

  if (libraryBootstrapMarkerExists && clearLegacyLibraryState(state)) {
    persist();
  }

  const libraryRepository = createBootstrappedLibraryRepository(
    createLibraryRepository(prismaClient),
    legacyLibraryBootstrapInput,
    () => {
      markLibraryBootstrapComplete(options.env);

      if (clearLegacyLibraryState(state)) {
        persist();
      }
    },
  );
  const projectsService = createProjectsService({
    projectRepository,
    spaceRepository,
  });
  const importService = createImportService({
    arxivConnector: options.connectors?.arxiv ?? createArxivConnector(),
    fileStore,
    libraryRepository,
    projectRepository,
    pubmedConnector: options.connectors?.pubmed ?? createPubmedConnector(),
  });
  const libraryService = createLibraryService({
    fileStore,
    libraryRepository,
    projectRepository,
  });
  const readingRepository = createReadingRepository(prismaClient);
  let readingBootstrap: Promise<void> | null = null;

  async function ensureReadingBootstrap(): Promise<void> {
    readingBootstrap ??= (async () => {
      await libraryRepository.bootstrapLegacyLibrary({ assets: [], entries: [] });
      await initializeReadingPersistence(prismaClient);

      const bootstrapped = await bootstrapLegacyReadingState(readingRepository, state);

      if (bootstrapped && clearLegacyReadingState(state)) {
        persist();
      }
    })();

    await readingBootstrap;
  }
  const notebookRepository = createNotebookRepository(prismaClient);
  const notebookService = createNotebookService({
    libraryService,
    notebookRepository,
  });
  const projectDocRepository = createProjectDocRepository(prismaClient);
  const projectDocsService = createProjectDocsService({
    libraryRepository,
    libraryService,
    projectDocRepository,
    projectRepository,
  });
  const readingService = createReadingService({
    libraryService,
    readingRepository: {
      async createConversation(input) {
        await ensureReadingBootstrap();

        return readingRepository.createConversation(input);
      },
      async createNote(input) {
        await ensureReadingBootstrap();

        return readingRepository.createNote(input);
      },
      async getReadingState(libraryEntryId, userId) {
        await ensureReadingBootstrap();

        return readingRepository.getReadingState(libraryEntryId, userId);
      },
      async listGeneratedInsightsForEntry(libraryEntryId) {
        await ensureReadingBootstrap();

        return readingRepository.listGeneratedInsightsForEntry(libraryEntryId);
      },
      async listNotesForEntry(input) {
        await ensureReadingBootstrap();

        return readingRepository.listNotesForEntry(input);
      },
      async saveGeneratedInsight(input) {
        await ensureReadingBootstrap();

        return readingRepository.saveGeneratedInsight(input);
      },
      async touchReadingState(input) {
        await ensureReadingBootstrap();

        return readingRepository.touchReadingState(input);
      },
    },
  });
  const credentialsService = createCredentialsService({
    nextId(prefix: string): string {
      return persistedNextId(prefix);
    },
    repository: credentialsRepository,
    async resolveSecretBox() {
      await ensureCredentialAuthorityUsable(credentialsRepository, options.env);

      return createSecretBox(options.env);
    },
  });
  const sessionService = createSessionService({
    repository: sessionRepository,
  });
  const auditService = createAuditService({
    jobRepository,
    nextId: persistedNextId,
  });
  const jobBus = createJobBus();
  const jobRunner = createJobRunner({
    auditService,
    jobBus,
    jobRepository,
    nextId: persistedNextId,
  });
  const jobsRoutes = createJobsRoutes({
    auditService,
    jobBus,
    jobRepository,
    jobRunner,
    nextId: persistedNextId,
    spaceRepository,
  });
  let closePromise: Promise<void> | null = null;

  return {
    close(): Promise<void> {
      closePromise ??= prismaClient.$disconnect().catch(() => undefined);
      return closePromise;
    },
    credentials: createCredentialsRoutes(credentialsService),
    health: createHealthRoutes(),
    imports: createImportRoutes(importService),
    jobs: jobsRoutes,
    jobStream: createJobStreamRoutes({
      jobBus,
      jobRepository,
      spaceRepository,
    }),
    library: createLibraryRoutes(libraryService),
    notebooks: createNotebooksRoutes(notebookService),
    projectDocs: createProjectDocsRoutes(projectDocsService),
    projects: createProjectsRoutes(projectsService),
    reading: createReadingRoutes(readingService),
    session: createSessionRoutes(sessionService),
    spaces: createSpacesRoutes(spacesService),
  };
}
