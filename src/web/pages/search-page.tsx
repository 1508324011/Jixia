import { useState, type FormEvent } from "react";
import { Link } from "react-router-dom";

import type { TodayRecommendation } from "@shared/contracts/discovery";
import type {
  ImportSourceType,
} from "@shared/contracts/library";

import { apiClient } from "../lib/http-client";
import { useSearchPresenter } from "../presenters/search-presenter";

export function SearchPage() {
  const {
    error,
    importPersonalSource,
    importedRecord,
    isImporting,
  } = useSearchPresenter();
  const [sourceLocator, setSourceLocator] = useState("");
  const [sourceType, setSourceType] =
    useState<Exclude<ImportSourceType, "upload">>("doi");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<TodayRecommendation[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [importingId, setImportingId] = useState<string | null>(null);

  async function handleSearch(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();
    setIsLoading(true);
    setErrorMessage(null);

    try {
      const response = await apiClient.searchDiscovery(query);
      setResults(response.items);
    } catch (searchError) {
      setErrorMessage(searchError instanceof Error ? searchError.message : "Search failed.");
    } finally {
      setIsLoading(false);
    }
  }

  async function handleImport(item: TodayRecommendation): Promise<void> {
    setImportingId(item.id);
    setErrorMessage(null);

    try {
      await apiClient.importToPersonalLibrary({
        sourceLocator: item.sourceLocator,
        sourceType: item.sourceType,
      });
      setResults((currentResults) =>
        currentResults.map((candidate) =>
          candidate.id === item.id ? { ...candidate, imported: true } : candidate,
        ),
      );
    } catch (importError) {
      setErrorMessage(importError instanceof Error ? importError.message : "Import failed.");
    } finally {
      setImportingId(null);
    }
  }

  return (
    <main className="page-shell">
      <header className="page-header">
        <p className="page-kicker">Discovery</p>
        <h1 className="page-title">外部搜索</h1>
        <p className="page-description">
          搜索外部文献并导入到个人 Library，再决定是否带入项目协作。
        </p>
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
        {!isLoading && !errorMessage && query.trim() && results.length === 0 ? (
          <p className="quiet-copy">
            No PubMed results were returned for this query. Try a different term or
            import a known DOI/PMID/arXiv identifier below.
          </p>
        ) : null}
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
                ? "Imported into personal library"
                : "Ready to import into personal library"}
            </p>
            <button
              disabled={item.imported || importingId === item.id}
              onClick={() => void handleImport(item)}
              type="button"
            >
              {item.imported
                ? "Open personal Library"
                : importingId === item.id
                  ? "Importing…"
                  : "导入到个人 Library"}
            </button>
          </article>
        ))}
      </section>

      <section aria-label="context bar" className="context-bar">
        <span>
          Discovery workspace · Personal Library import only
        </span>
        <span className="status-badge">import-ready</span>
        <span className="status-badge">server-first</span>
      </section>

      {error ? (
        <section className="panel-grid" aria-label="search errors">
          <article className="panel">
            <h2 className="panel-title">Search runtime error</h2>
            <p className="quiet-copy">{error}</p>
          </article>
        </section>
      ) : null}

      <section className="panel-grid" aria-label="personal import layout">
        <article className="panel">
          <h2 className="panel-title">Manual personal import</h2>
          <p className="quiet-copy">
            Import a known DOI, PMID, or arXiv identifier into your Personal Library
            first. To share it with a project, open Library and adopt the personal
            source into a visible project.
          </p>
          <label className="quiet-copy" htmlFor="search-source-type">
            Source type
          </label>
          <select
            id="search-source-type"
            value={sourceType}
            onChange={(event) =>
              setSourceType(event.target.value as Exclude<ImportSourceType, "upload">)
            }
          >
            <option value="doi">DOI</option>
            <option value="pmid">PMID</option>
            <option value="arxiv">arXiv</option>
          </select>
          <label className="quiet-copy" htmlFor="search-source-locator">
            Identifier
          </label>
          <input
            id="search-source-locator"
            placeholder="Enter DOI, PMID, or arXiv identifier"
            value={sourceLocator}
            onChange={(event) => setSourceLocator(event.target.value)}
          />
          <button
            className="panel-link"
            type="button"
            disabled={isImporting || sourceLocator.trim().length === 0}
            onClick={() =>
              void importPersonalSource({
                sourceLocator: sourceLocator.trim(),
                sourceType,
              })
            }
          >
            {isImporting ? "Importing…" : "Import into personal Library"}
          </button>
          <Link className="panel-link" to="/library">
            Open personal Library
          </Link>
        </article>

        <article className="panel">
          <h2 className="panel-title">Import status</h2>
          {importedRecord ? (
            <>
              <p className="quiet-copy">Imported title · {importedRecord.asset.title}</p>
              <p className="quiet-copy">Canonical id · {importedRecord.asset.canonicalId}</p>
              <p className="quiet-copy">
                Saved in Personal Library. Adopt it into a project from Library when
                needed.
              </p>
              <Link className="panel-link" to="/library">
                Open personal Library
              </Link>
            </>
          ) : (
            <p className="quiet-copy">
              Enter a DOI, PMID, or arXiv identifier to import metadata through the
              server. Imports create or reuse actor-owned Personal Library entries
              without letting the browser choose project scope or ownership.
            </p>
          )}
        </article>
      </section>
    </main>
  );
}
