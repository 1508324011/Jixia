import { ProjectTabs } from '../components/project-tabs';

const projectTabs = ['概览', '共享 Library', 'Writer', '活动'];

export function ProjectPage() {
  return (
    <main className="page-shell">
      <header className="page-header">
        <p className="page-kicker">Project workspace</p>
        <h1 className="page-title">肿瘤标志物项目</h1>
        <p className="page-description">共享阅读、项目图书馆和正式写作入口在这里汇合。</p>
      </header>

      <section className="panel project-workspace-panel">
        <ProjectTabs tabs={projectTabs} />
        <p className="quiet-copy">先从概览进入共享 Library、Writer 和协作动态。</p>
      </section>
    </main>
  );
}
