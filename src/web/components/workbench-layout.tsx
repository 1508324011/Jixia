import { Outlet, useParams } from 'react-router-dom';

import { ContextIndicator } from './context-indicator';

export function WorkbenchLayout() {
  const { projectId } = useParams();
  const label = projectId ? `Project / ${projectId}` : 'Personal';
  const variant = projectId ? 'project' : 'personal';
  const mainClassName = projectId
    ? 'workbench-main workbench-main--project'
    : 'workbench-main workbench-main--personal';

  return (
    <div className="workbench-shell">
      <div className={mainClassName}>
        <ContextIndicator label={label} variant={variant} />
        <Outlet />
      </div>
    </div>
  );
}
