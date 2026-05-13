import { useCallback, useEffect, useMemo, useState } from "react";

import type {
  ImportSourceType,
  LibraryEntryView,
} from "@shared/contracts/library";
import type { ProjectListItem } from "@shared/contracts/projects";
import type { SpaceSummary } from "@shared/contracts/spaces";

import { apiClient } from "../lib/http-client";
import { useSessionAuth } from "../lib/session-auth";

export interface SearchViewModel {
  error: string | null;
  importPaper(input: {
    sourceLocator: string;
    sourceType: Exclude<ImportSourceType, "upload">;
  }): Promise<void>;
  importedRecord: LibraryEntryView | null;
  isImporting: boolean;
  projects: ProjectListItem[];
  selectedProjectId: string;
  setSelectedProjectId(projectId: string): void;
  selectedSpaceId: string;
  setSelectedSpaceId(spaceId: string): void;
  spaces: SpaceSummary[];
}

export function useSearchPresenter(): SearchViewModel {
  const { user } = useSessionAuth();
  const [spaces, setSpaces] = useState<SpaceSummary[]>([]);
  const [projects, setProjects] = useState<ProjectListItem[]>([]);
  const [selectedSpaceId, setSelectedSpaceId] = useState("");
  const [selectedProjectId, setSelectedProjectId] = useState("");
  const [importedRecord, setImportedRecord] = useState<LibraryEntryView | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);
  const [isImporting, setIsImporting] = useState(false);

  const selectedProject = useMemo(
    () => projects.find((item) => item.project.id === selectedProjectId) ?? null,
    [projects, selectedProjectId],
  );

  const selectProjectId = useCallback(
    (projectId: string) => {
      setSelectedProjectId(projectId);

      const project = projects.find((item) => item.project.id === projectId);
      if (project) {
        setSelectedSpaceId(project.project.spaceId);
      }
    },
    [projects],
  );

  useEffect(() => {
    void (async () => {
      try {
        const [nextSpaces, nextProjects] = await Promise.all([
          apiClient.listSpaces(),
          apiClient.listProjects(),
        ]);
        if (nextSpaces.length > 0) {
          setSpaces(nextSpaces);
          setSelectedSpaceId(nextSpaces[0].id);
        }
        if (nextProjects.length > 0) {
          setProjects(nextProjects);
        }
      } catch (presenterError) {
        setSpaces([]);
        setProjects([]);
        setSelectedSpaceId("");
        setSelectedProjectId("");
        setError(
          presenterError instanceof Error
            ? presenterError.message
            : "Failed to load search context.",
        );
      }
    })();
  }, []);

  const importPaper = useCallback(
    async (input: {
      sourceLocator: string;
      sourceType: Exclude<ImportSourceType, "upload">;
    }) => {
      try {
        setIsImporting(true);
        setError(null);

        if (selectedProjectId && !selectedProject) {
          throw new Error(
            `Project ${selectedProjectId} is not visible to the current actor.`,
          );
        }

        const personalScopeId = user?.id ?? "";
        const scope = selectedProjectId
          ? { id: selectedProjectId, type: "project" as const }
          : { id: personalScopeId, type: "user" as const };
        const nextSpaceId = selectedProject?.project.spaceId ?? selectedSpaceId;
        const nextRecord = await apiClient.importPaper({
          scope,
          sourceLocator: input.sourceLocator,
          sourceType: input.sourceType,
          spaceId: nextSpaceId,
          visibility: scope.type === "project" ? "published_to_project" : "private",
        });

        setImportedRecord(nextRecord);
      } catch (presenterError) {
        setError(
          presenterError instanceof Error
            ? presenterError.message
            : "Failed to import paper.",
        );
      } finally {
        setIsImporting(false);
      }
    },
    [selectedProject, selectedProjectId, selectedSpaceId, user?.id],
  );

  return useMemo(
    () => ({
      error,
      importPaper,
      importedRecord,
      isImporting,
      projects,
      selectedProjectId,
      setSelectedProjectId: selectProjectId,
      selectedSpaceId,
      setSelectedSpaceId,
      spaces,
    }),
    [
      error,
      importPaper,
      importedRecord,
      isImporting,
      projects,
      selectProjectId,
      selectedProjectId,
      selectedSpaceId,
      spaces,
    ],
  );
}
