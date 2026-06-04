import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

import type { TodayRecommendation } from '@shared/contracts/discovery';
import type {
  TodayContinuationAction,
  TodayContinuationItem,
  TodayContinuationResponse,
  TodayContinuationSection,
} from '@shared/contracts/today-continuation';

import { apiClient } from '../lib/http-client';

function formatTimestamp(timestamp: string): string {
  return timestamp.slice(0, 10) || timestamp;
}

function isContinuationEmpty(continuation: TodayContinuationResponse): boolean {
  return continuation.sections.every((section) => section.totalCount === 0) &&
    continuation.nextActions.length === 0;
}

function TodayContinuationActionLink({ action }: { action: TodayContinuationAction }) {
  return (
    <Link
      className={
        action.priority === 'high'
          ? 'action-button'
          : 'action-button action-button-secondary'
      }
      to={action.href}
    >
      {action.label}
    </Link>
  );
}

function TodayContinuationItemCard({ item }: { item: TodayContinuationItem }) {
  return (
    <article className="panel" aria-label={item.title}>
      <div className="context-bar">
        <span className="status-badge">{item.kind}</span>
        <span className="status-badge">{item.priority}</span>
      </div>
      <h3 className="panel-title">{item.title}</h3>
      {item.summary ? <p className="quiet-copy">{item.summary}</p> : null}
      {item.sourceLabel ? <p className="quiet-copy">{item.sourceLabel}</p> : null}
      {item.timestamp ? (
        <time className="quiet-copy" dateTime={item.timestamp}>
          {formatTimestamp(item.timestamp)}
        </time>
      ) : null}
      <div className="context-bar">
        <Link className="panel-link" to={item.href}>
          Continue
        </Link>
      </div>
    </article>
  );
}

function TodayContinuationSectionPanel({ section }: { section: TodayContinuationSection }) {
  return (
    <section className="panel" aria-label={section.title}>
      <div className="context-bar">
        <span className="status-badge">{section.kind}</span>
        <span className="quiet-copy">{section.totalCount} total</span>
      </div>
      <h2 className="panel-title">{section.title}</h2>
      <p className="quiet-copy">{section.description}</p>
      {section.items.length > 0 ? (
        <div className="stack-sm">
          {section.items.map((item) => (
            <TodayContinuationItemCard key={item.id} item={item} />
          ))}
        </div>
      ) : (
        <div className="stack-xs">
          <h3 className="panel-title">{section.emptyState.title}</h3>
          <p className="quiet-copy">{section.emptyState.body}</p>
          {section.emptyState.href ? (
            <Link className="panel-link" to={section.emptyState.href}>
              Open related surface
            </Link>
          ) : null}
        </div>
      )}
    </section>
  );
}

function TodayContinuationPanel({ continuation }: { continuation: TodayContinuationResponse }) {
  return (
    <section className="panel" aria-label="Today continuation read model">
      <div className="context-bar">
        <span className="status-badge">{continuation.contract}</span>
        <time className="quiet-copy" dateTime={continuation.generatedAt}>
          Generated {formatTimestamp(continuation.generatedAt)}
        </time>
      </div>
      <h2 className="panel-title">Continue today</h2>
      <p className="quiet-copy">
        Server-derived continuation from Personal Library, Reader state, private Notebook metadata,
        visible Project review, and governed AI job status.
      </p>

      <dl className="home-cockpit-metrics">
        <div className="home-cockpit-metric">
          <dt>In-progress readings</dt>
          <dd>{continuation.summary.inProgressReadings}</dd>
        </div>
        <div className="home-cockpit-metric">
          <dt>Unread imports</dt>
          <dd>{continuation.summary.unreadImports}</dd>
        </div>
        <div className="home-cockpit-metric">
          <dt>Notebook drafts</dt>
          <dd>{continuation.summary.notebookDrafts}</dd>
        </div>
        <div className="home-cockpit-metric">
          <dt>Project review items</dt>
          <dd>{continuation.summary.projectReviewItems}</dd>
        </div>
        <div className="home-cockpit-metric">
          <dt>AI jobs needing action</dt>
          <dd>{continuation.summary.aiJobsNeedingAction}</dd>
        </div>
      </dl>

      {isContinuationEmpty(continuation) ? (
        <section className="panel" aria-label="empty today continuation">
          <h3 className="panel-title">{continuation.emptyState.title}</h3>
          <p className="quiet-copy">{continuation.emptyState.body}</p>
          {continuation.emptyState.href ? (
            <Link className="panel-link" to={continuation.emptyState.href}>
              Open discovery search
            </Link>
          ) : null}
        </section>
      ) : null}

      {continuation.nextActions.length > 0 ? (
        <section className="panel" aria-label="Today continuation top actions">
          <h3 className="panel-title">Top continuation actions</h3>
          <div className="stack-sm">
            {continuation.nextActions.map((action) => (
              <div key={action.id} className="stack-xs">
                <TodayContinuationActionLink action={action} />
                <p className="quiet-copy">{action.reason}</p>
                {action.description ? <p className="quiet-copy">{action.description}</p> : null}
              </div>
            ))}
          </div>
        </section>
      ) : null}

      <div className="panel-grid dashboard-grid" aria-label="Today continuation sections">
        {continuation.sections.map((section) => (
          <TodayContinuationSectionPanel key={section.kind} section={section} />
        ))}
      </div>
    </section>
  );
}

export function TodayPage() {
  const [continuation, setContinuation] = useState<TodayContinuationResponse | null>(null);
  const [isContinuationLoading, setIsContinuationLoading] = useState(true);
  const [continuationErrorMessage, setContinuationErrorMessage] = useState<string | null>(null);
  const [items, setItems] = useState<TodayRecommendation[]>([]);
  const [isRecommendationsLoading, setIsRecommendationsLoading] = useState(true);
  const [recommendationErrorMessage, setRecommendationErrorMessage] = useState<string | null>(null);
  const [importErrorMessage, setImportErrorMessage] = useState<string | null>(null);
  const [importingId, setImportingId] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    async function loadContinuation(): Promise<void> {
      setIsContinuationLoading(true);
      setContinuationErrorMessage(null);

      try {
        const response = await apiClient.getTodayContinuation();

        if (!isMounted) {
          return;
        }

        setContinuation(response);
      } catch (error) {
        if (!isMounted) {
          return;
        }

        setContinuation(null);
        setContinuationErrorMessage(
          error instanceof Error ? error.message : 'Unable to load today continuation.',
        );
      } finally {
        if (isMounted) {
          setIsContinuationLoading(false);
        }
      }
    }

    async function loadRecommendations(): Promise<void> {
      setIsRecommendationsLoading(true);
      setRecommendationErrorMessage(null);

      try {
        const response = await apiClient.getTodayRecommendations();

        if (!isMounted) {
          return;
        }

        setItems(response.items);
      } catch (error) {
        if (!isMounted) {
          return;
        }

        setRecommendationErrorMessage(
          error instanceof Error ? error.message : 'Unable to load today recommendations.',
        );
      } finally {
        if (isMounted) {
          setIsRecommendationsLoading(false);
        }
      }
    }

    void loadContinuation();
    void loadRecommendations();

    return () => {
      isMounted = false;
    };
  }, []);

  async function handleImport(item: TodayRecommendation): Promise<void> {
    setImportingId(item.id);
    setImportErrorMessage(null);

    try {
      await apiClient.importToPersonalLibrary({
        sourceLocator: item.sourceLocator,
        sourceType: item.sourceType,
      });
      setItems((currentItems) =>
        currentItems.map((candidate) =>
          candidate.id === item.id ? { ...candidate, imported: true } : candidate,
        ),
      );
    } catch (error) {
      setImportErrorMessage(
        error instanceof Error ? error.message : 'Unable to import recommendation.',
      );
    } finally {
      setImportingId(null);
    }
  }

  return (
    <main className="page-shell">
      <header className="page-header">
        <p className="page-kicker">Today</p>
        <h1 className="page-title">今日推荐</h1>
        <p className="page-description">把今天优先处理的阅读、导入和写作收束到同一入口。</p>
      </header>

      {isContinuationLoading ? (
        <section className="panel" aria-live="polite">
          <h2 className="panel-title">Loading today continuation</h2>
          <p className="quiet-copy">
            Loading the server-derived continuation read model for this session actor…
          </p>
        </section>
      ) : null}

      {!isContinuationLoading && continuationErrorMessage ? (
        <section className="panel" aria-live="polite">
          <h2 className="panel-title">Unable to load today continuation</h2>
          <p className="quiet-copy">{continuationErrorMessage}</p>
        </section>
      ) : null}

      {!isContinuationLoading && !continuationErrorMessage && continuation ? (
        <TodayContinuationPanel continuation={continuation} />
      ) : null}

      <div className="panel-grid top-level-surface-grid">
        <section className="panel">
          <h2 className="panel-title">Discovery recommendations</h2>
          <p className="quiet-copy">根据当前 discovery 结果优先推进今天的个人导入与阅读。</p>
          {isRecommendationsLoading ? <p className="quiet-copy">Loading today recommendations…</p> : null}
          {recommendationErrorMessage ? <p className="quiet-copy">{recommendationErrorMessage}</p> : null}
          {importErrorMessage ? <p className="quiet-copy">{importErrorMessage}</p> : null}
          {!isRecommendationsLoading && !recommendationErrorMessage && items.length === 0 ? (
            <p className="quiet-copy">No recommendations available right now.</p>
          ) : null}
          {items.map((item) => (
            <article className="panel" key={item.id}>
              <h3 className="panel-title">{item.title}</h3>
              <p className="quiet-copy">{item.reason}</p>
              <p className="quiet-copy">
                {item.sourceLabel} · {item.canonicalId}
              </p>
              <p className="quiet-copy">
                {item.imported
                  ? 'Imported into personal library'
                  : 'Ready to import into personal library'}
              </p>
              <div className="context-bar">
                <span className="status-badge">{item.sourceType}</span>
                <button
                  disabled={item.imported || importingId === item.id}
                  onClick={() => void handleImport(item)}
                  type="button"
                >
                  {item.imported
                    ? 'Open personal Library'
                    : importingId === item.id
                      ? 'Importing…'
                      : '导入到个人 Library'}
                </button>
                <Link className="panel-link" to="/library">
                  Open personal Library
                </Link>
              </div>
            </article>
          ))}
        </section>

        <section className="panel">
          <h2 className="panel-title">待处理导入</h2>
          <p className="quiet-copy">把外部检索结果导入个人 Library，再决定是否带进项目。</p>
          <Link className="panel-link" to="/search">
            Open search surface
          </Link>
        </section>
      </div>
    </main>
  );
}
