import type {
  AdoptProjectLibraryEntryResponse,
  LibraryEntryView,
} from "@shared/contracts/library";

import type {
  AdoptProjectLibraryEntryServiceRequest,
  AuthorizedPaperFile,
  GetLibraryEntryRequest,
  ListLibraryEntriesRequest,
  LibraryService,
} from "../services/library.service";

export interface LibraryRoutes {
  adoptProjectLibraryEntry(
    input: AdoptProjectLibraryEntryServiceRequest,
  ): Promise<AdoptProjectLibraryEntryResponse>;
  getEntry(input: GetLibraryEntryRequest): Promise<LibraryEntryView | null>;
  getEntryFile(input: GetLibraryEntryRequest): Promise<AuthorizedPaperFile>;
  listEntries(input: ListLibraryEntriesRequest): Promise<LibraryEntryView[]>;
  listPersonalEntries(actorUserId: string): Promise<LibraryEntryView[]>;
}

export function createLibraryRoutes(service: LibraryService): LibraryRoutes {
  return {
    adoptProjectLibraryEntry(
      input: AdoptProjectLibraryEntryServiceRequest,
    ): Promise<AdoptProjectLibraryEntryResponse> {
      return service.adoptProjectLibraryEntry(input);
    },
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
