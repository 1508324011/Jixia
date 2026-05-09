import { useParams } from 'react-router-dom';

import { ProjectTabs } from '../components/project-tabs';
import { ProjectWriterList } from '../components/project-writer-list';
import { useProjectContext } from '../presenters/project-context';

const projectTabs = ['概览', '共享 Library', 'Writer', '活动'];

export function ProjectPage() {
  const { projectId = '' } = useParams();
  const { error, isLoading, project } = useProjectContext(projectId);

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

  return (
    <main className="page-shell">
      <header className="page-header">
        <p className="page-kicker">Project workspace</p>
        <h1 className="page-title">{project.project.name}</h1>
        <p className="page-description">共享阅读、项目图书馆和正式写作入口在这里汇合。</p>
      </header>

      <section className="context-bar" aria-label="project context bar">
        <span>Governance space · {project.project.spaceId}</span>
        <span className="status-badge">{project.membership.role}</span>
        <span className="status-badge">{project.project.status}</span>
      </section>

      <section className="panel project-workspace-panel">
        <ProjectTabs tabs={projectTabs} />
        <p className="quiet-copy">先从概览进入共享 Library、Writer 和协作动态。</p>
      </section>

      <section className="panel" aria-label="Writer 文档区">
        <h2 className="panel-title">Writer 文档区</h2>
        <p className="quiet-copy">将成熟内容整理进入 Writer</p>
        <ProjectWriterList
          projectId={project.project.id}
          spaceId={project.project.spaceId}
        />
      </section>
    </main>
  );
}
