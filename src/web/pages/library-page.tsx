import { useEffect, useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';

import type { LibraryListResponse } from '@shared/contracts/library';
import type { DemoSpaceListResponse } from '@shared/contracts/spaces';

import { getLibraryEntries, importLibraryPaper } from '../lib/demo-api';
import { useJsonResource } from '../lib/use-json-resource';

export function LibraryPage() {
  const { spaceId = 'shared-space', projectId = 'tumor-board' } = useParams();
  const spacesRequest = useJsonResource<DemoSpaceListResponse>('/api/spaces');
  const [entries, setEntries] = useState<LibraryListResponse['entries']>([]);
  const [libraryError, setLibraryError] = useState<string | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [importLocator, setImportLocator] = useState('654321');
  const [isImporting, setIsImporting] = useState(false);
  const [isLoadingEntries, setIsLoadingEntries] = useState(true);
  const [sourceType, setSourceType] = useState<'arxiv' | 'doi' | 'pmid'>('pmid');
  const activeSpace = spacesRequest.data?.spaces.find(
    (space) => space.spaceId === spaceId,
  );
  const visibilityFallback = activeSpace?.visibility ?? 'space_shared';
  const isLoading = spacesRequest.isLoading || isLoadingEntries;
  const error = spacesRequest.error ?? libraryError;

  useEffect(() => {
    let isActive = true;

    async function loadEntries(): Promise<void> {
      setIsLoadingEntries(true);
      setLibraryError(null);

      try {
        const response = await getLibraryEntries(spaceId, projectId);

        if (!isActive) {
          return;
        }

        setEntries(response.entries);
      } catch (loadError) {
        if (!isActive) {
          return;
        }

        setLibraryError(
          loadError instanceof Error ? loadError.message : 'Library request failed.',
        );
      } finally {
        if (isActive) {
          setIsLoadingEntries(false);
        }
      }
    }

    void loadEntries();

    return () => {
      isActive = false;
    };
  }, [projectId, spaceId]);

  async function handleImport(event: FormEvent<HTMLFormElement>): Promise<void> {
    event.preventDefault();

    const trimmedLocator = importLocator.trim();

    if (!trimmedLocator) {
      setImportError('Import locator is required.');
      return;
    }

    setImportError(null);
    setIsImporting(true);

    try {
      await importLibraryPaper({
        sourceLocator: trimmedLocator,
        sourceType,
        spaceId,
        visibility: visibilityFallback,
      });
      const response = await getLibraryEntries(spaceId, projectId);

      setEntries(response.entries);
    } catch (mutationError) {
      setImportError(
        mutationError instanceof Error ? mutationError.message : 'Import failed.',
      );
    } finally {
      setIsImporting(false);
    }
  }

  return (
    <main className="page-shell">
      <header className="page-header">
        <p className="page-kicker">Shared space · curated collection · visibility-aware entries</p>
        <h1 className="page-title">Library</h1>
        <p className="page-description">
          Review imported literature entries, metadata, and reading readiness
          inside the selected space.
        </p>
      </header>

      <section aria-label="context bar" className="context-bar">
        <span>
          Context · {activeSpace?.name ?? spaceId} / {projectId}
        </span>
        <span className="status-badge">{visibilityFallback}</span>
        <span className="status-badge">
          {activeSpace?.importLocator ?? 'seeded import'}
        </span>
      </section>

      <section className="panel-grid" aria-label="library list">
        <article className="panel stack-sm">
          <h2 className="panel-title">Import paper</h2>
          <p className="quiet-copy">
            Bring one more deterministic DOI, PMID, or arXiv record into the shared
            shelf before opening the reader.
          </p>
          <form className="stack-sm" onSubmit={(event) => void handleImport(event)}>
            <label className="field-label" htmlFor="import-locator">
              <span>Import locator</span>
              <input
                className="text-input"
                id="import-locator"
                name="importLocator"
                onChange={(event) => setImportLocator(event.target.value)}
                type="text"
                value={importLocator}
              />
            </label>
            <label className="field-label" htmlFor="import-source-type">
              <span>Source type</span>
              <select
                className="text-input"
                id="import-source-type"
                name="sourceType"
                onChange={(event) =>
                  setSourceType(event.target.value as 'arxiv' | 'doi' | 'pmid')
                }
                value={sourceType}
              >
                <option value="pmid">pmid</option>
                <option value="doi">doi</option>
                <option value="arxiv">arxiv</option>
              </select>
            </label>
            <div className="button-row">
              <button className="action-button" disabled={isImporting} type="submit">
                {isImporting ? 'Importing paper…' : 'Import paper'}
              </button>
            </div>
          </form>
          {importError ? <p className="quiet-copy">{importError}</p> : null}
        </article>

        {isLoading ? (
          <article className="panel">
            <h2 className="panel-title">Loading library entries…</h2>
            <p className="quiet-copy">
              Reading availability, import metadata, and visibility are loading from
              the server.
            </p>
          </article>
        ) : null}

        {error ? (
          <article className="panel">
            <h2 className="panel-title">Library unavailable</h2>
            <p className="quiet-copy">{error}</p>
          </article>
        ) : null}

        {!isLoading && !error && entries.length === 0 ? (
          <article className="panel">
            <h2 className="panel-title">No imported literature yet</h2>
            <p className="quiet-copy">
              Import a DOI, PMID, arXiv preprint, or upload to seed the shared shelf.
            </p>
          </article>
        ) : null}

        {entries.map((entry) => (
          <article className="panel" key={entry.entryId}>
            <h2 className="panel-title">{entry.title}</h2>
            <p className="quiet-copy">
              Canonical record · {entry.canonicalId ?? activeSpace?.importLocator ?? 'seeded import'}
            </p>
            <p className="quiet-copy">Shared context · {activeSpace?.name ?? spaceId}</p>
            <p className="quiet-copy">Project · {projectId}</p>
            <p className="quiet-copy">
              Visibility · {entry.visibility ?? visibilityFallback}
            </p>
            <Link
              className="panel-link"
              to={`/spaces/${spaceId}/projects/${projectId}/library/${entry.entryId}/reader`}
            >
              Open reader
            </Link>
          </article>
        ))}
      </section>
    </main>
  );
}
