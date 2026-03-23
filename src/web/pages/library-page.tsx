import { useEffect, useState, type FormEvent } from 'react';
import { Link, useParams } from 'react-router-dom';

import type { LibraryListResponse } from '@shared/contracts/library';
import type { DemoSpaceListResponse } from '@shared/contracts/spaces';

import {
  createDemoApi,
  getLibraryEntries,
  getSpaces,
  importLibraryPaper,
} from '../lib/demo-api';

const demoApi = createDemoApi();

interface LibraryPageProps {
  mode?: 'personal' | 'project';
}

export function LibraryPage({ mode = 'project' }: LibraryPageProps) {
  const { spaceId, projectId } = useParams();
  const isPersonalMode = mode === 'personal' && !spaceId;
  const resolvedSpaceId = spaceId ?? 'shared-space';
  const resolvedProjectId = projectId ?? 'tumor-board';

  const [spacesData, setSpacesData] = useState<DemoSpaceListResponse | null>(null);
  const [entries, setEntries] = useState<LibraryListResponse['entries']>([]);
  const [libraryError, setLibraryError] = useState<string | null>(null);
  const [importError, setImportError] = useState<string | null>(null);
  const [isLoadingEntries, setIsLoadingEntries] = useState(true);
  const [isImporting, setIsImporting] = useState(false);
  const [importLocator, setImportLocator] = useState('654321');
  const [sourceType, setSourceType] = useState<'arxiv' | 'doi' | 'pmid'>('pmid');

  const activeSpace = spacesData?.spaces.find((space) => space.spaceId === resolvedSpaceId);
  const visibilityFallback = activeSpace?.visibility ?? 'space_shared';
  const kicker = isPersonalMode
    ? 'Personal library · imported references · ready to sort'
    : 'Shared space · curated collection · visibility-aware entries';
  const description = isPersonalMode
    ? 'Review imported literature entries and decide what stays private versus what should move into a project workspace.'
    : 'Review imported literature entries, metadata, and reading readiness inside the selected space.';
  const contextLabel = isPersonalMode
    ? 'Personal context'
    : `Context · ${activeSpace?.name ?? resolvedSpaceId} / ${resolvedProjectId}`;
  const importLabel = isPersonalMode
    ? 'Private-first import surface for your personal reading lane.'
    : `Import target · ${activeSpace?.name ?? resolvedSpaceId}`;
  const statusLabel = isPersonalMode ? 'personal' : visibilityFallback;
  const sourceLabel = isPersonalMode
    ? 'personal import'
    : activeSpace?.importLocator ?? 'pmid import';

  useEffect(() => {
    if (isPersonalMode) {
      setSpacesData(null);
      return;
    }

    let isActive = true;

    async function loadSpaces(): Promise<void> {
      try {
        const response = await getSpaces();

        if (isActive) {
          setSpacesData(response);
        }
      } catch (error) {
        if (isActive) {
          setLibraryError(error instanceof Error ? error.message : 'Space request failed.');
        }
      }
    }

    void loadSpaces();

    return () => {
      isActive = false;
    };
  }, [isPersonalMode]);

  useEffect(() => {
    let isActive = true;

    async function loadEntries(): Promise<void> {
      setIsLoadingEntries(true);
      setLibraryError(null);

      try {
        const response = isPersonalMode
          ? await demoApi.getPersonalLibraryEntries()
          : await getLibraryEntries(resolvedSpaceId, resolvedProjectId);

        if (isActive) {
          setEntries(response.entries);
        }
      } catch (error) {
        if (isActive) {
          setLibraryError(error instanceof Error ? error.message : 'Library request failed.');
        }
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
  }, [isPersonalMode, resolvedProjectId, resolvedSpaceId]);

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
        spaceId: resolvedSpaceId,
        visibility: visibilityFallback,
      });

      const response = await getLibraryEntries(resolvedSpaceId, resolvedProjectId);
      setEntries(response.entries);
    } catch (error) {
      setImportError(error instanceof Error ? error.message : 'Import failed.');
    } finally {
      setIsImporting(false);
    }
  }

  return (
    <main className="page-shell">
      <header className="page-header">
        <p className="page-kicker">{kicker}</p>
        <h1 className="page-title">Library</h1>
        <p className="page-description">{description}</p>
      </header>

      <section aria-label="context bar" className="context-bar">
        <span>{contextLabel}</span>
        <span className="status-badge">{statusLabel}</span>
        <span className="status-badge">{sourceLabel}</span>
      </section>

      <section aria-label="library list" className="panel-grid">
        {!isPersonalMode ? (
          <article className="panel stack-sm">
            <h2 className="panel-title">Import paper</h2>
            <p className="quiet-copy">
              Bring one more deterministic DOI, PMID, or arXiv record into the shared shelf before
              opening the reader.
            </p>
            <p className="quiet-copy">{importLabel}</p>
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
        ) : null}

        {isLoadingEntries ? (
          <article className="panel">
            <h2 className="panel-title">Loading library entries…</h2>
            <p className="quiet-copy">
              {isPersonalMode
                ? 'Import metadata and reading readiness are loading from the server.'
                : 'Reading availability, import metadata, and visibility are loading from the server.'}
            </p>
          </article>
        ) : null}

        {libraryError ? (
          <article className="panel">
            <h2 className="panel-title">Library unavailable</h2>
            <p className="quiet-copy">{libraryError}</p>
          </article>
        ) : null}

        {!isLoadingEntries && !libraryError && entries.length === 0 ? (
          <article className="panel">
            <h2 className="panel-title">No imported literature yet</h2>
            <p className="quiet-copy">
              {isPersonalMode
                ? 'Search PubMed or import a recommendation from Today to seed your personal shelf.'
                : 'Import a DOI, PMID, arXiv preprint, or upload to seed the shared shelf.'}
            </p>
          </article>
        ) : null}

        {!isLoadingEntries && !libraryError
          ? entries.map((entry) => (
              <article className="panel" key={entry.entryId}>
                <h2 className="panel-title">{entry.title}</h2>
                <p className="quiet-copy">Canonical record · {entry.canonicalId}</p>
                <p className="quiet-copy">
                  {isPersonalMode
                    ? 'Source · Imported into Personal Library'
                    : `Shared context · ${activeSpace?.name ?? resolvedSpaceId}`}
                </p>
                <p className="quiet-copy">
                  {isPersonalMode ? 'Personal shelf' : `Project · ${resolvedProjectId}`}
                </p>
                <p className="quiet-copy">Visibility · {entry.visibility}</p>
                <Link
                  className="panel-link"
                  to={
                    isPersonalMode
                      ? `/projects/project-1/library/${entry.entryId}/reader`
                      : `/spaces/${resolvedSpaceId}/projects/${resolvedProjectId}/library/${entry.entryId}/reader`
                  }
                >
                  Open reader
                </Link>
              </article>
            ))
          : null}
      </section>
    </main>
  );
}
