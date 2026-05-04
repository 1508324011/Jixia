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
import {
  createImportService,
  type StoredLibraryEntry,
  type StoredPaperAsset,
} from './services/import.service';
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

export interface CreateJixiaAppOptions {
  connectors?: {
    arxiv?: ArxivConnector;
    pubmed?: PubmedConnector;
  };
  env?: StorageRootEnv;
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
  libraryEntries: StoredLibraryEntry[];
  memberships: SpaceMembership[];
  nextSequence: number;
  notes: NoteRecord[];
  paperAssets: StoredPaperAsset[];
  projectMembers: StoredProjectMember[];
  projects: StoredProject[];
  spaces: StoredSpace[];
  writingDocs: StoredWritingDoc[];
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
    libraryEntries: [],
    memberships: [],
    nextSequence: 0,
    notes: [],
    paperAssets: [],
    projectMembers: [],
    projects: [],
    spaces: [],
    writingDocs: [],
  };
}

function resolveAppStatePath(env: StorageRootEnv = process.env): string {
  return join(resolveStorageRoot(env), APP_STATE_FILE);
}

function loadState(env: StorageRootEnv = process.env): JixiaAppState {
  const initialState = createState();
  const statePath = resolveAppStatePath(env);

  if (!existsSync(statePath)) {
    return initialState;
  }

  const parsed = JSON.parse(readFileSync(statePath, 'utf8')) as Partial<JixiaAppState>;

  return {
    auditLogs: parsed.auditLogs ?? initialState.auditLogs,
    citationLinks: parsed.citationLinks ?? initialState.citationLinks,
    conversations: parsed.conversations ?? initialState.conversations,
    credentials: parsed.credentials ?? initialState.credentials,
    docVersions: parsed.docVersions ?? initialState.docVersions,
    insights: parsed.insights ?? initialState.insights,
    jobEvents: parsed.jobEvents ?? initialState.jobEvents,
    jobs: parsed.jobs ?? initialState.jobs,
    libraryEntries: parsed.libraryEntries ?? initialState.libraryEntries,
    memberships: parsed.memberships ?? initialState.memberships,
    nextSequence: parsed.nextSequence ?? initialState.nextSequence,
    notes: parsed.notes ?? initialState.notes,
    paperAssets: parsed.paperAssets ?? initialState.paperAssets,
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

  mkdirSync(rootDirectory, { recursive: true });
  writeFileSync(resolveAppStatePath(env), JSON.stringify(state, null, 2));
}

function nextId(state: JixiaAppState, prefix: string): string {
  state.nextSequence += 1;

  return `${prefix}-${state.nextSequence}`;
}

export function createJixiaApp(options: CreateJixiaAppOptions = {}): JixiaApp {
  const state = loadState(options.env);
  const persist = (): void => {
    persistState(state, options.env);
  };
  const spacesService = createSpacesService({
    memberships: state.memberships,
    nextId(prefix: string): string {
      return nextId(state, prefix);
    },
    persist,
    spaces: state.spaces,
  });
  const projectsService = createProjectsService({
    memberships: state.memberships,
    nextId(prefix: string): string {
      return nextId(state, prefix);
    },
    persist,
    projectMembers: state.projectMembers,
    projects: state.projects,
    spaces: state.spaces,
  });
  const importService = createImportService({
    arxivConnector: options.connectors?.arxiv ?? createArxivConnector(),
    fileStore: createFileStore(options.env),
    libraryEntries: state.libraryEntries,
    memberships: state.memberships,
    nextId(prefix: string): string {
      return nextId(state, prefix);
    },
    paperAssets: state.paperAssets,
    persist,
    pubmedConnector: options.connectors?.pubmed ?? createPubmedConnector(),
    spaces: state.spaces,
  });
  const libraryService = createLibraryService({
    libraryEntries: state.libraryEntries,
    memberships: state.memberships,
    paperAssets: state.paperAssets,
    spaces: state.spaces,
  });
  const readingService = createReadingService({
    conversations: state.conversations,
    evidenceLinkService: createEvidenceLinkService(),
    insights: state.insights,
    libraryEntries: state.libraryEntries,
    memberships: state.memberships,
    nextId(prefix: string): string {
      return nextId(state, prefix);
    },
    notes: state.notes,
    paperAssets: state.paperAssets,
    persist,
    spaces: state.spaces,
  });
  const versioningService = createVersioningService({
    citationLinks: state.citationLinks,
    docVersions: state.docVersions,
    nextId(prefix: string): string {
      return nextId(state, prefix);
    },
    paperAssets: state.paperAssets,
    persist,
  });
  const writingService = createWritingService({
    docVersions: state.docVersions,
    memberships: state.memberships,
    nextId(prefix: string): string {
      return nextId(state, prefix);
    },
    paperAssets: state.paperAssets,
    persist,
    spaces: state.spaces,
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
    memberships: state.memberships,
    nextId(prefix: string): string {
      return nextId(state, prefix);
    },
    persist,
    spaces: state.spaces,
  });

  return {
    credentials: createCredentialsRoutes(credentialsService),
    health: createHealthRoutes(),
    imports: createImportRoutes(importService),
    jobs: jobsRoutes,
    jobStream: createJobStreamRoutes({
      jobBus,
      jobs: state.jobs,
      memberships: state.memberships,
      spaces: state.spaces,
    }),
    library: createLibraryRoutes(libraryService),
    projects: createProjectsRoutes(projectsService),
    reading: createReadingRoutes(readingService),
    spaces: createSpacesRoutes(spacesService),
    writing: createWritingRoutes(writingService),
  };
}
