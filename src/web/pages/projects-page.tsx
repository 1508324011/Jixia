import { Link } from "react-router-dom";

import { useProjectsPresenter } from "../presenters/projects-presenter";

export function ProjectsPage() {
  const {
    addSampleProjectMember,
    createProject,
    error,
    isCreating,
    isLoading,
    projects,
    refresh,
    spaces,
  } = useProjectsPresenter();

  return (
    <main className="page-shell">
      <header className="page-header">
        <p className="page-kicker">Space is governance · Project is collaboration</p>
        <h1 className="page-title">Projects</h1>
        <p className="page-description">
          Projects are now loaded from server-owned Project and ProjectMember
          records. Space remains the governance boundary behind each project.
        </p>
      </header>

      <section className="context-bar" aria-label="projects actions">
        <span>Visible projects · {projects.length}</span>
        <span>Governance spaces · {spaces.length}</span>
        <button
          className="panel-link"
          type="button"
          onClick={() => void createProject()}
          disabled={isCreating}
        >
          {isCreating ? "Creating…" : "Create project"}
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
        <section className="shell-grid" aria-label="projects errors">
          <article className="panel">
            <h2 className="panel-title">Projects runtime error</h2>
            <p className="quiet-copy">{error}</p>
          </article>
        </section>
      ) : null}

      <section className="shell-grid" aria-label="projects list">
        {projects.map(({ item, memberCount }) => (
          <article key={item.project.id} className="hero-card">
            <h2 className="panel-title">{item.project.name}</h2>
            <p className="quiet-copy">
              Project · {item.project.id} ·{" "}
              <span className="status-badge">{item.project.status}</span>
            </p>
            <p className="quiet-copy">Governed by space · {item.project.spaceId}</p>
            <p className="quiet-copy">Your role · {item.membership.role}</p>
            <p className="quiet-copy">Project members · {memberCount}</p>
            <Link className="panel-link" to={`/projects/${item.project.id}/library`}>
              Open project library
            </Link>
            <button
              className="panel-link"
              type="button"
              onClick={() => void addSampleProjectMember(item.project.id)}
            >
              Add Bob as viewer
            </button>
          </article>
        ))}

        {projects.length === 0 ? (
          <article className="panel">
            <h2 className="panel-title">
              {isLoading ? "Loading projects" : "No visible projects"}
            </h2>
            <p className="quiet-copy">
              {isLoading
                ? "Loading server-owned project membership state."
                : "Create a project to start the first collaboration lane. No demo project is substituted when the server has no data."}
            </p>
          </article>
        ) : null}
      </section>
    </main>
  );
}
