import { ProjectTabs } from '../components/project-tabs';
import { ProjectWriterList } from '../components/project-writer-list';

const projectTabs = ['概览', '共享 Library', 'Writer', '活动'];
const WORKBENCH_PERSONAL_SPACE_ID = 'personal-space-user-alice';

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

      <section className="panel" aria-label="Writer 文档区">
        <h2 className="panel-title">Writer 文档区</h2>
        <p className="quiet-copy">将成熟内容整理进入 Writer</p>
        <ProjectWriterList
          projectId="project-1"
          spaceId={WORKBENCH_PERSONAL_SPACE_ID}
        />
      </section>
    </main>
  );
}
