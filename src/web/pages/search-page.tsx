import { useState, type FormEvent } from 'react';

import type { TodayRecommendation } from '@shared/contracts/discovery';

import { createDemoApi } from '../lib/demo-api';

const demoApi = createDemoApi();

export function SearchPage() {
  const [query, setQuery] = useState('tumor board');
  const [results, setResults] = useState<TodayRecommendation[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [importingId, setImportingId] = useState<string | null>(null);

  async function handleSearch(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setIsLoading(true);
    setErrorMessage(null);

    try {
      const response = await demoApi.searchDiscovery(query);
      setResults(response.items);
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
      setResults((currentResults) =>
        currentResults.map((candidate) =>
          candidate.id === item.id ? { ...candidate, imported: true } : candidate,
        ),
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
        <p className="page-kicker">Discovery</p>
        <h1 className="page-title">外部搜索</h1>
        <p className="page-description">搜索外部文献并导入到个人 Library，再决定是否带入项目协作。</p>
      </header>

      <section className="panel search-surface">
        <form className="field-stack" onSubmit={(event) => void handleSearch(event)}>
          <label className="field-stack">
            <span className="field-label">检索主题</span>
            <input
              name="query"
              onChange={(event) => setQuery(event.target.value)}
              placeholder="输入关键词、作者或 DOI"
              value={query}
            />
          </label>
          <button type="submit">检索 PubMed</button>
        </form>
        <p className="quiet-copy">当前优先接入一个稳定来源：PubMed 检索与导入。</p>
        {isLoading ? <p className="quiet-copy">Searching PubMed…</p> : null}
        {errorMessage ? <p className="quiet-copy">{errorMessage}</p> : null}
      </section>

      <section aria-label="search results" className="panel-grid">
        {results.map((item) => (
          <article className="panel" key={item.id}>
            <h2 className="panel-title">{item.title}</h2>
            <p className="quiet-copy">{item.reason}</p>
            <p className="quiet-copy">
              {item.sourceLabel} · {item.canonicalId}
            </p>
            <p className="quiet-copy">
              {item.imported
                ? 'Imported into personal library'
                : 'Ready to import into personal library'}
            </p>
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
          </article>
        ))}
      </section>
    </main>
  );
}
