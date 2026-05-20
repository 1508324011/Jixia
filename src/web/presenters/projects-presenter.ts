import { useCallback, useEffect, useMemo, useState } from "react";

import type { ProjectListItem } from "@shared/contracts/projects";
import type { SpaceSummary } from "@shared/contracts/spaces";

import { apiClient } from "../lib/http-client";
import { runtimeContext } from "./runtime-context";

export interface ProjectCardView {
  item: ProjectListItem;
  memberCount: number;
}

export interface ProjectsViewModel {
  createProject(): Promise<void>;
  error: string | null;
  isCreating: boolean;
  isLoading: boolean;
  projects: ProjectCardView[];
  refresh(): Promise<void>;
  spaces: SpaceSummary[];
}

export function useProjectsPresenter(): ProjectsViewModel {
  const [spaces, setSpaces] = useState<SpaceSummary[]>([]);
  const [projects, setProjects] = useState<ProjectCardView[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isCreating, setIsCreating] = useState(false);

  const refresh = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      const [nextSpaces, nextProjects] = await Promise.all([
        apiClient.listSpaces(),
        apiClient.listProjects(),
      ]);
      const nextCards = await Promise.all(
        nextProjects.map(async (item) => ({
          item,
          memberCount: (await apiClient.listProjectMembers(item.project.id)).length,
        })),
      );

      setSpaces(nextSpaces);
      setProjects(nextCards);
    } catch (presenterError) {
      setSpaces([]);
      setProjects([]);
      setError(
        presenterError instanceof Error
          ? presenterError.message
          : "Failed to load projects.",
      );
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const createProject = useCallback(async () => {
    try {
      setIsCreating(true);
      setError(null);
      let nextSpaces = spaces;

      if (nextSpaces.length === 0) {
        const createdSpace = await apiClient.createSpace({
          kind: "shared",
          name: runtimeContext.defaultSharedSpaceName,
        });
        nextSpaces = [createdSpace];
        setSpaces(nextSpaces);
      }

      const targetSpace = nextSpaces[0];
      if (!targetSpace) {
        throw new Error("No governance space is available for project creation.");
      }

      await apiClient.createProject(
        {
          name: `${runtimeContext.defaultProjectName} ${Date.now()
            .toString()
            .slice(-4)}`,
          spaceId: targetSpace.id,
        },
      );
      await refresh();
    } catch (presenterError) {
      setError(
        presenterError instanceof Error
          ? presenterError.message
          : "Failed to create project.",
      );
    } finally {
      setIsCreating(false);
    }
  }, [refresh, spaces]);

  return useMemo(
    () => ({
      createProject,
      error,
      isCreating,
      isLoading,
      projects,
      refresh,
      spaces,
    }),
    [
      createProject,
      error,
      isCreating,
      isLoading,
      projects,
      refresh,
      spaces,
    ],
  );
}
