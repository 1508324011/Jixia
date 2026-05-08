import type { LibraryEntryView } from "@shared/contracts/library";

import type {
  AuthorizedPaperFile,
  GetLibraryEntryRequest,
  ListLibraryEntriesRequest,
  LibraryService,
} from "../services/library.service";

export interface LibraryRoutes {
  getEntry(input: GetLibraryEntryRequest): Promise<LibraryEntryView | null>;
  getEntryFile(input: GetLibraryEntryRequest): Promise<AuthorizedPaperFile>;
  listEntries(input: ListLibraryEntriesRequest): Promise<LibraryEntryView[]>;
  listPersonalEntries(actorUserId: string): Promise<LibraryEntryView[]>;
}

export function createLibraryRoutes(service: LibraryService): LibraryRoutes {
  return {
    listEntries(input: ListLibraryEntriesRequest): Promise<LibraryEntryView[]> {
      return service.listEntries(input);
    },
    listPersonalEntries(actorUserId: string): Promise<LibraryEntryView[]> {
      return service.listPersonalEntries(actorUserId);
    },
    getEntry(input: GetLibraryEntryRequest): Promise<LibraryEntryView | null> {
      return service.getEntry(input);
    },
    getEntryFile(input: GetLibraryEntryRequest): Promise<AuthorizedPaperFile> {
      return service.getEntryFile(input);
    },
  };
}
