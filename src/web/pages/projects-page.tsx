import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

import type { WorkbenchSummaryResponse } from '@shared/contracts/workbench';

import { createDemoApi } from '../lib/demo-api';

const demoApi = createDemoApi();

function formatProjectPath(projectId: string, spaceId: string, suffix = ''): string {
  const basePath = suffix ? `/projects/${projectId}/${suffix}` : `/projects/${projectId}`;

  if (spaceId === 'shared-space') {
    return basePath;
  }

  return `${basePath}?spaceId=${encodeURIComponent(spaceId)}`;
}

function formatRecentActivity(activity: string): string {
  return activity.replace(/^recent activity\s*[·-]\s*/i, '');
}

export function ProjectsPage() {
  const [summary, setSummary] = useState<WorkbenchSummaryResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    demoApi
      .getWorkbenchSummary()
      .then((result) => {
        if (!isMounted) {
          return;
        }

        setSummary(result);
        setErrorMessage(null);
      })
      .catch((error: unknown) => {
        if (!isMounted) {
          return;
        }

        setErrorMessage(error instanceof Error ? error.message : 'Unable to load projects surface.');
      })
      .finally(() => {
        if (isMounted) {
          setIsLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, []);

  return (
    <main className="page-shell">
      <header className="page-header">
        <p className="page-kicker">Recent activity</p>
        <h1 className="page-title">Projects</h1>
        <p className="page-description">Review shared workspaces as real inventories with notebook counts, import volume, and direct links back to docs.</p>
      </header>

      <div className="panel-grid top-level-surface-grid">
        {isLoading ? (
          <section className="panel" aria-live="polite">
            <h2 className="panel-title">Loading project inventory…</h2>
            <p className="quiet-copy">Gathering recent activity and notebook status from shared workspaces.</p>
          </section>
        ) : null}

        {errorMessage ? (
          <section className="panel" aria-live="polite">
            <h2 className="panel-title">Project inventory unavailable</h2>
            <p className="quiet-copy">{errorMessage}</p>
          </section>
        ) : null}

        {summary?.recentProjects.map((project) => (
          <section key={`${project.spaceId}-${project.projectId}`} className="panel">
            <h2 className="panel-title">{project.title}</h2>
            <p className="quiet-copy">{formatRecentActivity(project.recentActivity)}</p>
            <p className="quiet-copy">
              {project.entryCount} library entr{project.entryCount === 1 ? 'y' : 'ies'} · {project.activeNotebookCount} notebook{project.activeNotebookCount === 1 ? '' : 's'} ready for synthesis.
            </p>
            <div className="button-row">
              <Link className="panel-link" to={formatProjectPath(project.projectId, project.spaceId)}>
                Open {project.title}
              </Link>
              <Link className="panel-link" to={formatProjectPath(project.projectId, project.spaceId, 'library')}>
                Open project library
              </Link>
              {project.documentId ? (
                <Link
                  className="panel-link"
                  to={formatProjectPath(project.projectId, project.spaceId, `writing/${project.documentId}`)}
                >
                  Open project docs
                </Link>
              ) : null}
            </div>
          </section>
        ))}

        {summary && summary.recentProjects.length === 0 ? (
          <section className="panel">
            <h2 className="panel-title">No shared projects yet</h2>
            <p className="quiet-copy">Once a shared workspace accumulates library entries or project docs, it will appear here as a resumable project surface.</p>
          </section>
        ) : null}
      </div>
    </main>
  );
}
