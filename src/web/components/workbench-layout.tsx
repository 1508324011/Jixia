import { Outlet, useParams } from 'react-router-dom';

import { ContextIndicator } from './context-indicator';
import { SidebarNav } from './sidebar-nav';

export function WorkbenchLayout() {
  const { projectId } = useParams();
  const projectName = projectId || null;
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
