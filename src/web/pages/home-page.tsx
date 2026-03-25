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

export function HomePage() {
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

        setErrorMessage(error instanceof Error ? error.message : 'Unable to load workbench summary.');
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

  const featuredResumeTarget = summary?.resumeTargets[0] ?? null;

  return (
    <main className="page-shell dashboard-page">
      <header className="page-header">
        <p className="page-kicker">Editorial lab workbench</p>
        <h1 className="page-title">Research workbench</h1>
        <p className="page-description">
          Resume active projects, reopen notebook synthesis, and move back into shared docs without rebuilding context by hand.
        </p>
      </header>

      <section className="stack-sm" aria-label="home desk">
        <article className="hero-card home-hero">
          <div className="stack-xs">
            <span className="intake-source-board__eyebrow">Workbench rhythm</span>
            <h2 className="panel-title">Resume the active notebook and shared project surfaces before starting a fresh intake loop.</h2>
          </div>
          <p className="quiet-copy">
            Home now acts as a resumption surface: recent projects stay visible, notebook continuations stay one click away, and imported evidence points back to the shared library it belongs to.
          </p>
          {featuredResumeTarget ? (
            <Link className="panel-link" to={featuredResumeTarget.to}>
              Continue notebook synthesis
            </Link>
          ) : null}
        </article>

        {isLoading ? (
          <section className="panel" aria-live="polite">
            <h2 className="panel-title">Loading workbench summary…</h2>
            <p className="quiet-copy">Pulling the latest projects, notebook resumes, and imports into the home surface.</p>
          </section>
        ) : null}

        {errorMessage ? (
          <section className="panel" aria-live="polite">
            <h2 className="panel-title">Workbench summary unavailable</h2>
            <p className="quiet-copy">{errorMessage}</p>
          </section>
        ) : null}

        {summary ? (
          <div className="panel-grid dashboard-grid">
            <section className="panel home-desk-card" aria-label="Recent projects">
              <h2 className="panel-title">Recent projects</h2>
              {summary.recentProjects.length > 0 ? (
                <div className="stack-sm">
                  {summary.recentProjects.map((project) => (
                    <article key={`${project.spaceId}-${project.projectId}`} className="stack-xs">
                      <h3 className="panel-title">{project.title}</h3>
                      <p className="quiet-copy">{project.recentActivity}</p>
                      <p className="quiet-copy">
                        {project.entryCount} library entr{project.entryCount === 1 ? 'y' : 'ies'} · {project.activeNotebookCount} active notebook{project.activeNotebookCount === 1 ? '' : 's'}
                      </p>
                      <Link className="panel-link" to={formatProjectPath(project.projectId, project.spaceId)}>
                        Open {project.title}
                      </Link>
                    </article>
                  ))}
                </div>
              ) : (
                <p className="quiet-copy">No shared project activity yet.</p>
              )}
            </section>

            <section className="panel home-desk-card" aria-label="Continue working">
              <h2 className="panel-title">Continue working</h2>
              {summary.resumeTargets.length > 0 ? (
                <div className="stack-sm">
                  {summary.resumeTargets.map((target) => (
                    <article key={`${target.kind}-${target.to}`} className="stack-xs">
                      <h3 className="panel-title">{target.title}</h3>
                      <p className="quiet-copy">{target.description}</p>
                      <Link className="panel-link" to={target.to}>
                        {target.title}
                      </Link>
                    </article>
                  ))}
                </div>
              ) : (
                <p className="quiet-copy">No notebook or project-doc resumes are queued yet.</p>
              )}
            </section>

            <section className="panel home-desk-card" aria-label="Recent imports">
              <h2 className="panel-title">Recent imports</h2>
              {summary.recentImports.length > 0 ? (
                <div className="stack-sm">
                  {summary.recentImports.map((item) => (
                    <article key={item.entryId} className="stack-xs">
                      <h3 className="panel-title">{item.title}</h3>
                      <p className="quiet-copy">Imported from {item.canonicalId} and routed into the shared project inventory.</p>
                      <Link className="panel-link" to={item.to}>
                        Open project library
                      </Link>
                    </article>
                  ))}
                </div>
              ) : (
                <p className="quiet-copy">Recent imports will appear here once new evidence enters a shared project.</p>
              )}
            </section>
          </div>
        ) : null}
      </section>
    </main>
  );
}
