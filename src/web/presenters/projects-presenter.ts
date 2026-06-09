import { useCallback, useEffect, useMemo, useState } from "react";

import type { ProjectListItem } from "@shared/contracts/projects";
import type { SpaceSummary } from "@shared/contracts/spaces";

import { apiClient } from "../lib/http-client";

export interface CreateProjectInput {
  name: string;
  spaceId: string;
}

export interface ProjectCardView {
  item: ProjectListItem;
}

export interface ProjectsViewModel {
  createProject(input: CreateProjectInput): Promise<boolean>;
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
      const nextCards = nextProjects.map((item) => ({ item }));

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

  const createProject = useCallback(async (input: CreateProjectInput) => {
    try {
      setIsCreating(true);
      setError(null);

      const name = input.name.trim();
      if (!name) {
        throw new Error("Enter a project name before creating a collaboration lane.");
      }

      const targetSpace = spaces.find((space) => space.id === input.spaceId);
      if (!targetSpace) {
        throw new Error("Select a visible governance space before creating a project.");
      }

      await apiClient.createProject(
        {
          name,
          spaceId: input.spaceId,
        },
      );
      await refresh();
      return true;
    } catch (presenterError) {
      setError(
        presenterError instanceof Error
          ? presenterError.message
          : "Failed to create project.",
      );
      return false;
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
