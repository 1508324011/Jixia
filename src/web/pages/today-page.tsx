import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

import type { DiscoveryBoard, TodayRecommendation } from '@shared/contracts/discovery';

import { IntakeSourceBoard } from '../components/intake-source-board';
import { createDemoApi } from '../lib/demo-api';

const demoApi = createDemoApi();

export function TodayPage() {
  const [boards, setBoards] = useState<DiscoveryBoard[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [importingId, setImportingId] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    async function loadRecommendations(): Promise<void> {
      setIsLoading(true);
      setErrorMessage(null);

      try {
        const response = await demoApi.getTodayRecommendations();
        const responseBoards = response.boards ?? [];
        const responseItems = response.items ?? [];

        if (!isMounted) {
          return;
        }

        setBoards(
          responseBoards.length > 0
            ? responseBoards
            : [
                {
                  id: 'today-intake',
                  items: responseItems,
                  title: 'Today intake',
                },
              ],
        );
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
      await demoApi.importToPersonalLibrary({
        sourceLocator: item.sourceLocator,
        sourceType: item.sourceType,
      });
      setBoards((currentBoards) =>
        currentBoards.map((board) => ({
          ...board,
          items: board.items.map((candidate) =>
            candidate.id === item.id ? { ...candidate, imported: true } : candidate,
          ),
        })),
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
        <p className="page-kicker">Today intake desk</p>
        <h1 className="page-title">今日推荐</h1>
        <p className="page-description">把今天优先处理的 intake lanes、导入节奏和下一步阅读聚拢到同一个研究桌面里。</p>
      </header>

      <div className="panel-grid top-level-surface-grid">
        <section className="panel">
          <h2 className="panel-title">Today intake</h2>
          <p className="quiet-copy">按来源分道处理今天值得先收进个人 inventory 的候选文献。</p>
          {isLoading ? <p className="quiet-copy">Loading today recommendations…</p> : null}
          {errorMessage ? <p className="quiet-copy">{errorMessage}</p> : null}
          {!isLoading && !errorMessage && boards.length === 0 ? (
            <p className="quiet-copy">No recommendations available right now.</p>
          ) : null}
          {boards.map((board) => (
            <IntakeSourceBoard
              importingId={importingId}
              items={board.items}
              key={board.id}
              onImport={(item) => void handleImport(item)}
              subtitle="Each board keeps a stable source story while you decide what enters the personal shelf."
              title={board.title}
            />
          ))}
        </section>

        <section className="panel">
          <h2 className="panel-title">Next destination</h2>
          <p className="quiet-copy">After import, keep sorting inside the unified personal inventory before promoting anything into a project surface.</p>
          <Link className="panel-link" to="/search">
            Open search intake
          </Link>
          <Link className="panel-link" to="/library">
            Open personal inventory
          </Link>
        </section>
      </div>
    </main>
  );
}
