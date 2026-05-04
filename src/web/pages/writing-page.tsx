import { useParams } from 'react-router-dom';

import { useProjectContext } from '../presenters/project-context';

export function WritingPage() {
  const {
    spaceId,
    projectId = '',
    docId = 'doc-1',
  } = useParams();
  const { error, project } = useProjectContext(projectId);
  const resolvedSpaceId = spaceId ?? project?.project.spaceId ?? 'No governance space';
  const projectLabel = project?.project.name ?? (projectId || 'No project');
  const contextProjectId = project?.project.id ?? projectId;

  return (
    <main className="page-shell">
      <header className="page-header">
        <p className="page-kicker">Manuscript studio · versioned drafting · citation traceability</p>
        <h1 className="page-title">Writing</h1>
        <p className="page-description">
          Draft the shared document while keeping versions, citations, and
          publish state visible but quiet.
        </p>
      </header>

      <section aria-label="context bar" className="context-bar">
        <span>Space context · {resolvedSpaceId}</span>
        <span>Project context · {projectLabel} · {docId}</span>
        <span className="status-badge">draft</span>
        <span className="status-badge">governed citations</span>
      </section>

      {error ? (
        <section className="panel-grid" aria-label="writing errors">
          <article className="panel">
            <h2 className="panel-title">Writing runtime error</h2>
            <p className="quiet-copy">{error}</p>
          </article>
        </section>
      ) : null}

      <section className="panel-grid" aria-label="writing layout">
        <article className="panel">
          <h2 className="panel-title">Draft canvas</h2>
          <p className="quiet-copy">
            Project context · {contextProjectId || 'No project'} · {docId}
          </p>
        </article>
        <aside className="panel">
          <h2 className="panel-title">Versions and references</h2>
          <p className="quiet-copy">review path · published target · citation links</p>
          <p className="quiet-copy">Publish state path</p>
          <p className="quiet-copy">draft · review · published</p>
        </aside>
      </section>
    </main>
  );
}
