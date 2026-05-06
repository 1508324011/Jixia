import { useCallback, useEffect, useMemo, useRef, useState } from "react";

import type {
  ProjectDocCitationRecord,
  ProjectDocRecord,
  ProjectDocSnapshot,
} from "@shared/contracts/project-docs";

import { apiClient } from "../lib/http-client";
import { useProjectContext } from "./project-context";
import { demoActorContext } from "./runtime-context";

interface SaveProjectDocInput {
  citations: Array<{ evidenceSpan?: string; paperAssetId: string }>;
  content: string;
}

export interface ProjectDocPresenterViewModel {
  citations: ProjectDocCitationRecord[];
  content: string;
  document: ProjectDocRecord | null;
  error: string | null;
  isLoading: boolean;
  isProjectLoading: boolean;
  isSaving: boolean;
  project: ReturnType<typeof useProjectContext>["project"];
  projectError: string | null;
  refresh(): Promise<void>;
  save(input: SaveProjectDocInput): Promise<void>;
  snapshot: ProjectDocSnapshot | null;
}

function buildProjectDocMismatchError(
  documentId: string,
  routeProjectId: string,
  resolvedProjectId: string,
): string {
  return `Document ${documentId} belongs to project ${resolvedProjectId}, not route project ${routeProjectId}.`;
}

export function useProjectDocPresenter(
  projectId?: string,
  documentId?: string,
): ProjectDocPresenterViewModel {
  const projectContext = useProjectContext(projectId);
  const [snapshot, setSnapshot] = useState<ProjectDocSnapshot | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const isMountedRef = useRef(false);
  const requestGenerationRef = useRef(0);
  const requestKindRef = useRef<"refresh" | "save" | null>(null);

  const canCommitRequest = useCallback((generation: number) => {
    return isMountedRef.current && requestGenerationRef.current === generation;
  }, []);

  const invalidatePendingRequests = useCallback(() => {
    requestGenerationRef.current += 1;
    requestKindRef.current = null;
    setIsLoading(false);
    setIsSaving(false);
  }, []);

  const beginRequest = useCallback((kind: "refresh" | "save") => {
    const generation = requestGenerationRef.current + 1;
    requestGenerationRef.current = generation;
    requestKindRef.current = kind;

    if (kind === "refresh") {
      setIsLoading(true);
      setIsSaving(false);
    } else {
      setIsSaving(true);
      setIsLoading(false);
    }

    return generation;
  }, []);

  const completeRequest = useCallback(
    (generation: number, kind: "refresh" | "save") => {
      if (!canCommitRequest(generation) || requestKindRef.current !== kind) {
        return;
      }

      requestKindRef.current = null;

      if (kind === "refresh") {
        setIsLoading(false);
        return;
      }

      setIsSaving(false);
    },
    [canCommitRequest],
  );

  const refresh = useCallback(async () => {
    if (!projectId || !documentId || !projectContext.project || projectContext.error) {
      invalidatePendingRequests();
      setSnapshot(null);
      setError(null);
      setIsLoading(false);
      return;
    }

    const generation = beginRequest("refresh");

    try {
      setError(null);
      const nextSnapshot = await apiClient.getProjectDoc(
        documentId,
        demoActorContext.actorUserId,
      );

      if (!canCommitRequest(generation)) {
        return;
      }

      setSnapshot(nextSnapshot);

      if (nextSnapshot.document.projectId !== projectId) {
        setError(
          buildProjectDocMismatchError(
            documentId,
            projectId,
            nextSnapshot.document.projectId,
          ),
        );
      }
    } catch (presenterError) {
      if (!canCommitRequest(generation)) {
        return;
      }

      setSnapshot(null);
      setError(
        presenterError instanceof Error
          ? presenterError.message
          : "Failed to load the project document.",
      );
    } finally {
      completeRequest(generation, "refresh");
    }
  }, [beginRequest, canCommitRequest, completeRequest, documentId, invalidatePendingRequests, projectContext.error, projectContext.project, projectId]);

  const save = useCallback(
    async (input: SaveProjectDocInput) => {
      if (!projectId || !documentId || !projectContext.project) {
        invalidatePendingRequests();
        setError("A visible project and document route are required before saving.");
        return;
      }

      const generation = beginRequest("save");

      try {
        setError(null);
        const nextSnapshot = await apiClient.saveProjectDocVersion(
          documentId,
          input,
          demoActorContext.actorUserId,
        );

        if (!canCommitRequest(generation)) {
          return;
        }

        setSnapshot(nextSnapshot);

        if (nextSnapshot.document.projectId !== projectId) {
          setError(
            buildProjectDocMismatchError(
              documentId,
              projectId,
              nextSnapshot.document.projectId,
            ),
          );
        }
      } catch (presenterError) {
        if (!canCommitRequest(generation)) {
          return;
        }

        setError(
          presenterError instanceof Error
            ? presenterError.message
            : "Failed to save the project document.",
        );
      } finally {
        completeRequest(generation, "save");
      }
    },
    [beginRequest, canCommitRequest, completeRequest, documentId, invalidatePendingRequests, projectContext.project, projectId],
  );

  useEffect(() => {
    isMountedRef.current = true;

    return () => {
      isMountedRef.current = false;
      invalidatePendingRequests();
    };
  }, [invalidatePendingRequests]);

  useEffect(() => {
    if (projectContext.isLoading) {
      return;
    }

    if (projectContext.error || !projectContext.project || !projectId || !documentId) {
      invalidatePendingRequests();
      setSnapshot(null);
      setError(null);
      setIsLoading(false);
      return;
    }

    void refresh();
  }, [documentId, invalidatePendingRequests, projectContext.error, projectContext.isLoading, projectContext.project, projectId, refresh]);

  return useMemo(
    () => ({
      citations: snapshot?.citations ?? [],
      content: snapshot?.content ?? "",
      document: snapshot?.document ?? null,
      error,
      isLoading,
      isProjectLoading: projectContext.isLoading,
      isSaving,
      project: projectContext.project,
      projectError: projectContext.error,
      refresh,
      save,
      snapshot,
    }),
    [error, isLoading, isSaving, projectContext.error, projectContext.isLoading, projectContext.project, refresh, save, snapshot],
  );
}
