import { Outlet, useParams } from 'react-router-dom';

import { ContextIndicator } from './context-indicator';
import { SidebarNav } from './sidebar-nav';

const demoProjectNameById: Record<string, string> = {
  'project-1': '肿瘤标志物项目',
};

export function WorkbenchLayout() {
  const { projectId } = useParams();
  const projectName = projectId ? demoProjectNameById[projectId] ?? projectId : null;
  const label = projectName ? `Project / ${projectName}` : 'Personal';
  const variant = projectName ? 'project' : 'personal';
  const mainClassName = projectId
    ? 'workbench-main workbench-main--project'
    : 'workbench-main workbench-main--personal';

  return (
    <div className="workbench-shell">
      <SidebarNav />
      <div className={mainClassName}>
        <ContextIndicator label={label} variant={variant} />
        <Outlet />
      </div>
    </div>
  );
}
