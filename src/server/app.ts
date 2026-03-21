import type {
  CitationLinkRecord,
  WritingDocRecord,
} from '@shared/contracts/writing';
import type { GeneratedInsightRecord } from '@shared/contracts/evidence';
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
  createImportRoutes,
  type ImportRoutes,
} from './routes/import.routes';
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
  createImportService,
  type StoredLibraryEntry,
  type StoredPaperAsset,
} from './services/import.service';
import { createEvidenceLinkService } from './services/evidence-link.service';
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
  citationLinks: CitationLinkRecord[];
  conversations: ConversationRecord[];
  docVersions: StoredDocVersion[];
  insights: GeneratedInsightRecord[];
  libraryEntries: StoredLibraryEntry[];
  memberships: SpaceMembership[];
  nextSequence: number;
  notes: NoteRecord[];
  paperAssets: StoredPaperAsset[];
  spaces: StoredSpace[];
  writingDocs: WritingDocRecord[];
}

export interface JixiaApp {
  health: HealthRoutes;
  imports: ImportRoutes;
  library: LibraryRoutes;
  reading: ReadingRoutes;
  spaces: SpacesRoutes;
  writing: WritingRoutes;
}

function createState(): JixiaAppState {
  return {
    citationLinks: [],
    conversations: [],
    docVersions: [],
    insights: [],
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

  return {
    health: createHealthRoutes(),
    imports: createImportRoutes(importService),
    library: createLibraryRoutes(libraryService),
    reading: createReadingRoutes(readingService),
    spaces: createSpacesRoutes(spacesService),
    writing: createWritingRoutes(writingService),
  };
}
