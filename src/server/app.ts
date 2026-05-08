import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import type { GeneratedInsightRecord } from '@shared/contracts/evidence';
import type { ConversationRecord, NoteRecord } from '@shared/contracts/reading';
import type { SpaceMembership } from '@shared/contracts/spaces';

import {
  createPrismaClient,
  createJobRepository,
  createNotebookRepository,
  createProjectDocRepository,
  createLibraryRepository,
  createProjectRepository,
  createReadingRepository,
  createSessionRepository,
  initializeReadingPersistence,
  createSpaceRepository,
  type BootstrapLegacyLibraryInput,
  type JobRepository,
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
  type StoredCredential,
  type WorkbenchSettingsRecord,
} from './services/credentials.service';
import { createSessionService } from './services/session.service';
import { createSecretBox } from './security/secret-box';
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
  credentials: StoredCredential[];
  legacyConversations: ConversationRecord[];
  legacyInsights: GeneratedInsightRecord[];
  legacyLibraryEntries: LegacyStoredLibraryEntry[];
  legacyNotes: NoteRecord[];
  legacyReadingStates: LegacyReadingStateRecord[];
  legacyPaperAssets: LegacyStoredPaperAsset[];
  memberships: SpaceMembership[];
  nextSequence: number;
  spaces: StoredSpace[];
  workbenchSettings: WorkbenchSettingsRecord[];
}

type SerializedJixiaAppState = Partial<
  Omit<JixiaAppState, 'legacyLibraryEntries' | 'legacyPaperAssets'>
> & {
  citationLinks?: unknown;
  docVersions?: unknown;
  libraryEntries?: LegacyStoredLibraryEntry[];
  conversations?: ConversationRecord[];
  insights?: GeneratedInsightRecord[];
  notes?: NoteRecord[];
  readingStates?: LegacyReadingStateRecord[];
  paperAssets?: LegacyStoredPaperAsset[];
  projectMembers?: unknown;
  projects?: unknown;
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
    credentials: [],
    legacyConversations: [],
    legacyInsights: [],
    legacyLibraryEntries: [],
    legacyNotes: [],
    legacyReadingStates: [],
    legacyPaperAssets: [],
    memberships: [],
    nextSequence: 0,
    spaces: [],
    workbenchSettings: [],
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
      credentials: parsed.credentials ?? initialState.credentials,
      legacyConversations:
        parsed.conversations ?? initialState.legacyConversations,
      legacyInsights: parsed.insights ?? initialState.legacyInsights,
      legacyLibraryEntries:
        parsed.libraryEntries ?? initialState.legacyLibraryEntries,
      legacyNotes: parsed.notes ?? initialState.legacyNotes,
      legacyReadingStates:
        parsed.readingStates ?? initialState.legacyReadingStates,
      legacyPaperAssets: parsed.paperAssets ?? initialState.legacyPaperAssets,
      memberships: parsed.memberships ?? initialState.memberships,
      nextSequence: parsed.nextSequence ?? initialState.nextSequence,
      spaces: parsed.spaces ?? initialState.spaces,
      workbenchSettings:
        parsed.workbenchSettings ?? initialState.workbenchSettings,
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
    credentials: state.credentials,
    conversations: state.legacyConversations,
    insights: state.legacyInsights,
    libraryEntries: state.legacyLibraryEntries,
    memberships,
    nextSequence: state.nextSequence,
    notes: state.legacyNotes,
    paperAssets: state.legacyPaperAssets,
    readingStates: state.legacyReadingStates,
    spaces,
    workbenchSettings: state.workbenchSettings,
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

function createCredentialReferenceBootstrappedJobRepository(
  repository: JobRepository,
  credentials: StoredCredential[],
): JobRepository {
  let bootstrapped: Promise<void> | null = null;

  async function ensureBootstrapped(): Promise<void> {
    bootstrapped ??= Promise.all(
      credentials.map((credential) =>
        repository.createProviderCredentialReference({
          createdAt: credential.createdAt,
          credentialRef: credential.credentialRef,
          provider: credential.provider,
          secretRef: credential.credentialRef,
          userId: credential.userId,
        }),
      ),
    ).then(() => undefined);

    await bootstrapped;
  }

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

      return repository.getProviderCredentialReference(credentialRef);
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
  const jobRepository = createCredentialReferenceBootstrappedJobRepository(
    createJobRepository(prismaClient),
    state.credentials,
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
    fileStore: createFileStore(options.env),
    libraryRepository,
    projectRepository,
    pubmedConnector: options.connectors?.pubmed ?? createPubmedConnector(),
  });
  const libraryService = createLibraryService({
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
    credentials: state.credentials,
    jobRepository,
    nextId(prefix: string): string {
      return nextId(state, prefix);
    },
    persist,
    secretBox: createSecretBox(options.env),
    workbenchSettings: state.workbenchSettings,
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
