import type {
  CitationLinkRecord,
  WritingDocRecord,
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
  createSpacesRoutes,
  type SpacesRoutes,
} from './routes/spaces.routes';
import {
  createCredentialsService,
  type StoredCredential,
} from './services/credentials.service';
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
  createSpacesService,
  type StoredSpace,
} from './services/spaces.service';
import {
  createVersioningService,
  type StoredDocVersion,
} from './services/versioning.service';
import { createWritingService } from './services/writing.service';
import { createFileStore } from './storage/file-store';
import type { StorageRootEnv } from './storage/storage-root';

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
  spaces: StoredSpace[];
  writingDocs: WritingDocRecord[];
}

export interface JixiaApp {
  credentials: CredentialsRoutes;
  health: HealthRoutes;
  imports: ImportRoutes;
  jobs: JobsRoutes;
  jobStream: JobStreamRoutes;
  library: LibraryRoutes;
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
    spaces: [],
    writingDocs: [],
  };
}

function nextId(state: JixiaAppState, prefix: string): string {
  state.nextSequence += 1;

  return `${prefix}-${state.nextSequence}`;
}

export function createJixiaApp(options: CreateJixiaAppOptions = {}): JixiaApp {
  const state = createState();
  const spacesService = createSpacesService({
    memberships: state.memberships,
    nextId(prefix: string): string {
      return nextId(state, prefix);
    },
    spaces: state.spaces,
  });
  const importService = createImportService({
    arxivConnector: options.connectors?.arxiv ?? createArxivConnector(),
    fileStore: createFileStore(options.env),
    libraryEntries: state.libraryEntries,
    nextId(prefix: string): string {
      return nextId(state, prefix);
    },
    paperAssets: state.paperAssets,
    pubmedConnector: options.connectors?.pubmed ?? createPubmedConnector(),
  });
  const libraryService = createLibraryService({
    libraryEntries: state.libraryEntries,
    paperAssets: state.paperAssets,
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
    spaces: state.spaces,
  });
  const versioningService = createVersioningService({
    citationLinks: state.citationLinks,
    docVersions: state.docVersions,
    nextId(prefix: string): string {
      return nextId(state, prefix);
    },
  });
  const writingService = createWritingService({
    docVersions: state.docVersions,
    nextId(prefix: string): string {
      return nextId(state, prefix);
    },
    spaces: state.spaces,
    versioningService,
    writingDocs: state.writingDocs,
  });
  const credentialsService = createCredentialsService({
    credentials: state.credentials,
    nextId(prefix: string): string {
      return nextId(state, prefix);
    },
  });
  const auditService = createAuditService({
    auditLogs: state.auditLogs,
    nextId(prefix: string): string {
      return nextId(state, prefix);
    },
  });
  const jobBus = createJobBus(state.jobEvents);
  const jobRunner = createJobRunner({
    auditService,
    credentials: state.credentials,
    jobBus,
    jobs: state.jobs,
    nextId(prefix: string): string {
      return nextId(state, prefix);
    },
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
  });

  return {
    credentials: createCredentialsRoutes(credentialsService),
    health: createHealthRoutes(),
    imports: createImportRoutes(importService),
    jobs: jobsRoutes,
    jobStream: createJobStreamRoutes(jobBus),
    library: createLibraryRoutes(libraryService),
    reading: createReadingRoutes(readingService),
    spaces: createSpacesRoutes(spacesService),
    writing: createWritingRoutes(writingService),
  };
}
