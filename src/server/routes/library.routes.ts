import type { LibraryEntryView } from '@shared/contracts/library';

import type { LibraryService } from '../services/library.service';

export interface LibraryRoutes {
  getEntry(entryId: string): Promise<LibraryEntryView | null>;
}

export function createLibraryRoutes(service: LibraryService): LibraryRoutes {
  return {
    getEntry(entryId: string): Promise<LibraryEntryView | null> {
      return service.getEntry(entryId);
    },
  };
}
