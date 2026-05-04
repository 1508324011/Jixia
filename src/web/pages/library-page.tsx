import { Link, useParams } from "react-router-dom";

import { useLibraryPresenter } from "../presenters/library-presenter";

export function LibraryPage() {
  const { projectId = "" } = useParams();
  const { entries, error, isLoading, project, refresh } =
    useLibraryPresenter(projectId);
  const spaceId = project?.project.spaceId ?? "No governance space";
  const projectLabel = project?.project.name ?? (projectId || "No project");
  const contextProjectId = project?.project.id ?? projectId;

  return (
    <main className="page-shell">
      <header className="page-header">
        <p className="page-kicker">
          Project library · server-owned collaboration context
        </p>
        <h1 className="page-title">Library</h1>
        <p className="page-description">
          Review imported literature entries, metadata, and reading readiness
          inside the selected project. This slice still reads the current
          space-backed library API through the project governance space.
        </p>
      </header>

      <section aria-label="context bar" className="context-bar">
        <span>
          Context · {spaceId} / {contextProjectId || "No project"}
        </span>
        <span className="status-badge">{projectLabel}</span>
        <span className="status-badge">pmid import</span>
        <button
          className="panel-link"
          type="button"
          onClick={() => void refresh()}
        >
          Refresh
        </button>
      </section>

      {error ? (
        <section className="panel-grid" aria-label="library errors">
          <article className="panel">
            <h2 className="panel-title">Library runtime error</h2>
            <p className="quiet-copy">{error}</p>
          </article>
        </section>
      ) : null}

      <section className="panel-grid" aria-label="library list">
        {entries.map((record) => (
          <article key={record.entry.id} className="panel">
            <h2 className="panel-title">{record.asset.title}</h2>
            <p className="quiet-copy">
              Canonical id · {record.asset.canonicalId} ·{" "}
              <span className="status-badge">{record.entry.visibility}</span>
            </p>
            <p className="quiet-copy">Shared context · {spaceId}</p>
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

        <article className="panel">
          <h2 className="panel-title">Loading state placeholder</h2>
          <p className="quiet-copy">
            {isLoading
              ? "Loading library entries from the browser-facing runtime."
              : "Import queue and reading-state activity will settle here."}
          </p>
        </article>

        <article className="panel">
          <h2 className="panel-title">Empty shelf placeholder</h2>
          <p className="quiet-copy">
            {entries.length === 0
              ? "Use DOI, PMID, or arXiv import paths when a space has no entries yet."
              : "Search can now keep landing new imports into this space-aware library list."}
          </p>
        </article>
      </section>
    </main>
  );
}
