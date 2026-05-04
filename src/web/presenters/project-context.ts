import { useCallback, useEffect, useMemo, useState } from "react";

import type { ProjectListItem } from "@shared/contracts/projects";

import { apiClient } from "../lib/http-client";
import { demoActorContext } from "./runtime-context";

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

  const refresh = useCallback(async () => {
    try {
      setIsLoading(true);
      setError(null);
      setProjects(await apiClient.listProjects(demoActorContext.actorUserId));
    } catch (presenterError) {
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
