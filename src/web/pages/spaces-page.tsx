import { Link } from 'react-router-dom';

import type { DemoSpaceListResponse } from '@shared/contracts/spaces';

import { useJsonResource } from '../lib/use-json-resource';

export function SpacesPage() {
  const { data, error, isLoading } = useJsonResource<DemoSpaceListResponse>(
    '/api/spaces',
  );
  const spaces = data?.spaces ?? [];

  return (
    <main className="page-shell">
      <header className="page-header">
        <p className="page-kicker">Space → Project → Entry → Doc</p>
        <h1 className="page-title">Spaces</h1>
        <p className="page-description">
          Enter a personal or shared research context before opening library,
          reading, and writing work.
        </p>
      </header>

      <section className="shell-grid" aria-label="spaces list">
        {isLoading ? (
          <article className="hero-card">
            <h2 className="panel-title">Loading spaces…</h2>
            <p className="quiet-copy">
              Checking the server-owned showcase contexts before opening library,
              reading, and writing.
            </p>
          </article>
        ) : null}

        {error ? (
          <article className="hero-card">
            <h2 className="panel-title">Spaces unavailable</h2>
            <p className="quiet-copy">{error}</p>
          </article>
        ) : null}

        {!isLoading && !error && spaces.length === 0 ? (
          <article className="hero-card">
            <h2 className="panel-title">No spaces seeded yet</h2>
            <p className="quiet-copy">
              Run the native demo reset flow to restore the deterministic showcase.
            </p>
          </article>
        ) : null}

        {spaces.map((space) => (
          <article className="hero-card" key={space.spaceId}>
            <h2 className="panel-title">{space.name}</h2>
            <p className="quiet-copy">
              {space.kind === 'shared'
                ? 'Shared membership · editorial visibility · governed jobs'
                : 'Personal research lane · private notes · governed handoff'}
            </p>
            <p className="quiet-copy">Project starter · {space.projectId}</p>
            <p className="quiet-copy">Import anchor · {space.importLocator}</p>
            <p className="quiet-copy">Visibility · {space.visibility}</p>
            <Link
              className="panel-link"
              to={`/spaces/${space.spaceId}/projects/${space.projectId}/library`}
            >
              {space.kind === 'shared' ? 'Enter shared space' : 'Open library'}
            </Link>
          </article>
        ))}
      </section>
    </main>
  );
}
