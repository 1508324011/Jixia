import { Outlet, useParams } from 'react-router-dom';

import { ActivityRail } from './activity-rail';
import { ContextIndicator } from './context-indicator';
import { RecentOpenedPanel } from './recent-opened-panel';
import { WorkbenchOpenViewStrip } from './workbench-open-view-strip';
import { WorkbenchSidebar } from './workbench-sidebar';

const demoProjectNameById: Record<string, string> = {
  'project-1': '肿瘤标志物项目',
  'tumor-board': 'Tumor board workspace',
};

const demoProjectDocIdById: Record<string, string> = {
  'project-1': 'doc-1',
  'tumor-board': 'doc-1',
};

export function WorkbenchLayout() {
  const { projectId } = useParams();
  const projectName = projectId ? demoProjectNameById[projectId] ?? projectId : null;
  const label = projectName ? `Project / ${projectName}` : 'Personal workbench';
  const variant = projectName ? 'project' : 'personal';
  const contextActions = projectId
    ? [
        { label: 'Project overview', to: `/projects/${projectId}` },
        { label: 'Project library', to: `/projects/${projectId}/library` },
        {
          label: 'Project docs',
          to: `/projects/${projectId}/writing/${demoProjectDocIdById[projectId] ?? 'doc-1'}`,
        },
      ]
    : [];
  const mainClassName = projectId
    ? 'workbench-main workbench-main--project'
    : 'workbench-main workbench-main--personal';

  return (
    <div className="workbench-shell">
      <aside className="workbench-left-rail" data-testid="workbench-left-rail">
        <ActivityRail />
        <WorkbenchSidebar />
      </aside>

      <div className={mainClassName} data-layout-mode="editor-canvas" data-testid="workbench-main-surface">
        <WorkbenchOpenViewStrip />

        <div className="workbench-main__canvas">
          <Outlet />
        </div>
      </div>

      <aside
        className="workbench-context-rail"
        data-rail-variant="inspector"
        data-testid="workbench-context-rail"
      >
        <ContextIndicator actions={contextActions} label={label} variant={variant} />
        <RecentOpenedPanel />
      </aside>
    </div>
  );
}
