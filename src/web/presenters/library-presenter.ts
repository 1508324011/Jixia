import { useCallback, useEffect, useMemo, useState } from "react";

import type { LibraryEntryView } from "@shared/contracts/library";
import type { ProjectListItem } from "@shared/contracts/projects";

import { apiClient } from "../lib/http-client";
import { demoActorContext } from "./runtime-context";
import { useProjectContext } from "./project-context";

export interface LibraryViewModel {
  entries: LibraryEntryView[];
  error: string | null;
  isLoading: boolean;
  project: ProjectListItem | null;
  refresh(): Promise<void>;
}

export function useLibraryPresenter(projectId: string): LibraryViewModel {
  const projectContext = useProjectContext(projectId);
  const [entries, setEntries] = useState<LibraryEntryView[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  const refresh = useCallback(async () => {
    if (!projectContext.project) {
      setEntries([]);
      setError(projectContext.error);
      return;
    }

      try {
        setIsLoading(true);
        setError(null);
        const nextEntries = await apiClient.listLibraryEntries(
          demoActorContext.actorUserId,
          { id: projectContext.project.project.id, type: "project" },
          projectContext.project.project.spaceId,
        );

      setEntries(nextEntries.length > 0 ? nextEntries : []);
    } catch (presenterError) {
      setEntries([]);
      setError(
        presenterError instanceof Error
          ? presenterError.message
          : "Failed to load project library.",
      );
    } finally {
      setIsLoading(false);
    }
  }, [projectContext.error, projectContext.project]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return useMemo(
    () => ({
      entries,
      error: error ?? projectContext.error,
      isLoading: isLoading || projectContext.isLoading,
      project: projectContext.project,
      refresh,
    }),
    [entries, error, isLoading, projectContext, refresh],
  );
}
