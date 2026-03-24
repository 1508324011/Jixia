import { useState } from 'react';

import type { DiscoveryBoard, TodayRecommendation } from '@shared/contracts/discovery';

import { IntakeSourceBoard } from '../components/intake-source-board';
import { createDemoApi } from '../lib/demo-api';

const demoApi = createDemoApi();

export function SearchPage() {
  const [query, setQuery] = useState('tumor board');
  const [boards, setBoards] = useState<DiscoveryBoard[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [importingId, setImportingId] = useState<string | null>(null);

  async function handleSearch(): Promise<void> {
    setIsLoading(true);
    setErrorMessage(null);

    try {
      const response = await demoApi.searchDiscovery(query);
      const responseBoards = response.boards ?? [];
      const responseItems = response.items ?? [];

      setBoards(
        responseBoards.length > 0
          ? responseBoards
          : [
              {
                id: 'search-results',
                items: responseItems,
                title: 'Search results',
              },
            ],
      );
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Search failed.');
    } finally {
      setIsLoading(false);
    }
  }

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
      setErrorMessage(error instanceof Error ? error.message : 'Import failed.');
    } finally {
      setImportingId(null);
    }
  }

  return (
    <main className="page-shell">
      <header className="page-header">
        <p className="page-kicker">Discovery intake</p>
        <h1 className="page-title">外部搜索</h1>
        <p className="page-description">Search across the current discovery sources, then decide what deserves a place inside the personal inventory.</p>
      </header>

      <section className="panel search-surface">
        <form
          className="field-stack"
          onSubmit={(event) => {
            event.preventDefault();
            void handleSearch();
          }}
        >
          <label className="field-stack">
            <span className="field-label">检索主题</span>
            <input
              name="query"
              onChange={(event) => setQuery(event.target.value)}
              placeholder="输入关键词、作者或 DOI"
              value={query}
            />
          </label>
          <button className="action-button" type="submit">
            Search intake boards
          </button>
        </form>
        <p className="quiet-copy">The UI now frames results as source boards instead of one flat list, even while the backend discovery sources are still intentionally lightweight.</p>
        {isLoading ? <p className="quiet-copy">Searching PubMed…</p> : null}
        {errorMessage ? <p className="quiet-copy">{errorMessage}</p> : null}
      </section>

      <section aria-label="search results" className="panel-grid">
        {boards.map((board) => (
          <IntakeSourceBoard
            importingId={importingId}
            items={board.items}
            key={board.id}
            onImport={(item) => void handleImport(item)}
            subtitle="Each result board keeps the source narrative intact while you triage what belongs in the inventory."
            title={board.title}
          />
        ))}
      </section>
    </main>
  );
}
