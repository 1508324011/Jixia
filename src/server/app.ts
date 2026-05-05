import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import type {
  CitationLinkRecord,
} from '@shared/contracts/writing';
import type { GeneratedInsightRecord } from '@shared/contracts/evidence';
import type { JobEventRecord } from '@shared/contracts/jobs';
import type { ConversationRecord, NoteRecord } from '@shared/contracts/reading';
import type { SpaceMembership } from '@shared/contracts/spaces';

import {
  createPrismaClient,
  createLibraryRepository,
  createProjectRepository,
  createSpaceRepository,
  type BootstrapLegacyLibraryInput,
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
  createReadingRoutes,
  type ReadingRoutes,
} from './routes/reading.routes';
import {
  createWritingRoutes,
  type WritingRoutes,
} from './routes/writing.routes';
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
} from './services/credentials.service';
import { createSecretBox } from './security/secret-box';
import {
  createAuditService,
  type AuditLogRecord,
} from './services/audit.service';
import { createImportService } from './services/import.service';
import { createEvidenceLinkService } from './services/evidence-link.service';
import { createJobBus } from './jobs/job-bus';
import { createJobRunner, type StoredJob } from './jobs/job-runner';
import { createLibraryService } from './services/library.service';
import { createReadingService } from './services/reading.service';
import {
  createProjectsService,
  type StoredProject,
  type StoredProjectMember,
} from './services/projects.service';
import {
  createSpacesService,
  type StoredSpace,
} from './services/spaces.service';
import {
  createVersioningService,
  type StoredDocVersion,
} from './services/versioning.service';
import {
  createWritingService,
  type StoredWritingDoc,
} from './services/writing.service';
import { createFileStore } from './storage/file-store';
import {
  resolveStorageRoot,
  type StorageRootEnv,
} from './storage/storage-root';

const APP_STATE_FILE = 'server-state.json';
const LIBRARY_BOOTSTRAP_MARKER_FILE = '.library-prisma-bootstrap-complete';

export interface CreateJixiaAppOptions {
  connectors?: {
    arxiv?: ArxivConnector;
    pubmed?: PubmedConnector;
  };
  env?: JixiaAppEnv;
}

export interface JixiaAppEnv extends StorageRootEnv {
  JIXIA_DATABASE_URL?: string;
}

export interface JixiaAppState {
  auditLogs: AuditLogRecord[];
  citationLinks: CitationLinkRecord[];
  conversations: ConversationRecord[];
  credentials: StoredCredential[];
  docVersions: StoredDocVersion[];
  insights: GeneratedInsightRecord[];
  jobEvents: JobEventRecord[];
  jobs: StoredJob[];
  legacyLibraryEntries: LegacyStoredLibraryEntry[];
  legacyPaperAssets: LegacyStoredPaperAsset[];
  memberships: SpaceMembership[];
  nextSequence: number;
  notes: NoteRecord[];
  projectMembers: StoredProjectMember[];
  projects: StoredProject[];
  spaces: StoredSpace[];
  writingDocs: StoredWritingDoc[];
}

type SerializedJixiaAppState = Partial<
  Omit<JixiaAppState, 'legacyLibraryEntries' | 'legacyPaperAssets'>
> & {
  libraryEntries?: LegacyStoredLibraryEntry[];
  paperAssets?: LegacyStoredPaperAsset[];
};

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
  credentials: CredentialsRoutes;
  health: HealthRoutes;
  imports: ImportRoutes;
  jobs: JobsRoutes;
  jobStream: JobStreamRoutes;
  library: LibraryRoutes;
  projects: ProjectsRoutes;
  reading: ReadingRoutes;
  spaces: SpacesRoutes;
  writing: WritingRoutes;
}

function createState(): JixiaAppState {
  return {
    auditLogs: [],
    citationLinks: [],
    conversations: [],
    credentials: [],
    docVersions: [],
    insights: [],
    jobEvents: [],
    jobs: [],
    legacyLibraryEntries: [],
    legacyPaperAssets: [],
    memberships: [],
    nextSequence: 0,
    notes: [],
    projectMembers: [],
    projects: [],
    spaces: [],
    writingDocs: [],
  };
}

function resolveAppStatePath(env: StorageRootEnv = process.env): string {
  return join(resolveStorageRoot(env), APP_STATE_FILE);
}

function resolveLibraryBootstrapMarkerPath(
  env: StorageRootEnv = process.env,
): string {
  return join(resolveStorageRoot(env), LIBRARY_BOOTSTRAP_MARKER_FILE);
}

function loadState(env: StorageRootEnv = process.env): JixiaAppState {
  const initialState = createState();
  const statePath = resolveAppStatePath(env);

  if (!existsSync(statePath)) {
    return initialState;
  }

  const parsed = JSON.parse(readFileSync(statePath, 'utf8')) as SerializedJixiaAppState;

  return {
    auditLogs: parsed.auditLogs ?? initialState.auditLogs,
    citationLinks: parsed.citationLinks ?? initialState.citationLinks,
    conversations: parsed.conversations ?? initialState.conversations,
    credentials: parsed.credentials ?? initialState.credentials,
    docVersions: parsed.docVersions ?? initialState.docVersions,
    insights: parsed.insights ?? initialState.insights,
    jobEvents: parsed.jobEvents ?? initialState.jobEvents,
    jobs: parsed.jobs ?? initialState.jobs,
    legacyLibraryEntries:
      parsed.libraryEntries ?? initialState.legacyLibraryEntries,
    legacyPaperAssets: parsed.paperAssets ?? initialState.legacyPaperAssets,
    memberships: parsed.memberships ?? initialState.memberships,
    nextSequence: parsed.nextSequence ?? initialState.nextSequence,
    notes: parsed.notes ?? initialState.notes,
    projectMembers: parsed.projectMembers ?? initialState.projectMembers,
    projects: parsed.projects ?? initialState.projects,
    spaces: parsed.spaces ?? initialState.spaces,
    writingDocs: parsed.writingDocs ?? initialState.writingDocs,
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
    auditLogs: state.auditLogs,
    citationLinks: state.citationLinks,
    conversations: state.conversations,
    credentials: state.credentials,
    docVersions: state.docVersions,
    insights: state.insights,
    jobEvents: state.jobEvents,
    jobs: state.jobs,
    libraryEntries: state.legacyLibraryEntries,
    memberships,
    nextSequence: state.nextSequence,
    notes: state.notes,
    paperAssets: state.legacyPaperAssets,
    projectMembers: state.projectMembers,
    projects: state.projects,
    spaces,
    writingDocs: state.writingDocs,
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

export function createJixiaApp(options: CreateJixiaAppOptions = {}): JixiaApp {
  const state = loadState(options.env);
  const persist = (): void => {
    persistState(state, options.env);
  };
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
  const libraryBootstrapMarkerPath = resolveLibraryBootstrapMarkerPath(options.env);
  const legacyLibraryBootstrapInput = resolveLegacyLibraryBootstrapInput(
    state,
    existsSync(libraryBootstrapMarkerPath),
  );
  const libraryRepository = createBootstrappedLibraryRepository(
    createLibraryRepository(prismaClient),
    legacyLibraryBootstrapInput,
    () => markLibraryBootstrapComplete(options.env),
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
  const readingService = createReadingService({
    conversations: state.conversations,
    evidenceLinkService: createEvidenceLinkService(),
    insights: state.insights,
    libraryService,
    nextId(prefix: string): string {
      return nextId(state, prefix);
    },
    notes: state.notes,
    persist,
  });
  const versioningService = createVersioningService({
    citationLinks: state.citationLinks,
    docVersions: state.docVersions,
    libraryService,
    nextId(prefix: string): string {
      return nextId(state, prefix);
    },
    persist,
  });
  const writingService = createWritingService({
    docVersions: state.docVersions,
    nextId(prefix: string): string {
      return nextId(state, prefix);
    },
    persist,
    spaceRepository,
    versioningService,
    writingDocs: state.writingDocs,
  });
  const credentialsService = createCredentialsService({
    credentials: state.credentials,
    nextId(prefix: string): string {
      return nextId(state, prefix);
    },
    persist,
    secretBox: createSecretBox(options.env),
  });
  const auditService = createAuditService({
    auditLogs: state.auditLogs,
    nextId(prefix: string): string {
      return nextId(state, prefix);
    },
    persist,
  });
  const jobBus = createJobBus(state.jobEvents, persist);
  const jobRunner = createJobRunner({
    auditService,
    credentials: state.credentials,
    jobBus,
    jobs: state.jobs,
    nextId(prefix: string): string {
      return nextId(state, prefix);
    },
    persist,
  });
  const jobsRoutes = createJobsRoutes({
    auditService,
    credentials: state.credentials,
    jobBus,
    jobRunner,
    jobs: state.jobs,
    nextId(prefix: string): string {
      return nextId(state, prefix);
    },
    persist,
    spaceRepository,
  });

  return {
    credentials: createCredentialsRoutes(credentialsService),
    health: createHealthRoutes(),
    imports: createImportRoutes(importService),
    jobs: jobsRoutes,
    jobStream: createJobStreamRoutes({
      jobBus,
      jobs: state.jobs,
      spaceRepository,
    }),
    library: createLibraryRoutes(libraryService),
    projects: createProjectsRoutes(projectsService),
    reading: createReadingRoutes(readingService),
    spaces: createSpacesRoutes(spacesService),
    writing: createWritingRoutes(writingService),
  };
}
