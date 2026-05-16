import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

import type { TodayRecommendation } from '@shared/contracts/discovery';

import { apiClient } from '../lib/http-client';

export function TodayPage() {
  const [items, setItems] = useState<TodayRecommendation[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [importingId, setImportingId] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    async function loadRecommendations(): Promise<void> {
      setIsLoading(true);
      setErrorMessage(null);

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

        setErrorMessage(
          error instanceof Error ? error.message : 'Unable to load today recommendations.',
        );
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }

    void loadRecommendations();

    return () => {
      isMounted = false;
    };
  }, []);

  async function handleImport(item: TodayRecommendation): Promise<void> {
    setImportingId(item.id);
    setErrorMessage(null);

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
      setErrorMessage(
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

      <div className="panel-grid top-level-surface-grid">
        <section className="panel">
          <h2 className="panel-title">待读优先级</h2>
          <p className="quiet-copy">根据当前 discovery 结果优先推进今天的个人导入与阅读。</p>
          {isLoading ? <p className="quiet-copy">Loading today recommendations…</p> : null}
          {errorMessage ? <p className="quiet-copy">{errorMessage}</p> : null}
          {!isLoading && !errorMessage && items.length === 0 ? (
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
