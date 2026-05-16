import { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";

import type { LibraryListResponse } from "@shared/contracts/library";

import { apiClient } from "../lib/http-client";
import { useLibraryPresenter } from "../presenters/library-presenter";

interface LibraryPageProps {
  mode?: "personal" | "project";
}

export function LibraryPage({ mode = "project" }: LibraryPageProps) {
  const { spaceId: routeSpaceId, projectId = "" } = useParams();
  const isPersonalMode = mode === "personal";
  const {
    adoptEntryToProject,
    entries: projectEntries,
    error: projectError,
    isLoading: projectIsLoading,
    project,
    projects,
    refresh,
  } = useLibraryPresenter(projectId, { loadProjectEntries: !isPersonalMode });
  const [personalEntries, setPersonalEntries] =
    useState<LibraryListResponse["entries"]>([]);
  const [personalError, setPersonalError] = useState<string | null>(null);
  const [personalIsLoading, setPersonalIsLoading] = useState(isPersonalMode);
  const [selectedAdoptionProjectId, setSelectedAdoptionProjectId] = useState("");
  const [adoptingEntryId, setAdoptingEntryId] = useState<string | null>(null);
  const [adoptionMessage, setAdoptionMessage] = useState<string | null>(null);
  const [adoptionError, setAdoptionError] = useState<string | null>(null);
  const [adoptionTargetPath, setAdoptionTargetPath] = useState<string | null>(null);

  const loadPersonalLibrary = useCallback(async () => {
    setPersonalIsLoading(true);
    setPersonalError(null);

    try {
      const response = await apiClient.listPersonalLibraryEntries();
      setPersonalEntries(response.entries);
    } catch (error) {
      setPersonalEntries([]);
      setPersonalError(
        error instanceof Error ? error.message : "Library request failed.",
      );
    } finally {
      setPersonalIsLoading(false);
    }
  }, []);

  useEffect(() => {
    if (!isPersonalMode) {
      return;
    }

    let isMounted = true;

    async function load(): Promise<void> {
      setPersonalIsLoading(true);
      setPersonalError(null);

      try {
        const response = await apiClient.listPersonalLibraryEntries();

        if (isMounted) {
          setPersonalEntries(response.entries);
        }
      } catch (error) {
        if (isMounted) {
          setPersonalEntries([]);
          setPersonalError(
            error instanceof Error ? error.message : "Library request failed.",
          );
        }
      } finally {
        if (isMounted) {
          setPersonalIsLoading(false);
        }
      }
    }

    void load();

    return () => {
      isMounted = false;
    };
  }, [isPersonalMode]);

  useEffect(() => {
    if (!isPersonalMode) {
      return;
    }

    setSelectedAdoptionProjectId((currentProjectId) => {
      if (
        currentProjectId &&
        projects.some((item) => item.project.id === currentProjectId)
      ) {
        return currentProjectId;
      }

      return projects[0]?.project.id ?? "";
    });
  }, [isPersonalMode, projects]);

  const handleAdoptEntry = useCallback(
    async (sourceLibraryEntryId: string) => {
      if (!selectedAdoptionProjectId) {
        setAdoptionError("Select a visible project before adopting this source.");
        setAdoptionMessage(null);
        setAdoptionTargetPath(null);
        return;
      }

      setAdoptingEntryId(sourceLibraryEntryId);
      setAdoptionError(null);
      setAdoptionMessage(null);
      setAdoptionTargetPath(null);

      try {
        const response = await adoptEntryToProject({
          sourceLibraryEntryId,
          targetProjectId: selectedAdoptionProjectId,
        });
        setAdoptionMessage(
          response.reused
            ? `${response.entry.asset.title} was already available in ${response.project.project.name}.`
            : `${response.entry.asset.title} is now available in ${response.project.project.name}.`,
        );
        setAdoptionTargetPath(`/projects/${response.project.project.id}/library`);
      } catch (error) {
        setAdoptionError(
          error instanceof Error ? error.message : "Failed to adopt source into project.",
        );
        setAdoptionTargetPath(null);
      } finally {
        setAdoptingEntryId(null);
      }
    },
    [adoptEntryToProject, selectedAdoptionProjectId],
  );

  const resolvedSpaceId =
    project?.project.spaceId ?? routeSpaceId ?? "No governance space";
  const projectLabel = project?.project.name ?? (projectId || "No project");
  const contextProjectId = project?.project.id ?? projectId;
  const isLoading = isPersonalMode ? personalIsLoading : projectIsLoading;
  const error = isPersonalMode ? personalError ?? projectError : projectError;
  const kicker = isPersonalMode
    ? "Personal library · imported references · ready to sort"
    : "Project library · server-owned collaboration context";
  const description = isPersonalMode
    ? "Review imported literature entries and decide what stays personal versus what should move into a project workspace."
    : "Review imported literature entries, metadata, and reading readiness inside the selected project. This slice reads the scoped library API through ProjectMember authority while Space stays governance-only.";

  return (
    <main className="page-shell">
      <header className="page-header">
        <p className="page-kicker">{kicker}</p>
        <h1 className="page-title">Library</h1>
        <p className="page-description">{description}</p>
      </header>

      <section aria-label="context bar" className="context-bar">
        <span>
          {isPersonalMode
            ? "Personal context"
            : `Context · ${resolvedSpaceId} / ${contextProjectId || "No project"}`}
        </span>
        <span className="status-badge">
          {isPersonalMode ? "personal" : projectLabel}
        </span>
        {isPersonalMode ? (
          <span className="status-badge">project adoption explicit</span>
        ) : null}
        <span className="status-badge">pmid import</span>
        <button
          className="panel-link"
          type="button"
          onClick={() => void (isPersonalMode ? loadPersonalLibrary() : refresh())}
        >
          Refresh
        </button>
      </section>

      {isPersonalMode ? (
        <section className="panel" aria-label="project adoption controls">
          <h2 className="panel-title">Adopt personal source into project</h2>
          <p className="quiet-copy">
            Make a readable personal source citable in a project by creating or reusing the
            server-owned project LibraryEntry. Private notes, reading state, and Notebook
            content stay personal.
          </p>
          <label className="quiet-copy" htmlFor="library-adoption-project-select">
            Visible target project
          </label>
          <select
            id="library-adoption-project-select"
            value={selectedAdoptionProjectId}
            onChange={(event) => setSelectedAdoptionProjectId(event.target.value)}
          >
            {projects.length === 0 ? (
              <option value="">No visible projects</option>
            ) : null}
            {projects.map((item) => (
              <option key={item.project.id} value={item.project.id}>
                {item.project.name}
              </option>
            ))}
          </select>
          {adoptionMessage ? <p className="quiet-copy">{adoptionMessage}</p> : null}
          {adoptionTargetPath ? (
            <Link className="panel-link" to={adoptionTargetPath}>
              Open target project library
            </Link>
          ) : null}
          {adoptionError ? <p className="quiet-copy">{adoptionError}</p> : null}
        </section>
      ) : null}

      {error ? (
        <section className="panel-grid" aria-label="library errors">
          <article className="panel">
            <h2 className="panel-title">
              {isPersonalMode ? "Library unavailable" : "Library runtime error"}
            </h2>
            <p className="quiet-copy">{error}</p>
          </article>
        </section>
      ) : null}

      <section className="panel-grid" aria-label="library list">
        {isPersonalMode && isLoading ? (
          <article className="panel">
            <h2 className="panel-title">Loading library entries…</h2>
            <p className="quiet-copy">
              Import metadata and reading readiness are loading from the server.
            </p>
          </article>
        ) : null}

        {isPersonalMode && !isLoading && !error && personalEntries.length === 0 ? (
          <article className="panel">
            <h2 className="panel-title">No imported literature yet</h2>
            <p className="quiet-copy">
              Search PubMed or import a recommendation from Today to seed your
              personal shelf.
            </p>
          </article>
        ) : null}

        {isPersonalMode
          ? personalEntries.map((entry) => (
              <article key={entry.entryId} className="panel">
                <h2 className="panel-title">{entry.title}</h2>
                <p className="quiet-copy">Canonical record · {entry.canonicalId}</p>
                <p className="quiet-copy">Source · Imported into Personal Library</p>
                <p className="quiet-copy">Personal shelf</p>
                <p className="quiet-copy">Visibility · {entry.visibility}</p>
                <Link
                  className="panel-link"
                  to={`/library/${entry.entryId}/reader`}
                >
                  Open reader
                </Link>
                <button
                  className="panel-link"
                  type="button"
                  disabled={
                    adoptingEntryId === entry.entryId || selectedAdoptionProjectId.length === 0
                  }
                  onClick={() => void handleAdoptEntry(entry.entryId)}
                >
                  {adoptingEntryId === entry.entryId
                    ? "Adopting into project…"
                    : "Adopt into selected project"}
                </button>
              </article>
            ))
          : projectEntries.map((record) => (
              <article key={record.entry.id} className="panel">
                <h2 className="panel-title">{record.asset.title}</h2>
                <p className="quiet-copy">
                  Canonical id · {record.asset.canonicalId} ·{" "}
                  <span className="status-badge">{record.entry.visibility}</span>
                </p>
                <p className="quiet-copy">Shared context · {resolvedSpaceId}</p>
                <p className="quiet-copy">Project · {projectLabel}</p>
                <p className="quiet-copy">Visibility · {record.entry.visibility}</p>
                <Link
                  className="panel-link"
                  to={`/projects/${contextProjectId}/library/${record.entry.id}/reader`}
                >
                  Open reader
                </Link>
              </article>
            ))}

        {!isPersonalMode ? (
          <article className="panel">
            <h2 className="panel-title">Loading state placeholder</h2>
            <p className="quiet-copy">
              {isLoading
                ? "Loading library entries from the browser-facing runtime."
                : "Import queue and reading-state activity will settle here."}
            </p>
          </article>
        ) : null}

        {!isPersonalMode ? (
          <article className="panel">
            <h2 className="panel-title">Empty shelf placeholder</h2>
            <p className="quiet-copy">
              {projectEntries.length === 0
                ? "Use DOI, PMID, or arXiv import paths when a space has no entries yet."
                : "Search can now keep landing new imports into this project-scoped library list."}
            </p>
          </article>
        ) : null}
      </section>
    </main>
  );
}
