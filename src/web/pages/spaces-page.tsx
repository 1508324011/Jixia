import { Link } from 'react-router-dom';

export function SpacesPage() {
  return (
    <main className="page-shell">
      <header className="page-header">
        <p className="page-kicker">Space → Project → Entry → Doc</p>
        <h1 className="page-title">Spaces</h1>
        <p className="page-description">
          Enter a personal or shared research context before opening library,
          reading, and writing work.
        </p>
      </header>

      <section className="shell-grid" aria-label="spaces list">
        <article className="hero-card">
          <h2 className="panel-title">Shared Space</h2>
          <p className="quiet-copy">
            Shared membership · editorial visibility · governed jobs
          </p>
          <p className="quiet-copy">Project starter · tumor-board</p>
          <Link
            className="panel-link"
            to="/spaces/shared-space/projects/tumor-board/library"
          >
            Enter shared space
          </Link>
        </article>

        <article className="hero-card">
          <h2 className="panel-title">Personal Space</h2>
          <p className="quiet-copy">
            Personal research lane · private notes · future project handoff
          </p>
          <p className="quiet-copy">Placeholder shell for the next Task 11 step.</p>
        </article>
      </section>
    </main>
  );
}
