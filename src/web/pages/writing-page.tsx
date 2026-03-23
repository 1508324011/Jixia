import { useParams } from 'react-router-dom';

export function WritingPage() {
  const {
    spaceId = 'shared-space',
    projectId = 'tumor-board',
    docId = 'doc-1',
  } = useParams();

  return (
    <main className="page-shell">
      <header className="page-header">
        <p className="page-kicker">Manuscript studio · versioned drafting · citation traceability</p>
        <h1 className="page-title">Writing</h1>
        <p className="page-description">
          Draft the shared document while keeping versions, citations, and
          publish state visible but quiet.
        </p>
        <p className="quiet-copy">
          Mature content path · AI 对话 → 私人笔记 → 共享评论 → Writer 文稿
        </p>
      </header>

      <section aria-label="context bar" className="context-bar">
        <span>Space context · {spaceId}</span>
        <span>Project context · {projectId} · {docId}</span>
        <span className="status-badge">draft</span>
        <span className="status-badge">governed citations</span>
      </section>

      <section className="panel-grid" aria-label="writing layout">
        <article className="panel">
          <h2 className="panel-title">Draft canvas</h2>
          <p className="quiet-copy">
            Project context · {projectId} · {docId}
          </p>
        </article>
        <aside className="panel">
          <h2 className="panel-title">Versions and references</h2>
          <p className="quiet-copy">review path · published target · citation links</p>
          <p className="quiet-copy">将成熟内容整理进入 Writer</p>
          <p className="quiet-copy">Publish state path</p>
          <p className="quiet-copy">draft · review · published</p>
        </aside>
      </section>
    </main>
  );
}
