import { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';

import type {
  HomeCockpitActivityItem,
  HomeCockpitLinkAction,
  HomeCockpitNotice,
  HomeCockpitResponse,
  HomeCockpitSectionStatus,
  HomeCockpitSummarySection,
} from '@shared/contracts/home-cockpit';

import { apiClient } from '../lib/http-client';

const sectionStatusLabels: Record<HomeCockpitSectionStatus, string> = {
  active: 'Active',
  attention: 'Needs attention',
  empty: 'Empty',
};

function formatTimestamp(timestamp: string): string {
  return timestamp.slice(0, 10) || timestamp;
}

function HomeActionLink({ action }: { action: HomeCockpitLinkAction }) {
  return (
    <Link
      className={
        action.priority === 'primary'
          ? 'action-button'
          : 'action-button action-button-secondary'
      }
      to={action.to}
    >
      {action.label}
    </Link>
  );
}

function HomeSummarySection({ section }: { section: HomeCockpitSummarySection }) {
  return (
    <section className="panel" aria-label={section.title}>
      <div className="context-bar">
        <span className="status-badge">{sectionStatusLabels[section.status]}</span>
        <span className="quiet-copy">{section.id}</span>
      </div>
      <h2 className="panel-title">{section.title}</h2>
      <p className="quiet-copy">{section.description}</p>
      <dl className="home-cockpit-metrics">
        {section.metrics.map((metric) => (
          <div key={metric.label} className="home-cockpit-metric">
            <dt>{metric.label}</dt>
            <dd>{metric.value}</dd>
            {metric.detail ? <p className="quiet-copy">{metric.detail}</p> : null}
          </div>
        ))}
      </dl>
      <div className="stack-sm">
        <HomeActionLink action={section.primaryAction} />
        <p className="quiet-copy">{section.primaryAction.description}</p>
      </div>
    </section>
  );
}

function HomeActivityItem({ item }: { item: HomeCockpitActivityItem }) {
  const body = (
    <>
      <strong>{item.title}</strong>
      <span className="quiet-copy">{item.context}</span>
      <time className="quiet-copy" dateTime={item.occurredAt}>
        {formatTimestamp(item.occurredAt)} · {item.kind}
      </time>
    </>
  );

  return (
    <li className="recent-opened-panel__item">
      {item.href ? (
        <Link className="panel-link" to={item.href}>
          {body}
        </Link>
      ) : (
        <div className="stack-xs">{body}</div>
      )}
    </li>
  );
}

function HomeNotice({ notice }: { notice: HomeCockpitNotice }) {
  return (
    <article className="panel" aria-label={notice.title}>
      <span className="status-badge">{notice.tone}</span>
      <h3 className="panel-title">{notice.title}</h3>
      <p className="quiet-copy">{notice.body}</p>
    </article>
  );
}

export function HomePage() {
  const [cockpit, setCockpit] = useState<HomeCockpitResponse | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const loadCockpit = useCallback(
    async (shouldCommit: () => boolean = () => true): Promise<void> => {
      setIsLoading(true);
      setErrorMessage(null);

      try {
        const response = await apiClient.getHomeCockpit();

        if (!shouldCommit()) {
          return;
        }

        setCockpit(response);
      } catch (error) {
        if (!shouldCommit()) {
          return;
        }

        setCockpit(null);
        setErrorMessage(
          error instanceof Error ? error.message : 'Unable to load Home cockpit.',
        );
      } finally {
        if (shouldCommit()) {
          setIsLoading(false);
        }
      }
    },
    [],
  );

  useEffect(() => {
    let isMounted = true;

    void loadCockpit(() => isMounted);

    return () => {
      isMounted = false;
    };
  }, [loadCockpit]);

  const isEmptyCockpit = useMemo(() => {
    if (!cockpit) {
      return false;
    }

    return (
      cockpit.sections.every((section) => section.status === 'empty') &&
      cockpit.recentActivity.length === 0
    );
  }, [cockpit]);

  return (
    <main className="page-shell dashboard-page">
      <header className="page-header">
        <p className="page-kicker">Personal-first workbench</p>
        <h1 className="page-title">个人工作台</h1>
        <p className="page-description">
          {cockpit
            ? `${cockpit.actor.displayName} · ${cockpit.workbench.label} · server-owned Home cockpit`
            : '从服务器拥有的研究上下文继续。'}
        </p>
      </header>

      {isLoading ? (
        <section className="panel" aria-live="polite">
          <h2 className="panel-title">Loading Home cockpit</h2>
          <p className="quiet-copy">
            Loading the server-owned Home cockpit read model for this session actor…
          </p>
        </section>
      ) : null}

      {!isLoading && errorMessage ? (
        <section className="panel" aria-live="polite">
          <h2 className="panel-title">Unable to load Home cockpit</h2>
          <p className="quiet-copy">{errorMessage}</p>
          <button
            className="action-button"
            onClick={() => void loadCockpit()}
            type="button"
          >
            Retry Home cockpit
          </button>
        </section>
      ) : null}

      {!isLoading && !errorMessage && cockpit ? (
        <section className="dashboard-layout" aria-label="server-owned home cockpit">
          <div className="stack-sm">
            <section className="panel" aria-label="Home cockpit server context">
              <div className="context-bar">
                <span className="status-badge">{cockpit.contract}</span>
                <span className="status-badge">{cockpit.workbench.scope.type}</span>
              </div>
              <h2 className="panel-title">Server context</h2>
              <p className="quiet-copy">
                Actor: {cockpit.actor.displayName} · {cockpit.actor.email}
              </p>
              <p className="quiet-copy">
                Workbench scope: {cockpit.workbench.scope.type}:{cockpit.workbench.scope.id}
              </p>
              <p className="quiet-copy">
                Generated: <time dateTime={cockpit.generatedAt}>{formatTimestamp(cockpit.generatedAt)}</time>
              </p>
            </section>

            {isEmptyCockpit ? (
              <section className="panel" aria-label="empty home cockpit">
                <h2 className="panel-title">No server activity yet</h2>
                <p className="quiet-copy">
                  This is a successful empty Home cockpit response. Create a project,
                  import a source, start a Notebook, or configure governed AI to populate
                  this server-owned read model.
                </p>
              </section>
            ) : null}

            <div className="panel-grid dashboard-grid" aria-label="Home cockpit sections">
              {cockpit.sections.map((section) => (
                <HomeSummarySection key={section.id} section={section} />
              ))}
            </div>
          </div>

          <aside className="stack-sm" aria-label="Home cockpit side rail">
            <section className="panel" aria-label="Next actions">
              <h2 className="panel-title">Next actions</h2>
              <div className="stack-sm">
                {cockpit.nextActions.map((action) => (
                  <div key={action.id} className="stack-xs">
                    <HomeActionLink action={action} />
                    <p className="quiet-copy">{action.description}</p>
                  </div>
                ))}
              </div>
            </section>

            <section className="panel" aria-label="Recent activity">
              <h2 className="panel-title">Recent activity</h2>
              {cockpit.recentActivity.length > 0 ? (
                <ul className="recent-opened-panel__list">
                  {cockpit.recentActivity.map((item) => (
                    <HomeActivityItem key={item.id} item={item} />
                  ))}
                </ul>
              ) : (
                <p className="quiet-copy">
                  No server-visible activity is available for this actor yet.
                </p>
              )}
            </section>

            <section className="stack-sm" aria-label="Home cockpit notices">
              <h2 className="panel-title">Visibility and governance notices</h2>
              {cockpit.notices.map((notice) => (
                <HomeNotice key={notice.id} notice={notice} />
              ))}
            </section>
          </aside>
        </section>
      ) : null}
    </main>
  );
}
