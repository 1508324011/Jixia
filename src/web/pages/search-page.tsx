import { useState } from "react";
import { Link } from "react-router-dom";

import type {
  ImportSourceType,
  LibraryEntryVisibility,
} from "@shared/contracts/library";

import { useSearchPresenter } from "../presenters/search-presenter";

export function SearchPage() {
  const {
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
  } = useSearchPresenter();
  const [sourceLocator, setSourceLocator] = useState("10.1000/jixia-demo");
  const [sourceType, setSourceType] =
    useState<Exclude<ImportSourceType, "upload">>("doi");
  const [visibility, setVisibility] =
    useState<LibraryEntryVisibility>("space_shared");

  return (
    <main className="page-shell">
      <header className="page-header">
        <p className="page-kicker">
          Discovery lane · import staging · donor-style search rhythm
        </p>
        <h1 className="page-title">Search</h1>
        <p className="page-description">
          Search is being upgraded to the ResearchClaw-style discovery surface
          while landing results into explicit personal or project-scoped
          library entries owned by the server.
        </p>
      </header>

      <section aria-label="context bar" className="context-bar">
        <span>
          Discovery workspace · {selectedSpaceId || "No space"} /
          {selectedProjectId || "No project"}
        </span>
        <span className="status-badge">import-ready</span>
        <span className="status-badge">server-first</span>
      </section>

      {error ? (
        <section className="panel-grid" aria-label="search errors">
          <article className="panel">
            <h2 className="panel-title">Search runtime error</h2>
            <p className="quiet-copy">{error}</p>
          </article>
        </section>
      ) : null}

      <section className="panel-grid" aria-label="search layout">
        <article className="panel">
          <h2 className="panel-title">Search surface</h2>
          <label className="quiet-copy" htmlFor="search-space-select">
            Target space
          </label>
          <select
            id="search-space-select"
            value={selectedSpaceId}
            onChange={(event) => setSelectedSpaceId(event.target.value)}
          >
            {spaces.map((space) => (
              <option key={space.id} value={space.id}>
                {space.name}
              </option>
            ))}
          </select>
          <label className="quiet-copy" htmlFor="search-project-select">
            Visible project
          </label>
          <select
            id="search-project-select"
            value={selectedProjectId}
            onChange={(event) => setSelectedProjectId(event.target.value)}
          >
            <option value="">No project selected</option>
            {projects.map((item) => (
              <option key={item.project.id} value={item.project.id}>
                {item.project.name}
              </option>
            ))}
          </select>
          <label className="quiet-copy" htmlFor="search-source-type">
            Source type
          </label>
          <select
            id="search-source-type"
            value={sourceType}
            onChange={(event) =>
              setSourceType(
                event.target.value as Exclude<ImportSourceType, "upload">,
              )
            }
          >
            <option value="doi">DOI</option>
            <option value="pmid">PMID</option>
            <option value="arxiv">arXiv</option>
          </select>
          <label className="quiet-copy" htmlFor="search-source-locator">
            Identifier
          </label>
          <input
            id="search-source-locator"
            value={sourceLocator}
            onChange={(event) => setSourceLocator(event.target.value)}
          />
          <label className="quiet-copy" htmlFor="search-visibility">
            Visibility
          </label>
          <select
            id="search-visibility"
            value={visibility}
            onChange={(event) =>
              setVisibility(event.target.value as LibraryEntryVisibility)
            }
          >
            <option value="private">private</option>
            <option value="space_shared">space_shared</option>
            <option value="published_to_project">published_to_project</option>
          </select>
          <button
            className="panel-link"
            type="button"
            disabled={isImporting || sourceLocator.trim().length === 0}
            onClick={() =>
              void importPaper({
                sourceLocator: sourceLocator.trim(),
                sourceType,
                visibility,
              })
            }
          >
            {isImporting ? "Importing…" : "Import into library"}
          </button>
          <Link
            className="panel-link"
            to={selectedProjectId ? `/projects/${selectedProjectId}/library` : "/projects"}
          >
            Open project library
          </Link>
        </article>

        <article className="panel">
          <h2 className="panel-title">Connector staging</h2>
          {importedRecord ? (
            <>
              <p className="quiet-copy">
                Imported title · {importedRecord.asset.title}
              </p>
              <p className="quiet-copy">
                Canonical id · {importedRecord.asset.canonicalId}
              </p>
              <p className="quiet-copy">
                Entry visibility · {importedRecord.entry.visibility}
                {' '}· Scope · {importedRecord.entry.scope.type}/
                {importedRecord.entry.scope.id}
              </p>
              <Link
                className="panel-link"
                to={selectedProjectId ? `/projects/${selectedProjectId}/library` : "/projects"}
              >
                Open imported library lane
              </Link>
            </>
          ) : (
            <p className="quiet-copy">
              PMID, DOI, and arXiv import flows are now live through the
              browser-facing runtime without replacing Jixia’s `PaperAsset` +
              `LibraryEntry` semantics.
            </p>
          )}
        </article>
      </section>
    </main>
  );
}
