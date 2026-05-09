import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type { ProjectListItem } from "@shared/contracts/projects";

import { apiClient } from "../lib/http-client";

export interface ProjectContextViewModel {
  error: string | null;
  isLoading: boolean;
  project: ProjectListItem | null;
  projects: ProjectListItem[];
  refresh(): Promise<void>;
}

function selectProject(
  projects: ProjectListItem[],
  projectId: string | undefined,
): ProjectListItem | null {
  if (projectId) {
    return projects.find((item) => item.project.id === projectId) ?? null;
  }

  return projects[0] ?? null;
}

export function useProjectContext(
  projectId?: string,
): ProjectContextViewModel {
  const [projects, setProjects] = useState<ProjectListItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const isMountedRef = useRef(false);
  const refreshGenerationRef = useRef(0);

  const canCommitRefresh = useCallback((generation: number) => {
    return isMountedRef.current && refreshGenerationRef.current === generation;
  }, []);

  const refresh = useCallback(async () => {
    const generation = refreshGenerationRef.current + 1;
    refreshGenerationRef.current = generation;

    if (!isMountedRef.current) {
      return;
    }

    try {
      setIsLoading(true);
      setError(null);
      const nextProjects = await apiClient.listProjects();

      if (!canCommitRefresh(generation)) {
        return;
      }

      setProjects(nextProjects);
    } catch (presenterError) {
      if (!canCommitRefresh(generation)) {
        return;
      }

      setProjects([]);
      setError(
        presenterError instanceof Error
          ? presenterError.message
          : "Failed to load projects.",
      );
    } finally {
      if (canCommitRefresh(generation)) {
        setIsLoading(false);
      }
    }
  }, [canCommitRefresh]);

  useEffect(() => {
    isMountedRef.current = true;
    void refresh();

    return () => {
      isMountedRef.current = false;
      refreshGenerationRef.current += 1;
    };
  }, [refresh]);

  const project = useMemo(
    () => selectProject(projects, projectId),
    [projectId, projects],
  );

  const derivedError = useMemo(() => {
    if (error) {
      return error;
    }

    if (projectId && projects.length > 0 && !project) {
      return `Project ${projectId} is not visible to the current actor.`;
    }

    return null;
  }, [error, project, projectId, projects.length]);

  return useMemo(
    () => ({
      error: derivedError,
      isLoading,
      project,
      projects,
      refresh,
    }),
    [derivedError, isLoading, project, projects, refresh],
  );
}
