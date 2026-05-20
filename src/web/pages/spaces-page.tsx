import { Link } from "react-router-dom";

import { useSpacesPresenter } from "../presenters/spaces-presenter";

export function SpacesPage() {
  const { createSpace, error, isCreating, refresh, spaces } =
    useSpacesPresenter();

  return (
    <main className="page-shell">
      <header className="page-header">
        <p className="page-kicker">Space is governance · Project is collaboration</p>
        <h1 className="page-title">Spaces</h1>
        <p className="page-description">
          Manage personal or shared governance containers. Open collaboration
          work from Projects, not from synthetic project slugs.
        </p>
      </header>

      <section className="context-bar" aria-label="spaces actions">
        <span>Visible spaces · {spaces.length}</span>
        <button
          className="panel-link"
          type="button"
          onClick={() => void createSpace("shared")}
          disabled={isCreating}
        >
          Create shared space
        </button>
        <button
          className="panel-link"
          type="button"
          onClick={() => void createSpace("personal")}
          disabled={isCreating}
        >
          Create personal space
        </button>
        <button
          className="panel-link"
          type="button"
          onClick={() => void refresh()}
        >
          Refresh
        </button>
      </section>

      {error ? (
        <section className="shell-grid" aria-label="spaces errors">
          <article className="panel">
            <h2 className="panel-title">Spaces runtime error</h2>
            <p className="quiet-copy">{error}</p>
          </article>
        </section>
      ) : null}

      <section className="shell-grid" aria-label="spaces list">
        {spaces.map((space) => {
          const entryLabel =
            space.summary.kind === "shared"
              ? "Enter shared space"
              : "Enter personal space";

          return (
            <article key={space.summary.id} className="hero-card">
              <h2 className="panel-title">{space.summary.name}</h2>
              <p className="quiet-copy">
                {space.summary.kind === "shared"
                  ? "Shared membership · editorial visibility · governed jobs"
                  : "Personal research lane · private notes · future project handoff"}
              </p>
              <p className="quiet-copy">
                Memberships · {space.membershipCount}
              </p>
              <Link
                className="panel-link"
                to="/projects"
              >
                {entryLabel} projects
              </Link>
            </article>
          );
        })}

        {spaces.length === 0 ? (
          <article className="panel">
            <h2 className="panel-title">No visible spaces</h2>
            <p className="quiet-copy">
              Create a governance space before creating projects. The UI no
              longer substitutes a fake shared collaboration lane when the server has no
              data.
            </p>
          </article>
        ) : null}
      </section>
    </main>
  );
}
