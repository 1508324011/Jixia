import { Link } from "react-router-dom";
import { useEffect, useState, type FormEvent } from "react";

import { useProjectsPresenter } from "../presenters/projects-presenter";

export function ProjectsPage() {
  const {
    createProject,
    error,
    isCreating,
    isLoading,
    projects,
    refresh,
    spaces,
  } = useProjectsPresenter();
  const [newProjectName, setNewProjectName] = useState("");
  const [selectedSpaceId, setSelectedSpaceId] = useState("");
  const [createError, setCreateError] = useState<string | null>(null);

  useEffect(() => {
    setSelectedSpaceId((currentSpaceId) => {
      if (currentSpaceId && spaces.some((space) => space.id === currentSpaceId)) {
        return currentSpaceId;
      }

      return spaces[0]?.id ?? "";
    });
  }, [spaces]);

  async function handleCreateProject(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();

    const name = newProjectName.trim();
    if (!name) {
      setCreateError("Enter a project name before creating a collaboration lane.");
      return;
    }

    if (!selectedSpaceId) {
      setCreateError("Select a visible governance space before creating a project.");
      return;
    }

    setCreateError(null);
    const created = await createProject({ name, spaceId: selectedSpaceId });
    if (created) {
      setNewProjectName("");
    }
  }

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

      <section className="panel" aria-label="项目工作台 overview">
        <p className="page-kicker">Shared work</p>
        <h2 className="panel-title">项目工作台</h2>
        <p className="quiet-copy">查看共享项目的概览、最近活动和待继续的 Writer 流程。</p>
      </section>

      <section className="context-bar" aria-label="projects actions">
        <span>Visible projects · {projects.length}</span>
        <span>Governance spaces · {spaces.length}</span>
        <button
          className="panel-link"
          type="button"
          onClick={() => void refresh()}
        >
          Refresh
        </button>
      </section>

      <section className="panel" aria-label="create project">
        <h2 className="panel-title">Create project from visible governance</h2>
        <p className="quiet-copy">
          Project creation uses only server-visible governance spaces. The browser no
          longer creates a fallback space or generated project name before the server
          has returned real context.
        </p>
        <form className="field-stack" onSubmit={(event) => void handleCreateProject(event)}>
          <label className="field-stack" htmlFor="project-name-input">
            <span className="field-label">Project name</span>
            <input
              id="project-name-input"
              value={newProjectName}
              onChange={(event) => {
                setNewProjectName(event.target.value);
                setCreateError(null);
              }}
              placeholder="Enter a project name"
            />
          </label>
          <label className="field-stack" htmlFor="project-space-select">
            <span className="field-label">Governance space</span>
            <select
              id="project-space-select"
              value={selectedSpaceId}
              onChange={(event) => {
                setSelectedSpaceId(event.target.value);
                setCreateError(null);
              }}
              disabled={spaces.length === 0}
            >
              {spaces.length === 0 ? (
                <option value="">No visible governance spaces</option>
              ) : null}
              {spaces.map((space) => (
                <option key={space.id} value={space.id}>
                  {space.name} · {space.kind}
                </option>
              ))}
            </select>
          </label>
          <button
            className="panel-link"
            type="submit"
            disabled={isCreating || !newProjectName.trim() || !selectedSpaceId}
          >
            {isCreating ? "Creating project…" : "Create project"}
          </button>
          {createError ? <p className="quiet-copy">{createError}</p> : null}
        </form>
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
            {!isLoading && spaces.length === 0 ? (
              <p className="quiet-copy">
                No visible governance spaces are available for project creation.
              </p>
            ) : null}
          </article>
        ) : null}
      </section>

      <div className="panel-grid top-level-surface-grid">
        <section className="panel">
          <h2 className="panel-title">最近活跃项目</h2>
          <p className="quiet-copy">优先返回最近读过 paper 或刚更新 Writer 的项目。</p>
        </section>

        <section className="panel">
          <h2 className="panel-title">共享动态</h2>
          <p className="quiet-copy">集中查看队友评论、项目图书馆新增条目与写作推进情况。</p>
        </section>
      </div>
    </main>
  );
}
