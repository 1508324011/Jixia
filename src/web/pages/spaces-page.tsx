import { useState } from 'react';
import { Link } from 'react-router-dom';

import type { DemoSpaceListResponse, DemoSpaceRecord, SpaceKind } from '@shared/contracts/spaces';

import { createSpace as createSpaceRecord } from '../lib/demo-api';
import { useJsonResource } from '../lib/use-json-resource';

export function SpacesPage() {
  const { data, error, isLoading } = useJsonResource<DemoSpaceListResponse>(
    '/api/spaces',
  );
  const [createdSpaces, setCreatedSpaces] = useState<DemoSpaceRecord[]>([]);
  const [createError, setCreateError] = useState<string | null>(null);
  const [isCreating, setIsCreating] = useState(false);
  const [spaceKind, setSpaceKind] = useState<SpaceKind>('shared');
  const [spaceName, setSpaceName] = useState('');
  const spaces = [...(data?.spaces ?? []), ...createdSpaces].filter(
    (space, index, allSpaces) =>
      allSpaces.findIndex((candidate) => candidate.spaceId === space.spaceId) === index,
  );

  async function handleCreateSpace(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();

    const trimmedName = spaceName.trim();

    if (!trimmedName) {
      setCreateError('Space name is required.');
      return;
    }

    setCreateError(null);
    setIsCreating(true);

    try {
      const result = await createSpaceRecord({
        kind: spaceKind,
        name: trimmedName,
      });

      setCreatedSpaces((previousSpaces) => [...previousSpaces, result.space]);
      setSpaceKind('shared');
      setSpaceName('');
    } catch (createSpaceError: unknown) {
      setCreateError(
        createSpaceError instanceof Error
          ? createSpaceError.message
          : 'Space creation failed unexpectedly.',
      );
    } finally {
      setIsCreating(false);
    }
  }

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
        <article className="hero-card">
          <h2 className="panel-title">Create a space</h2>
          <p className="quiet-copy">
            Start a new personal or shared research lane without resetting the seeded showcase.
          </p>
          <form onSubmit={handleCreateSpace}>
            <p>
              <label>
                <span className="quiet-copy">Space name</span>
                <input
                  aria-label="Space name"
                  onChange={(event) => setSpaceName(event.target.value)}
                  value={spaceName}
                />
              </label>
            </p>
            <p>
              <label>
                <span className="quiet-copy">Space kind</span>
                <select
                  aria-label="Space kind"
                  onChange={(event) => setSpaceKind(event.target.value as SpaceKind)}
                  value={spaceKind}
                >
                  <option value="shared">Shared</option>
                  <option value="personal">Personal</option>
                </select>
              </label>
            </p>
            {createError ? <p className="quiet-copy">{createError}</p> : null}
            <button disabled={isCreating} type="submit">
              {isCreating ? 'Creating space…' : 'Create space'}
            </button>
          </form>
        </article>

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
