import { Link } from 'react-router-dom';

const deskCards = [
  {
    action: 'Open Today intake',
    description: 'Pull today’s recommendations into one calm intake desk before anything reaches the reader.',
    title: 'Intake desk',
    to: '/today',
  },
  {
    action: 'Open Library inventory',
    description: 'Review imported literature as a single inventory instead of bouncing between disconnected stacks.',
    title: 'Unified inventory',
    to: '/library',
  },
  {
    action: 'Open Projects workspace',
    description: 'Move mature evidence into shared project docs without losing the notebook-first rhythm.',
    title: 'Project docs',
    to: '/projects',
  },
] as const;

export function HomePage() {
  return (
    <main className="page-shell dashboard-page">
      <header className="page-header">
        <p className="page-kicker">Editorial lab workbench</p>
        <h1 className="page-title">Research workbench</h1>
        <p className="page-description">
          从 intake、inventory、project docs 三条连续工作面进入，而不是回到旧式摘要面板。
        </p>
      </header>

      <section className="stack-sm" aria-label="home desk">
        <article className="hero-card home-hero">
          <div className="stack-xs">
            <span className="intake-source-board__eyebrow">Workbench rhythm</span>
            <h2 className="panel-title">Move from external intake to shared evidence without changing mental models.</h2>
          </div>
          <p className="quiet-copy">
            Start with today’s intake lanes, keep the inventory readable, and only promote material into shared project writing when the evidence is ready.
          </p>
        </article>

        <div className="panel-grid dashboard-grid">
          {deskCards.map((card) => (
            <section key={card.title} className="panel home-desk-card" aria-label={card.title}>
              <h2 className="panel-title">{card.title}</h2>
              <p className="quiet-copy">{card.description}</p>
              <Link className="panel-link" to={card.to}>
                {card.action}
              </Link>
            </section>
          ))}
        </div>
      </section>
    </main>
  );
}
