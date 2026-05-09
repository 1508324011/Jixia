import { Link, useParams } from 'react-router-dom';

import { ProjectTabs } from '../components/project-tabs';
import { ProjectWriterList } from '../components/project-writer-list';
import { useProjectContext } from '../presenters/project-context';

const projectTabs = ['概览', '共享 Library', 'Writer', '活动'];

export function ProjectPage() {
  const { projectId = '' } = useParams();
  const projectContext = useProjectContext(projectId);
  const { error, isLoading, project } = projectContext;

  if (!projectId) {
    return (
      <main className="page-shell">
        <header className="page-header">
          <p className="page-kicker">Project workspace</p>
          <h1 className="page-title">Project route missing</h1>
          <p className="page-description">
            Select a visible project before opening the collaboration workspace.
          </p>
        </header>

        <section className="panel-grid" aria-label="project route errors">
          <article className="panel">
            <h2 className="panel-title">No project selected</h2>
            <p className="quiet-copy">
              The project workspace cannot load until the route includes a real project id.
            </p>
            <Link className="panel-link" to="/projects">
              Back to projects
            </Link>
          </article>
        </section>
      </main>
    );
  }

  if (isLoading) {
    return (
      <main className="page-shell">
        <header className="page-header">
          <p className="page-kicker">Project workspace</p>
          <h1 className="page-title">Loading project workspace…</h1>
          <p className="page-description">Resolving project context from server-owned membership data.</p>
        </header>
      </main>
    );
  }

  if (error || !project) {
    return (
      <main className="page-shell">
        <header className="page-header">
          <p className="page-kicker">Project workspace</p>
          <h1 className="page-title">Project unavailable</h1>
          <p className="page-description">{error ?? `Project ${projectId} is not visible to the current actor.`}</p>
        </header>
      </main>
    );
  }

  const projectLabel = project.project.name;
  const spaceId = project.project.spaceId;

  return (
    <main className="page-shell">
      <header className="page-header">
        <p className="page-kicker">Project workspace</p>
        <h1 className="page-title">{projectLabel}</h1>
        <p className="page-description">共享阅读、项目图书馆和正式写作入口在这里汇合。</p>
        <p className="quiet-copy">Project / {projectLabel}</p>
      </header>

      <section className="context-bar" aria-label="project context bar">
        <span>Governed by space · {spaceId}</span>
        <span>Your role · {project.membership.role}</span>
        <span className="status-badge">{project.project.status}</span>
        <button className="panel-link" type="button" onClick={() => void projectContext.refresh()}>
          Refresh
        </button>
      </section>
      <section className="panel project-workspace-panel">
        <ProjectTabs tabs={projectTabs} />
        <p className="quiet-copy">
          先从概览进入共享 Library、Writer 和协作动态。
        </p>
        <Link className="panel-link" to={`/projects/${projectId}/library`}>
          Open project library
        </Link>
      </section>

      <section className="panel" aria-label="Writer 文档区">
        <h2 className="panel-title">Writer 文档区</h2>
        <p className="quiet-copy">将成熟内容整理进入 Writer</p>
        <ProjectWriterList projectId={projectId} />
      </section>
    </main>
  );
}
