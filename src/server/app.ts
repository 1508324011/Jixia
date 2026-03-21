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
import { createLibraryService } from './services/library.service';
import {
  createSpacesService,
  type StoredSpace,
} from './services/spaces.service';
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
  libraryEntries: StoredLibraryEntry[];
  memberships: SpaceMembership[];
  nextSequence: number;
  paperAssets: StoredPaperAsset[];
  spaces: StoredSpace[];
}

export interface JixiaApp {
  health: HealthRoutes;
  imports: ImportRoutes;
  library: LibraryRoutes;
  spaces: SpacesRoutes;
}

function createState(): JixiaAppState {
  return {
    libraryEntries: [],
    memberships: [],
    nextSequence: 0,
    paperAssets: [],
    spaces: [],
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

  return {
    health: createHealthRoutes(),
    imports: createImportRoutes(importService),
    library: createLibraryRoutes(libraryService),
    spaces: createSpacesRoutes(spacesService),
  };
}
