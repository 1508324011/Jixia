import { Link, useParams } from 'react-router-dom';

export function ReaderPage() {
  const {
    spaceId = 'shared-space',
    projectId = 'tumor-board',
    entryId = 'entry-1',
  } = useParams();

  return (
    <main className="page-shell">
      <header className="page-header">
        <p className="page-kicker">Reading desk · notes · evidence-linked insight</p>
        <h1 className="page-title">Reader</h1>
        <p className="page-description">
          Read the paper asset while keeping notes, evidence spans, and
          generated insights in view.
        </p>
      </header>

      <section aria-label="context bar" className="context-bar">
        <span>Space context · {spaceId}</span>
        <span>Project context · {projectId}</span>
        <span>Entry · {entryId}</span>
        <span className="status-badge">quoted evidence</span>
        <span className="status-badge">governed AI</span>
      </section>

      <section className="panel-grid" aria-label="reading layout">
        <article className="panel">
          <h2 className="panel-title">Paper text</h2>
          <p className="quiet-copy">
            Long-form reading surface with traceable source context.
          </p>
        </article>
        <aside className="panel">
          <h2 className="panel-title">Workbench</h2>
          <p className="quiet-copy">
            <span className="status-badge">space_shared note</span> · quoted
            evidence · governed AI summary
          </p>
          <p className="quiet-copy">
            Governed action source · queued → running → succeeded
          </p>
        </aside>
      </section>

      <Link
        className="panel-link"
        to={`/spaces/${spaceId}/projects/${projectId}/writing/doc-1`}
      >
        Open writing
      </Link>
    </main>
  );
}
