import { Outlet, useParams } from 'react-router-dom';

import { ContextIndicator } from './context-indicator';
import { useShellProjectContext } from '../lib/shell-project-context';

export function WorkbenchLayout() {
  const { projectId } = useParams();
  const projectContext = useShellProjectContext();
  const resolvedProject = projectContext?.project ?? null;
  const label = projectId
    ? resolvedProject
      ? `Project / ${resolvedProject.project.name}`
      : projectContext?.error
        ? `Project / ${projectContext.error}`
      : projectContext?.isLoading
        ? 'Project / Loading server context'
        : 'Project / Project unavailable'
    : 'Personal';
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
