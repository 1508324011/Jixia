import { useParams } from 'react-router-dom';

import { ProjectTabs } from '../components/project-tabs';
import { ProjectWriterList } from '../components/project-writer-list';

const projectTabs = ['概览', '共享 Library', 'Project docs', '活动'];
const DEFAULT_PROJECT_ID = 'tumor-board';
const WORKBENCH_SHARED_SPACE_ID = 'shared-space';

export function ProjectPage() {
  const { projectId = DEFAULT_PROJECT_ID } = useParams();

  return (
    <main className="page-shell">
      <header className="page-header">
        <p className="page-kicker">Project workspace</p>
        <h1 className="page-title">肿瘤标志物项目</h1>
        <p className="page-description">共享阅读、项目图书馆和正式写作入口在这里汇合。</p>
      </header>

      <section className="panel project-workspace-panel">
        <ProjectTabs tabs={projectTabs} />
        <p className="quiet-copy">先从概览进入共享 Library、Project docs 和协作动态。</p>
      </section>

      <section className="panel" aria-label="Project docs">
        <h2 className="panel-title">Project docs</h2>
        <p className="quiet-copy">Shared document tree and current draft live here.</p>
        <ProjectWriterList projectId={projectId} spaceId={WORKBENCH_SHARED_SPACE_ID} />
      </section>
    </main>
  );
}
