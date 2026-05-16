import { useCallback, useEffect, useMemo, useState } from "react";

import type {
  AdoptProjectLibraryEntryResponse,
  LibraryEntryView,
} from "@shared/contracts/library";
import type { ProjectListItem } from "@shared/contracts/projects";

import { apiClient } from "../lib/http-client";
import { useProjectContext } from "./project-context";

export interface AdoptLibraryEntryToProjectInput {
  sourceLibraryEntryId: string;
  targetProjectId: string;
}

export interface AdoptLibraryEntryToProjectResult
  extends AdoptProjectLibraryEntryResponse {
  project: ProjectListItem;
}

interface UseLibraryPresenterOptions {
  loadProjectEntries?: boolean;
}

export interface LibraryViewModel {
  adoptEntryToProject(
    input: AdoptLibraryEntryToProjectInput,
  ): Promise<AdoptLibraryEntryToProjectResult>;
  entries: LibraryEntryView[];
  error: string | null;
  isLoading: boolean;
  project: ProjectListItem | null;
  projects: ProjectListItem[];
  refresh(): Promise<void>;
}

export function useLibraryPresenter(
  projectId: string | undefined,
  options: UseLibraryPresenterOptions = {},
): LibraryViewModel {
  const projectContext = useProjectContext(projectId);
  const [entries, setEntries] = useState<LibraryEntryView[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const loadProjectEntries = options.loadProjectEntries ?? true;

  const refresh = useCallback(async () => {
    if (!loadProjectEntries) {
      setEntries([]);
      setError(projectContext.error);
      return;
    }

    if (!projectContext.project) {
      setEntries([]);
      setError(projectContext.error);
      return;
    }

    try {
      setIsLoading(true);
      setError(null);
      const nextEntries = await apiClient.listLibraryEntries(
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
  }, [loadProjectEntries, projectContext.error, projectContext.project]);

  const adoptEntryToProject = useCallback(
    async ({
      sourceLibraryEntryId,
      targetProjectId,
    }: AdoptLibraryEntryToProjectInput): Promise<AdoptLibraryEntryToProjectResult> => {
      const targetProject = projectContext.projects.find(
        (item) => item.project.id === targetProjectId,
      );

      if (!targetProject) {
        throw new Error(
          `Project ${targetProjectId} is not visible to the current actor.`,
        );
      }

      const response = await apiClient.adoptProjectLibraryEntry(targetProjectId, {
        sourceLibraryEntryId,
      });

      if (loadProjectEntries && projectContext.project?.project.id === targetProjectId) {
        try {
          const refreshedEntries = await apiClient.listLibraryEntries(
            { id: targetProjectId, type: "project" },
            targetProject.project.spaceId,
          );
          setEntries(refreshedEntries);
        } catch (refreshError) {
          setError(
            refreshError instanceof Error
              ? refreshError.message
              : "Failed to refresh project library.",
          );
        }
      }

      return {
        ...response,
        project: targetProject,
      };
    },
    [loadProjectEntries, projectContext.project, projectContext.projects],
  );

  useEffect(() => {
    void refresh();
  }, [refresh]);

  return useMemo(
    () => ({
      adoptEntryToProject,
      entries,
      error: error ?? projectContext.error,
      isLoading: isLoading || projectContext.isLoading,
      project: projectContext.project,
      projects: projectContext.projects,
      refresh,
    }),
    [adoptEntryToProject, entries, error, isLoading, projectContext, refresh],
  );
}
