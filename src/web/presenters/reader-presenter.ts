import { useCallback, useEffect, useMemo, useState } from "react";

import type { GeneratedInsightRecord } from "@shared/contracts/evidence";
import type { LibraryEntryView } from "@shared/contracts/library";
import type { ProjectListItem } from "@shared/contracts/projects";
import type {
  NoteRecord,
  ProjectReadingCommentRecord,
  ReadingDetail,
} from "@shared/contracts/reading";

import { apiClient } from "../lib/http-client";
import { useProjectContext } from "./project-context";

export interface ReaderViewModel {
  asset: LibraryEntryView["asset"] | null;
  entry: LibraryEntryView["entry"] | null;
  error: string | null;
  insights: GeneratedInsightRecord[];
  isLoading: boolean;
  isMutating: boolean;
  notes: NoteRecord[];
  projectComments: ProjectReadingCommentRecord[];
  project: ProjectListItem | null;
  refresh(): Promise<void>;
  saveGeneratedInsight(summary?: string, title?: string): Promise<void>;
  saveNote(body: string): Promise<void>;
  saveProjectComment(body: string): Promise<void>;
}

export function useReaderPresenter(
  projectId: string,
  entryId: string,
): ReaderViewModel {
  const projectContext = useProjectContext(projectId);
  const [detail, setDetail] = useState<ReadingDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [isMutating, setIsMutating] = useState(false);

  const refresh = useCallback(async () => {
    if (!projectContext.project) {
      setDetail(null);
      setError(projectContext.error);
      return;
    }

    try {
      setIsLoading(true);
      setError(null);
      const nextDetail = await apiClient.getReadingDetail(entryId);

      if (
        nextDetail &&
        (
          nextDetail.entry.scope.type !== 'project' ||
          nextDetail.entry.scope.id !== projectContext.project.project.id
        )
      ) {
        setDetail(null);
        setError(
          `Library entry ${entryId} is not available in project ${projectContext.project.project.id}.`,
        );
        return;
      }

      setDetail(nextDetail);
    } catch (presenterError) {
      setDetail(null);
      setError(
        presenterError instanceof Error
          ? presenterError.message
          : "Failed to load reader detail.",
      );
    } finally {
      setIsLoading(false);
    }
  }, [entryId, projectContext.error, projectContext.project]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const saveNote = useCallback(
    async (body: string) => {
      if (!projectContext.project || !detail) {
        setError("No visible project is available for note storage.");
        return;
      }

      try {
        setIsMutating(true);
        setError(null);
        await apiClient.createReadingNote({
          body,
          libraryEntryId: entryId,
        });
        await refresh();
      } catch (presenterError) {
        setError(
          presenterError instanceof Error
            ? presenterError.message
            : "Failed to save note.",
        );
      } finally {
        setIsMutating(false);
      }
    },
    [detail, entryId, projectContext.project, refresh],
  );

  const saveProjectComment = useCallback(
    async (body: string) => {
      if (!projectContext.project || !detail) {
        setError("No visible project is available for project comment storage.");
        return;
      }

      try {
        setIsMutating(true);
        setError(null);
        await apiClient.createProjectReadingComment({
          body,
          libraryEntryId: entryId,
          projectId: projectContext.project.project.id,
        });
        await refresh();
      } catch (presenterError) {
        setError(
          presenterError instanceof Error
            ? presenterError.message
            : "Failed to save project comment.",
        );
      } finally {
        setIsMutating(false);
      }
    },
    [detail, entryId, projectContext.project, refresh],
  );

  const saveGeneratedInsight = useCallback(
    async (summary?: string, title?: string) => {
      if (!projectContext.project || !detail) {
        setError("No visible project is available for generated insight storage.");
        return;
      }

      try {
        setIsMutating(true);
        setError(null);
        await apiClient.saveReadingInsight({
          evidenceSpans: [
            {
              endOffset: 18,
              quote: "shared review data",
              startOffset: 0,
            },
          ],
          libraryEntryId: entryId,
          summary:
            summary?.trim() ||
            "The imported paper supports the shared review workflow.",
          title: title?.trim() || "AI summary",
        });
        await refresh();
      } catch (presenterError) {
        setError(
          presenterError instanceof Error
            ? presenterError.message
            : "Failed to save generated insight.",
        );
      } finally {
        setIsMutating(false);
      }
    },
    [detail, entryId, projectContext.project, refresh],
  );

  return useMemo(
    () => ({
      asset: detail?.asset ?? null,
      entry: detail?.entry ?? null,
      error: error ?? projectContext.error,
      insights: detail?.insights ?? [],
      isLoading: isLoading || projectContext.isLoading,
      isMutating,
      notes: detail?.notes ?? [],
      projectComments: detail?.projectComments ?? [],
      project: projectContext.project,
      refresh,
      saveGeneratedInsight,
      saveNote,
      saveProjectComment,
    }),
    [
      detail,
      error,
      isLoading,
      isMutating,
      projectContext,
      refresh,
      saveGeneratedInsight,
      saveNote,
      saveProjectComment,
    ],
  );
}
