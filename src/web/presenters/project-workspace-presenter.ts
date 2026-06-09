import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type {
  ProjectMemberRecord,
  ProjectRecord,
  ProjectWorkspaceResponse,
} from "@shared/contracts/projects";

import { apiClient } from "../lib/http-client";

export interface ProjectWorkspaceProjectContext {
  membership: ProjectMemberRecord;
  project: ProjectRecord;
}

export interface ProjectWorkspaceViewModel {
  error: string | null;
  isLoading: boolean;
  project: ProjectWorkspaceProjectContext | null;
  refresh(): Promise<void>;
  workspace: ProjectWorkspaceResponse | null;
}

export function useProjectWorkspace(
  projectId?: string,
): ProjectWorkspaceViewModel {
  const [workspace, setWorkspace] = useState<ProjectWorkspaceResponse | null>(null);
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

    if (!projectId) {
      setWorkspace(null);
      setError("The project workspace route requires a project id.");
      setIsLoading(false);
      return;
    }

    try {
      setIsLoading(true);
      setError(null);

      const nextWorkspace = await apiClient.getProjectWorkspace(projectId);

      if (!canCommitRefresh(generation)) {
        return;
      }

      setWorkspace(nextWorkspace);
    } catch (presenterError) {
      if (!canCommitRefresh(generation)) {
        return;
      }

      setWorkspace(null);
      setError(
        presenterError instanceof Error
          ? presenterError.message
          : "Failed to load the project workspace.",
      );
    } finally {
      if (canCommitRefresh(generation)) {
        setIsLoading(false);
      }
    }
  }, [canCommitRefresh, projectId]);

  useEffect(() => {
    isMountedRef.current = true;
    void refresh();

    return () => {
      isMountedRef.current = false;
      refreshGenerationRef.current += 1;
    };
  }, [refresh]);

  const project = useMemo(
    () => workspace
      ? { membership: workspace.membership, project: workspace.project }
      : null,
    [workspace],
  );

  return useMemo(
    () => ({
      error,
      isLoading,
      project,
      refresh,
      workspace,
    }),
    [error, isLoading, project, refresh, workspace],
  );
}
