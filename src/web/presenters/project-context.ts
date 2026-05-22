import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type {
  ProjectListItem,
} from "@shared/contracts/projects";

import { apiClient } from "../lib/http-client";

export interface ProjectContextViewModel {
  error: string | null;
  isLoading: boolean;
  project: ProjectListItem | null;
  projects: ProjectListItem[];
  refresh(): Promise<void>;
}

interface UseProjectContextOptions {
  selectDefaultProject?: boolean;
}

function selectProject(
  projects: ProjectListItem[],
  projectId: string | undefined,
  selectDefaultProject: boolean,
): ProjectListItem | null {
  if (projectId) {
    return projects.find((item) => item.project.id === projectId) ?? null;
  }

  return selectDefaultProject ? projects[0] ?? null : null;
}

export function useProjectContext(
  projectId?: string,
  options: UseProjectContextOptions = {},
): ProjectContextViewModel {
  const selectDefaultProject = options.selectDefaultProject ?? true;
  const [projects, setProjects] = useState<ProjectListItem[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [hasLoaded, setHasLoaded] = useState(false);
  const [isLoading, setIsLoading] = useState(true);
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
      setHasLoaded(false);
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
        setHasLoaded(true);
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
    () => selectProject(projects, projectId, selectDefaultProject),
    [projectId, projects, selectDefaultProject],
  );

  const derivedError = useMemo(() => {
    if (error) {
      return error;
    }

    if (projectId && hasLoaded && !project) {
      return `Project ${projectId} is not visible to the current actor.`;
    }

    return null;
  }, [error, hasLoaded, project, projectId]);

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
