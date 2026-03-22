import { Link, useParams } from 'react-router-dom';

export function LibraryPage() {
  const { spaceId = 'shared-space', projectId = 'tumor-board' } = useParams();

  return (
    <main className="page-shell">
      <header className="page-header">
        <p className="page-kicker">Shared space · curated collection · visibility-aware entries</p>
        <h1 className="page-title">Library</h1>
        <p className="page-description">
          Review imported literature entries, metadata, and reading readiness
          inside the selected space.
        </p>
      </header>

      <section aria-label="context bar" className="context-bar">
        <span>Context · {spaceId} / {projectId}</span>
        <span className="status-badge">space_shared</span>
        <span className="status-badge">pmid import</span>
      </section>

      <section className="panel-grid" aria-label="library list">
        <article className="panel">
          <h2 className="panel-title">Signal pathways in shared tumor boards</h2>
          <p className="quiet-copy">
            Authors · Source metadata · <span className="status-badge">space_shared</span>
          </p>
          <p className="quiet-copy">Shared context · {spaceId}</p>
          <p className="quiet-copy">Project · {projectId}</p>
          <p className="quiet-copy">Visibility · space_shared</p>
          <Link
            className="panel-link"
            to={`/spaces/${spaceId}/projects/${projectId}/library/entry-1/reader`}
          >
            Open reader
          </Link>
        </article>

        <article className="panel">
          <h2 className="panel-title">Loading state placeholder</h2>
          <p className="quiet-copy">
            Import queue and reading-state activity will settle here.
          </p>
        </article>

        <article className="panel">
          <h2 className="panel-title">Empty shelf placeholder</h2>
          <p className="quiet-copy">
            Use DOI, PMID, arXiv, or upload import paths when a space has no entries yet.
          </p>
        </article>
      </section>
    </main>
  );
}
