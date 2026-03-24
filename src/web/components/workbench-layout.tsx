import { Outlet, useParams } from 'react-router-dom';

import { ContextIndicator } from './context-indicator';
import { RecentOpenedPanel } from './recent-opened-panel';
import { SidebarNav } from './sidebar-nav';

const demoProjectNameById: Record<string, string> = {
  'project-1': '肿瘤标志物项目',
  'tumor-board': 'Tumor board workspace',
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
      <aside className="workbench-left-rail" data-testid="workbench-left-rail">
        <SidebarNav />
      </aside>

      <div className={mainClassName} data-testid="workbench-main-surface">
        <Outlet />
      </div>

      <aside className="workbench-context-rail" data-testid="workbench-context-rail">
        <ContextIndicator label={label} variant={variant} />
        <RecentOpenedPanel />
      </aside>
    </div>
  );
}
