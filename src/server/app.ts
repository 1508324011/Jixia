import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';

import type {
  ImportMappingRecord,
} from '@shared/contracts/library';
import type {
  CitationLinkRecord,
  ProjectDocumentPresenceRecord,
  ProjectReferenceRecord,
} from '@shared/contracts/writing';
import type {
  EvidenceCardRecord,
  GeneratedInsightRecord,
} from '@shared/contracts/evidence';
import type {
  NotebookNoteRecord,
  NotebookQuestionRecord,
  NotebookRecord,
} from '@shared/contracts/notebook';
import type { JobEventRecord } from '@shared/contracts/jobs';
import type { ConversationRecord, NoteRecord } from '@shared/contracts/reading';
import type { SpaceMembership } from '@shared/contracts/spaces';

import {
  createArxivConnector,
  type ArxivConnector,
} from './connectors/arxiv.connector';
import {
  createBiorxivConnector,
  type BiorxivConnector,
} from './connectors/biorxiv.connector';
import {
  createOpenalexConnector,
  type OpenalexConnector,
} from './connectors/openalex.connector';
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
  createSpacesRoutes,
  type SpacesRoutes,
} from './routes/spaces.routes';
import {
  createCredentialsService,
  type StoredCredential,
  type WorkbenchSettingsRecord,
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
import {
  createDiscoveryService,
  type StoredDiscoveryCandidate,
} from './services/discovery.service';
import { createEvidenceLinkService } from './services/evidence-link.service';
import { createJobBus } from './jobs/job-bus';
import { createJobRunner, type StoredJob } from './jobs/job-runner';
import { createLibraryService } from './services/library.service';
import {
  createNotebookService,
  type NotebookService,
} from './services/notebook.service';
import {
  createProjectProjectionService,
  type ProjectProjectionService,
} from './services/project-projection.service';
import { createReadingService } from './services/reading.service';
import { createRecommendationService } from './services/recommendation.service';
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
    biorxiv?: BiorxivConnector;
    openalex?: OpenalexConnector;
    pubmed?: PubmedConnector;
  };
  env?: StorageRootEnv;
}

export interface JixiaAppState {
  auditLogs: AuditLogRecord[];
  citationLinks: CitationLinkRecord[];
  conversations: ConversationRecord[];
  credentials: StoredCredential[];
  discoveryCandidates: StoredDiscoveryCandidate[];
  docVersions: StoredDocVersion[];
  evidenceCards: EvidenceCardRecord[];
  importMappings: ImportMappingRecord[];
  insights: GeneratedInsightRecord[];
  jobEvents: JobEventRecord[];
  jobs: StoredJob[];
  libraryEntries: StoredLibraryEntry[];
  memberships: SpaceMembership[];
  nextSequence: number;
  notebookNotes: NotebookNoteRecord[];
  notebookQuestions: NotebookQuestionRecord[];
  notebookRecords: NotebookRecord[];
  notes: NoteRecord[];
  paperAssets: StoredPaperAsset[];
  projectDocumentPresences: ProjectDocumentPresenceRecord[];
  projectReferences: ProjectReferenceRecord[];
  spaces: StoredSpace[];
  workbenchSettings: WorkbenchSettingsRecord[];
  writingDocs: StoredWritingDoc[];
}

export interface JixiaApp {
  credentials: CredentialsRoutes;
  health: HealthRoutes;
  imports: ImportRoutes;
  jobs: JobsRoutes;
  jobStream: JobStreamRoutes;
  library: LibraryRoutes;
  notebook: NotebookService;
  projectProjection: ProjectProjectionService;
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
    discoveryCandidates: [],
    docVersions: [],
    evidenceCards: [],
    importMappings: [],
    insights: [],
    jobEvents: [],
    jobs: [],
    libraryEntries: [],
    memberships: [],
    nextSequence: 0,
    notebookNotes: [],
    notebookQuestions: [],
    notebookRecords: [],
    notes: [],
    paperAssets: [],
    projectDocumentPresences: [],
    projectReferences: [],
    spaces: [],
    workbenchSettings: [],
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
    discoveryCandidates: parsed.discoveryCandidates ?? initialState.discoveryCandidates,
    docVersions: parsed.docVersions ?? initialState.docVersions,
    evidenceCards: parsed.evidenceCards ?? initialState.evidenceCards,
    importMappings: parsed.importMappings ?? initialState.importMappings,
    insights: parsed.insights ?? initialState.insights,
    jobEvents: parsed.jobEvents ?? initialState.jobEvents,
    jobs: parsed.jobs ?? initialState.jobs,
    libraryEntries: parsed.libraryEntries ?? initialState.libraryEntries,
    memberships: parsed.memberships ?? initialState.memberships,
    nextSequence: parsed.nextSequence ?? initialState.nextSequence,
    notebookNotes: parsed.notebookNotes ?? initialState.notebookNotes,
    notebookQuestions: parsed.notebookQuestions ?? initialState.notebookQuestions,
    notebookRecords: parsed.notebookRecords ?? initialState.notebookRecords,
    notes: parsed.notes ?? initialState.notes,
    paperAssets: parsed.paperAssets ?? initialState.paperAssets,
    projectDocumentPresences:
      parsed.projectDocumentPresences ?? initialState.projectDocumentPresences,
    projectReferences: parsed.projectReferences ?? initialState.projectReferences,
    spaces: parsed.spaces ?? initialState.spaces,
    workbenchSettings: parsed.workbenchSettings ?? initialState.workbenchSettings,
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
  const discoveryService = createDiscoveryService({
    arxivConnector: options.connectors?.arxiv ?? createArxivConnector(),
    biorxivConnector: options.connectors?.biorxiv ?? createBiorxivConnector(),
    discoveryCandidates: state.discoveryCandidates,
    nextId(prefix: string): string {
      return nextId(state, prefix);
    },
    openalexConnector: options.connectors?.openalex ?? createOpenalexConnector(),
    persist,
    pubmedConnector: options.connectors?.pubmed ?? createPubmedConnector(),
  });
  const recommendationService = createRecommendationService(discoveryService);
  const importService = createImportService({
    arxivConnector: options.connectors?.arxiv ?? createArxivConnector(),
    biorxivConnector: options.connectors?.biorxiv ?? createBiorxivConnector(),
    discoveryCandidates: state.discoveryCandidates,
    discoveryService,
    fileStore: createFileStore(options.env),
    importMappings: state.importMappings,
    libraryEntries: state.libraryEntries,
    memberships: state.memberships,
    nextId(prefix: string): string {
      return nextId(state, prefix);
    },
    openalexConnector: options.connectors?.openalex ?? createOpenalexConnector(),
    paperAssets: state.paperAssets,
    persist,
    pubmedConnector: options.connectors?.pubmed ?? createPubmedConnector(),
    recommendationService,
    spaces: state.spaces,
  });
  const libraryService = createLibraryService({
    libraryEntries: state.libraryEntries,
    memberships: state.memberships,
    paperAssets: state.paperAssets,
    persist,
    spaces: state.spaces,
  });
  const notebookService = createNotebookService({
    libraryEntries: state.libraryEntries,
    nextId(prefix: string): string {
      return nextId(state, prefix);
    },
    notebookNotes: state.notebookNotes,
    notebookRecords: state.notebookRecords,
    persist,
  });
  const projectProjectionService = createProjectProjectionService({
    evidenceCards: state.evidenceCards,
    memberships: state.memberships,
    nextId(prefix: string): string {
      return nextId(state, prefix);
    },
    notebookService,
    persist,
    projectReferences: state.projectReferences,
    writingDocs: state.writingDocs,
  });
  const readingService = createReadingService({
    conversations: state.conversations,
    evidenceCards: state.evidenceCards,
    evidenceLinkService: createEvidenceLinkService(),
    insights: state.insights,
    libraryEntries: state.libraryEntries,
    memberships: state.memberships,
    nextId(prefix: string): string {
      return nextId(state, prefix);
    },
    notebookService,
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
    citationLinks: state.citationLinks,
    docVersions: state.docVersions,
    memberships: state.memberships,
    nextId(prefix: string): string {
      return nextId(state, prefix);
    },
    paperAssets: state.paperAssets,
    persist,
    projectDocumentPresences: state.projectDocumentPresences,
    projectReferences: state.projectReferences,
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
    workbenchSettings: state.workbenchSettings,
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
    notebook: notebookService,
    projectProjection: projectProjectionService,
    reading: createReadingRoutes(readingService),
    spaces: createSpacesRoutes(spacesService),
    writing: createWritingRoutes(writingService),
  };
}
