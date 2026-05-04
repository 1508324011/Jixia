import type {
  LibraryEntryView,
} from "@shared/contracts/library";

import type {
  GetLibraryEntryRequest,
  ListLibraryEntriesRequest,
  LibraryService,
} from "../services/library.service";

export interface LibraryRoutes {
  getEntry(input: GetLibraryEntryRequest): Promise<LibraryEntryView | null>;
  listEntries(input: ListLibraryEntriesRequest): Promise<LibraryEntryView[]>;
}

export function createLibraryRoutes(service: LibraryService): LibraryRoutes {
  return {
    listEntries(input: ListLibraryEntriesRequest): Promise<LibraryEntryView[]> {
      return service.listEntries(input);
    },
    getEntry(input: GetLibraryEntryRequest): Promise<LibraryEntryView | null> {
      return service.getEntry(input);
    },
  };
}
