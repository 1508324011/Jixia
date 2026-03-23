import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';

import type { LibraryListResponse } from '@shared/contracts/library';

import { createDemoApi } from '../lib/demo-api';

const demoApi = createDemoApi();

interface LibraryPageProps {
  mode?: 'personal' | 'project';
}

export function LibraryPage({ mode = 'project' }: LibraryPageProps) {
  const { spaceId = 'shared-space', projectId = 'tumor-board' } = useParams();
  const isPersonalMode = mode === 'personal';
  const [entries, setEntries] = useState<LibraryListResponse['entries']>([]);
  const [isLoading, setIsLoading] = useState(isPersonalMode);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  const kicker = isPersonalMode
    ? 'Personal library · imported references · ready to sort'
    : 'Shared space · curated collection · visibility-aware entries';
  const description = isPersonalMode
    ? 'Review imported literature entries and decide what stays personal versus what should move into a project workspace.'
    : 'Review imported literature entries, metadata, and reading readiness inside the selected space.';
  const contextLabel = isPersonalMode ? 'Personal context' : `Context · ${spaceId} / ${projectId}`;
  const entryContext = isPersonalMode ? 'Personal shelf' : `Project · ${projectId}`;
  const readerLink = isPersonalMode
    ? '/projects/project-1/library/entry-1/reader'
    : `/spaces/${spaceId}/projects/${projectId}/library/entry-1/reader`;

  useEffect(() => {
    if (!isPersonalMode) {
      return;
    }

    let isMounted = true;

    async function loadPersonalLibrary(): Promise<void> {
      setIsLoading(true);
      setErrorMessage(null);

      try {
        const response = await demoApi.getPersonalLibraryEntries();

        if (!isMounted) {
          return;
        }

        setEntries(response.entries);
      } catch (error) {
        if (!isMounted) {
          return;
        }

        setErrorMessage(error instanceof Error ? error.message : 'Library request failed.');
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }

    void loadPersonalLibrary();

    return () => {
      isMounted = false;
    };
  }, [isPersonalMode]);

  return (
    <main className="page-shell">
      <header className="page-header">
        <p className="page-kicker">{kicker}</p>
        <h1 className="page-title">Library</h1>
        <p className="page-description">{description}</p>
      </header>

      <section aria-label="context bar" className="context-bar">
        <span>{contextLabel}</span>
        <span className="status-badge">{isPersonalMode ? 'personal' : 'space_shared'}</span>
        <span className="status-badge">pmid import</span>
      </section>

      <section aria-label="library list" className="panel-grid">
        {isPersonalMode && isLoading ? (
          <article className="panel">
            <h2 className="panel-title">Loading library entries…</h2>
            <p className="quiet-copy">Import metadata and reading readiness are loading from the server.</p>
          </article>
        ) : null}

        {isPersonalMode && errorMessage ? (
          <article className="panel">
            <h2 className="panel-title">Library unavailable</h2>
            <p className="quiet-copy">{errorMessage}</p>
          </article>
        ) : null}

        {isPersonalMode && !isLoading && !errorMessage && entries.length === 0 ? (
          <article className="panel">
            <h2 className="panel-title">No imported literature yet</h2>
            <p className="quiet-copy">Search PubMed or import a recommendation from Today to seed your personal shelf.</p>
          </article>
        ) : null}

        {isPersonalMode
          ? entries.map((entry) => (
              <article className="panel" key={entry.entryId}>
                <h2 className="panel-title">{entry.title}</h2>
                <p className="quiet-copy">Canonical record · {entry.canonicalId}</p>
                <p className="quiet-copy">Source · Imported into Personal Library</p>
                <p className="quiet-copy">Personal shelf</p>
                <p className="quiet-copy">Visibility · {entry.visibility}</p>
                <Link className="panel-link" to={`/projects/project-1/library/${entry.entryId}/reader`}>
                  Open reader
                </Link>
              </article>
            ))
          : null}

        {!isPersonalMode ? (
          <article className="panel">
            <h2 className="panel-title">Signal pathways in shared tumor boards</h2>
            <p className="quiet-copy">
              Authors · Source metadata · <span className="status-badge">space_shared</span>
            </p>
            <p className="quiet-copy">Shared context · {spaceId}</p>
            <p className="quiet-copy">{entryContext}</p>
            <p className="quiet-copy">Visibility · space_shared</p>
            <Link className="panel-link" to={readerLink}>
              Open reader
            </Link>
          </article>
        ) : null}

        {!isPersonalMode ? (
          <article className="panel">
            <h2 className="panel-title">Loading state placeholder</h2>
            <p className="quiet-copy">Import queue and reading-state activity will settle here.</p>
          </article>
        ) : null}

        {!isPersonalMode ? (
          <article className="panel">
            <h2 className="panel-title">Empty shelf placeholder</h2>
            <p className="quiet-copy">Use DOI, PMID, arXiv, or upload import paths when a space has no entries yet.</p>
          </article>
        ) : null}
      </section>
    </main>
  );
}
