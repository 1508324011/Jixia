import { Link, useParams } from 'react-router-dom';

interface LibraryPageProps {
  mode?: 'personal' | 'project';
}

export function LibraryPage({ mode = 'project' }: LibraryPageProps) {
  const { spaceId = 'shared-space', projectId = 'tumor-board' } = useParams();
  const isPersonalMode = mode === 'personal';
  const kicker = isPersonalMode
    ? 'Personal library · imported references · ready to sort'
    : 'Shared space · curated collection · visibility-aware entries';
  const description = isPersonalMode
    ? 'Review imported literature entries and decide what stays personal versus what should move into a project workspace.'
    : 'Review imported literature entries, metadata, and reading readiness inside the selected space.';
  const contextLabel = isPersonalMode ? 'Personal context' : `Context · ${spaceId} / ${projectId}`;
  const libraryTitle = 'Library';
  const entryContext = isPersonalMode ? 'Personal shelf' : `Project · ${projectId}`;
  const readerLink = isPersonalMode
    ? `/projects/project-1/library/entry-1/reader`
    : `/spaces/${spaceId}/projects/${projectId}/library/entry-1/reader`;

  return (
    <main className="page-shell">
      <header className="page-header">
        <p className="page-kicker">{kicker}</p>
        <h1 className="page-title">{libraryTitle}</h1>
        <p className="page-description">{description}</p>
      </header>

      <section aria-label="context bar" className="context-bar">
        <span>{contextLabel}</span>
        <span className="status-badge">{isPersonalMode ? 'personal' : 'space_shared'}</span>
        <span className="status-badge">pmid import</span>
      </section>

      <section className="panel-grid" aria-label="library list">
        <article className="panel">
          <h2 className="panel-title">Signal pathways in shared tumor boards</h2>
          <p className="quiet-copy">
            Authors · Source metadata · <span className="status-badge">space_shared</span>
          </p>
          <p className="quiet-copy">
            {isPersonalMode ? 'Source · Imported into Personal Library' : `Shared context · ${spaceId}`}
          </p>
          <p className="quiet-copy">{entryContext}</p>
          <p className="quiet-copy">Visibility · {isPersonalMode ? 'private' : 'space_shared'}</p>
          <Link className="panel-link" to={readerLink}>
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
