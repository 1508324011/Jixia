import { Link, useParams } from 'react-router-dom';

import { PaperWorkspaceTabs } from '../components/paper-workspace-tabs';

export function ReaderPage() {
  const {
    spaceId,
    projectId = 'tumor-board',
    entryId = 'entry-1',
  } = useParams();
  const hasSpaceContext = typeof spaceId === 'string' && spaceId.length > 0;
  const legacySpaceId = spaceId ?? 'shared-space';

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
        {hasSpaceContext ? <span>Space context · {spaceId}</span> : null}
        <span>Project context · {projectId}</span>
        <span>Entry · {entryId}</span>
        <span className="status-badge">quoted evidence</span>
        <span className="status-badge">governed AI</span>
      </section>

      <section className="reader-page" aria-label="reading layout">
        <article className="panel paper-surface">
          <h2 className="panel-title">Paper text</h2>
          <p className="quiet-copy">
            Long-form reading surface with traceable source context.
          </p>
        </article>
        <aside className="panel paper-workspace">
          <h2 className="panel-title">Workbench</h2>
          <p className="quiet-copy">
            <span className="status-badge">space_shared note</span> · quoted
            evidence · governed AI summary
          </p>
          <p className="quiet-copy">
            Governed action source · queued → running → succeeded
          </p>
          <PaperWorkspaceTabs />
        </aside>
      </section>

      <Link
        className="panel-link"
        to={`/spaces/${legacySpaceId}/projects/${projectId}/writing/doc-1`}
      >
        Open writing
      </Link>
    </main>
  );
}
