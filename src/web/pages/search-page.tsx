import { useState } from 'react';

import {
  DEFAULT_DISCOVERY_PAGE,
  DEFAULT_DISCOVERY_PAGE_SIZE,
} from '@shared/contracts/discovery';
import type {
  DiscoveryBoard,
  DiscoverySearchResponse,
  TodayRecommendation,
} from '@shared/contracts/discovery';

import { IntakeSourceBoard } from '../components/intake-source-board';
import { createDemoApi } from '../lib/demo-api';

const demoApi = createDemoApi();

function resolveSearchBoards(response: DiscoverySearchResponse): DiscoveryBoard[] {
  if (response.boards.length > 0) {
    return response.boards;
  }

  if (response.items.length === 0) {
    return [];
  }

  return [
    {
      id: `search-results-page-${response.page}`,
      items: response.items,
      title: 'Search results',
    },
  ];
}

function formatSearchWindow(response: DiscoverySearchResponse): string {
  if (response.total === 0) {
    return 'Showing 0-0 of 0';
  }

  const start = (response.page - 1) * response.pageSize + 1;
  const end = Math.min(response.page * response.pageSize, response.total);

  return `Showing ${start}-${end} of ${response.total}`;
}

function markImportedBoards(
  boards: DiscoveryBoard[],
  itemId: string,
): DiscoveryBoard[] {
  return boards.map((board) => ({
    ...board,
    items: board.items.map((item) =>
      item.id === itemId ? { ...item, imported: true, state: 'imported' } : item,
    ),
  }));
}

function markImportedItems(
  items: TodayRecommendation[],
  itemId: string,
): TodayRecommendation[] {
  return items.map((item) =>
    item.id === itemId ? { ...item, imported: true, state: 'imported' } : item,
  );
}

export function SearchPage() {
  const [query, setQuery] = useState('tumor board');
  const [searchResult, setSearchResult] = useState<DiscoverySearchResponse | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [importingId, setImportingId] = useState<string | null>(null);

  async function handleSearch(
    requestedPage = DEFAULT_DISCOVERY_PAGE,
    submittedQuery = query,
  ): Promise<void> {
    const trimmedQuery = submittedQuery.trim();

    setIsLoading(true);
    setErrorMessage(null);

    try {
      if (!trimmedQuery) {
        setSearchResult({
          boards: [],
          hasNextPage: false,
          items: [],
          page: DEFAULT_DISCOVERY_PAGE,
          pageSize: DEFAULT_DISCOVERY_PAGE_SIZE,
          query: '',
          total: 0,
        });
        return;
      }

      const response = await demoApi.searchDiscovery(trimmedQuery, {
        page: requestedPage,
        pageSize: DEFAULT_DISCOVERY_PAGE_SIZE,
      });
      const boards = resolveSearchBoards(response);

      setSearchResult({
        ...response,
        boards,
      });
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
      setSearchResult((currentResult) => {
        if (!currentResult) {
          return currentResult;
        }

        return {
          ...currentResult,
          boards: markImportedBoards(currentResult.boards, item.id),
          items: markImportedItems(currentResult.items, item.id),
        };
      });
    } catch (error) {
      setErrorMessage(error instanceof Error ? error.message : 'Import failed.');
    } finally {
      setImportingId(null);
    }
  }

  const boards = searchResult ? resolveSearchBoards(searchResult) : [];
  const hasSearchResult = searchResult !== null;
  const hasMatches = (searchResult?.total ?? 0) > 0;

  return (
    <main className="page-shell">
      <header className="page-header">
        <p className="page-kicker">Discovery intake</p>
        <h1 className="page-title">Search</h1>
        <p className="page-description">
          Search across the current discovery sources, then decide what deserves a place inside the
          personal inventory.
        </p>
      </header>

      <section className="panel search-surface">
        <form
          className="field-stack"
          onSubmit={(event) => {
            event.preventDefault();
            void handleSearch(DEFAULT_DISCOVERY_PAGE, query);
          }}
        >
          <label className="field-stack">
            <span className="field-label">Search topic</span>
            <input
              name="query"
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Enter keywords, author, or DOI"
              value={query}
            />
          </label>
          <button className="action-button" type="submit">
            Search intake boards
          </button>
        </form>
        <p className="quiet-copy">
          Search results stay source-grouped and page-aware so import actions remain stable while you
          triage external evidence.
        </p>
        {isLoading ? <p className="quiet-copy">Searching discovery sources…</p> : null}
        {errorMessage ? <p className="quiet-copy">{errorMessage}</p> : null}
      </section>

      {hasSearchResult ? (
        <section className="panel search-results-toolbar" aria-label="search pagination summary">
          <div className="stack-xs">
            <p className="field-label">Search window</p>
            <p className="search-results-summary">{formatSearchWindow(searchResult)}</p>
            <p className="quiet-copy">
              Page {searchResult.page} keeps result density stable while preserving truthful import
              state per candidate.
            </p>
          </div>

          <div className="button-row search-results-pagination">
            <button
              className="action-button"
              disabled={isLoading || searchResult.page <= DEFAULT_DISCOVERY_PAGE}
              onClick={() => void handleSearch(searchResult.page - 1, searchResult.query)}
              type="button"
            >
              Previous page
            </button>
            <button
              className="action-button"
              disabled={isLoading || !searchResult.hasNextPage}
              onClick={() => void handleSearch(searchResult.page + 1, searchResult.query)}
              type="button"
            >
              Next page
            </button>
          </div>
        </section>
      ) : null}

      {!isLoading && hasSearchResult && !hasMatches ? (
        <section className="panel">
          <p className="quiet-copy">No discovery candidates matched this search.</p>
        </section>
      ) : null}

      <section aria-label="search results" className="search-results-lanes">
        {boards.map((board) => (
          <IntakeSourceBoard
            importingId={importingId}
            items={board.items}
            key={board.id}
            laneLabel={board.laneLabel ?? `${board.title} intake lane`}
            onImport={(item) => void handleImport(item)}
            subtitle={
              board.description ??
              'Keep each source readable, dense, and stable while you triage what belongs in the inventory.'
            }
            title={board.title}
          />
        ))}
      </section>
    </main>
  );
}
