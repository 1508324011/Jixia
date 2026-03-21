import type { LibraryEntryView } from '@shared/contracts/library';

import type {
  GetLibraryEntryRequest,
  LibraryService,
} from '../services/library.service';

export interface LibraryRoutes {
  getEntry(input: GetLibraryEntryRequest): Promise<LibraryEntryView | null>;
}

export function createLibraryRoutes(service: LibraryService): LibraryRoutes {
  return {
    getEntry(input: GetLibraryEntryRequest): Promise<LibraryEntryView | null> {
      return service.getEntry(input);
    },
  };
}
