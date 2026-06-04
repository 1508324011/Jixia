import { useCallback, useMemo, useState } from "react";

import type {
  ImportSourceType,
  LibraryEntryView,
} from "@shared/contracts/library";

import { apiClient } from "../lib/http-client";

export interface SearchViewModel {
  error: string | null;
  importPersonalSource(input: {
    sourceLocator: string;
    sourceType: Exclude<ImportSourceType, "upload">;
  }): Promise<void>;
  importedRecord: LibraryEntryView | null;
  isImporting: boolean;
}

export function useSearchPresenter(): SearchViewModel {
  const [importedRecord, setImportedRecord] = useState<LibraryEntryView | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);
  const [isImporting, setIsImporting] = useState(false);

  const importPersonalSource = useCallback(
    async (input: {
      sourceLocator: string;
      sourceType: Exclude<ImportSourceType, "upload">;
    }) => {
      try {
        setIsImporting(true);
        setError(null);

        const nextRecord = await apiClient.importToPersonalLibrary({
          sourceLocator: input.sourceLocator,
          sourceType: input.sourceType,
        });

        setImportedRecord(nextRecord);
      } catch (presenterError) {
        setError(
          presenterError instanceof Error
            ? presenterError.message
            : "Failed to import paper.",
        );
      } finally {
        setIsImporting(false);
      }
    },
    [],
  );

  return useMemo(
    () => ({
      error,
      importPersonalSource,
      importedRecord,
      isImporting,
    }),
    [
      error,
      importPersonalSource,
      importedRecord,
      isImporting,
    ],
  );
}
