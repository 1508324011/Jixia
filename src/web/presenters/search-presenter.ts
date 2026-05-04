import { useCallback, useEffect, useMemo, useState } from "react";

import type {
  ImportSourceType,
  LibraryEntryView,
  LibraryEntryVisibility,
} from "@shared/contracts/library";
import type { ProjectListItem } from "@shared/contracts/projects";
import type { SpaceSummary } from "@shared/contracts/spaces";

import { apiClient } from "../lib/http-client";
import { demoActorContext } from "./runtime-context";

export interface SearchViewModel {
  error: string | null;
  importPaper(input: {
    sourceLocator: string;
    sourceType: Exclude<ImportSourceType, "upload">;
    visibility: LibraryEntryVisibility;
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
  const [spaces, setSpaces] = useState<SpaceSummary[]>([]);
  const [projects, setProjects] = useState<ProjectListItem[]>([]);
  const [selectedSpaceId, setSelectedSpaceId] = useState("");
  const [selectedProjectId, setSelectedProjectId] = useState("");
  const [importedRecord, setImportedRecord] = useState<LibraryEntryView | null>(
    null,
  );
  const [error, setError] = useState<string | null>(null);
  const [isImporting, setIsImporting] = useState(false);

  useEffect(() => {
    void (async () => {
      try {
        const [nextSpaces, nextProjects] = await Promise.all([
          apiClient.listSpaces(demoActorContext.actorUserId),
          apiClient.listProjects(demoActorContext.actorUserId),
        ]);
        if (nextSpaces.length > 0) {
          setSpaces(nextSpaces);
          setSelectedSpaceId(nextSpaces[0].id);
        }
        if (nextProjects.length > 0) {
          setProjects(nextProjects);
          setSelectedProjectId(nextProjects[0].project.id);
          setSelectedSpaceId((currentSpaceId) =>
            currentSpaceId || nextProjects[0].project.spaceId,
          );
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
      visibility: LibraryEntryVisibility;
    }) => {
      try {
        setIsImporting(true);
        setError(null);

        let nextSpaceId =
          selectedSpaceId ||
          projects.find((item) => item.project.id === selectedProjectId)?.project
            .spaceId ||
          "";
        if (!nextSpaceId) {
          const createdSpace = await apiClient.createSpace(
            demoActorContext.actorUserId,
            {
              kind: "shared",
              name: demoActorContext.defaultSharedSpaceName,
            },
          );
          nextSpaceId = createdSpace.id;
          setSpaces((currentSpaces) => [createdSpace, ...currentSpaces]);
          setSelectedSpaceId(createdSpace.id);
        }

        const nextRecord = await apiClient.importPaper({
          requestedByUserId: demoActorContext.actorUserId,
          sourceLocator: input.sourceLocator,
          sourceType: input.sourceType,
          spaceId: nextSpaceId,
          visibility: input.visibility,
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
    [projects, selectedProjectId, selectedSpaceId],
  );

  return useMemo(
    () => ({
      error,
      importPaper,
      importedRecord,
      isImporting,
      projects,
      selectedProjectId,
      setSelectedProjectId,
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
      selectedProjectId,
      selectedSpaceId,
      spaces,
    ],
  );
}
