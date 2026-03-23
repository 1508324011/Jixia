import type { LibraryEntryView } from '@shared/contracts/library';

import type {
  GetLibraryEntryRequest,
  ListLibraryEntriesRequest,
  LibraryService,
} from '../services/library.service';

export interface LibraryRoutes {
  getEntry(input: GetLibraryEntryRequest): Promise<LibraryEntryView | null>;
  listEntries(input: ListLibraryEntriesRequest): Promise<LibraryEntryView[]>;
  listPersonalEntries(actorUserId: string): Promise<LibraryEntryView[]>;
}

export function createLibraryRoutes(service: LibraryService): LibraryRoutes {
  return {
    getEntry(input: GetLibraryEntryRequest): Promise<LibraryEntryView | null> {
      return service.getEntry(input);
    },
    listEntries(input: ListLibraryEntriesRequest): Promise<LibraryEntryView[]> {
      return service.listEntries(input);
    },
    listPersonalEntries(actorUserId: string): Promise<LibraryEntryView[]> {
      return service.listPersonalEntries(actorUserId);
    },
  };
}
