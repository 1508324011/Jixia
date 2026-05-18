import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { App } from '../../src/web/app';

const projectFixture = {
  membership: {
    joinedAt: '2026-05-03T00:00:00.000Z',
    projectId: 'project-recovery',
    role: 'owner',
    userId: 'user-alice',
  },
  project: {
    createdAt: '2026-05-03T00:00:00.000Z',
    createdByUserId: 'user-alice',
    id: 'project-recovery',
    name: 'Project-first Recovery',
    spaceId: 'space-recovery',
    status: 'active',
    updatedAt: '2026-05-03T00:00:00.000Z',
  },
};

const projectWorkspaceFixture = {
  actor: {
    role: projectFixture.membership.role,
    userId: projectFixture.membership.userId,
  },
  contract: 'jixia-projects-contract',
  docs: {
    documents: [],
    emptyState: {
      body: 'Adopt a source into the project library, then promote it into Writer.',
      title: 'No shared project docs yet',
    },
    projectId: projectFixture.project.id,
    totalCount: 0,
  },
  generatedAt: '2026-05-03T00:00:00.000Z',
  links: {
    libraryHref: '/projects/project-recovery/library',
    projectHref: '/projects/project-recovery',
  },
  membership: projectFixture.membership,
  project: projectFixture.project,
};

const personalLibraryEntryFixture = {
  addedAt: '2026-05-15T00:10:00.000Z',
  canonicalId: 'doi:10.1000/personal-source',
  entryId: 'entry-personal-source',
  paperAssetId: 'asset-personal-source',
  spaceId: '',
  title: 'Personal source ready for project citation',
  visibility: 'private',
};

const adoptedProjectEntryFixture = {
  asset: {
    abstractText: 'Personal source adopted into the project library.',
    canonicalId: 'doi:10.1000/personal-source',
    createdAt: '2026-05-15T00:00:00.000Z',
    id: 'asset-personal-source',
    title: 'Personal source ready for project citation',
  },
  entry: {
    addedAt: '2026-05-15T00:20:00.000Z',
    addedByUserId: 'user-alice',
    createdAt: '2026-05-15T00:20:00.000Z',
    id: 'entry-project-source',
    paperAssetId: 'asset-personal-source',
    scope: { type: 'project', id: 'project-recovery' },
    scopeId: 'project-recovery',
    scopeType: 'project',
    spaceId: 'space-recovery',
    visibility: 'space_shared',
  },
};

function renderWorkbench(pathname: string) {
  window.history.replaceState({}, '', pathname);
  render(<App />);
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('library and project context', () => {
  it('library and project workspace expose different context labels', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string | URL) => {
        const url = input.toString();

        if (url.endsWith('/api/session/me')) {
          return Response.json({
            user: {
              displayName: 'Alice',
              email: 'alice@example.test',
              id: 'user-alice',
            },
          });
        }

        if (url.endsWith('/api/projects')) {
          return Response.json([projectFixture]);
        }

        if (url.endsWith('/api/projects/project-recovery/workspace')) {
          return Response.json(projectWorkspaceFixture);
        }

        if (url.endsWith('/api/library/personal')) {
          return Response.json({ entries: [] });
        }

        if (url.endsWith('/api/projects/project-recovery/writing-document')) {
          return Response.json(null);
        }

        throw new Error(`Unexpected fetch request: ${url}`);
      }),
    );

    renderWorkbench('/library');
    expect(await screen.findByText('Personal')).toBeInTheDocument();
    expect(await screen.findByRole('heading', { name: 'Library' })).toBeInTheDocument();

    cleanup();

    renderWorkbench('/projects/project-recovery');
    expect(await screen.findByText('Project / project-recovery')).toBeInTheDocument();
    expect(await screen.findByText('Project / Project-first Recovery')).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: '共享 Library' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Writer' })).toBeInTheDocument();
  });

  it('adopts a personal library source into a visible project with the narrow server DTO', async () => {
    const user = userEvent.setup();

    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
        const requestUrl =
          typeof input === 'string'
            ? input
            : input instanceof URL
              ? input.toString()
              : input.url;
        const url = new URL(requestUrl, window.location.origin);

        if (url.pathname === '/api/session/me') {
          return Response.json({
            user: {
              displayName: 'Alice',
              email: 'alice@example.test',
              id: 'user-alice',
            },
          });
        }

        if (url.pathname === '/api/projects') {
          return Response.json([projectFixture]);
        }

        if (url.pathname === '/api/library/personal') {
          return Response.json({ entries: [personalLibraryEntryFixture] });
        }

        if (url.pathname === '/api/library') {
          throw new Error('Personal adoption should not require a project library refresh.');
        }

        if (
          url.pathname === '/api/projects/project-recovery/library/adoptions' &&
          init?.method === 'POST'
        ) {
          expect(JSON.parse(String(init.body))).toEqual({
            sourceLibraryEntryId: 'entry-personal-source',
          });

          return Response.json({
            entry: adoptedProjectEntryFixture,
            reused: false,
          });
        }

        throw new Error(`Unexpected fetch request: ${requestUrl}`);
      }),
    );

    renderWorkbench('/library');

    expect(
      await screen.findByText('Personal source ready for project citation'),
    ).toBeInTheDocument();
    expect(screen.getByLabelText('Visible target project')).toHaveValue('project-recovery');

    await user.click(screen.getByRole('button', { name: 'Adopt into selected project' }));

    expect(
      await screen.findByText(
        'Personal source ready for project citation is now available in Project-first Recovery.',
      ),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Open target project library' })).toHaveAttribute(
      'href',
      '/projects/project-recovery/library',
    );
  });

  it('surfaces server-denied project adoption without pretending the source moved', async () => {
    const user = userEvent.setup();

    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
        const requestUrl =
          typeof input === 'string'
            ? input
            : input instanceof URL
              ? input.toString()
              : input.url;
        const url = new URL(requestUrl, window.location.origin);

        if (url.pathname === '/api/session/me') {
          return Response.json({
            user: {
              displayName: 'Alice',
              email: 'alice@example.test',
              id: 'user-alice',
            },
          });
        }

        if (url.pathname === '/api/projects') {
          return Response.json([projectFixture]);
        }

        if (url.pathname === '/api/library/personal') {
          return Response.json({ entries: [personalLibraryEntryFixture] });
        }

        if (
          url.pathname === '/api/projects/project-recovery/library/adoptions' &&
          init?.method === 'POST'
        ) {
          expect(JSON.parse(String(init.body))).toEqual({
            sourceLibraryEntryId: 'entry-personal-source',
          });

          return Response.json(
            { error: 'Project viewers cannot adopt sources into the project library.' },
            { status: 403 },
          );
        }

        if (url.pathname === '/api/library') {
          throw new Error('Project library should not refresh after denied adoption.');
        }

        throw new Error(`Unexpected fetch request: ${requestUrl}`);
      }),
    );

    renderWorkbench('/library');

    expect(
      await screen.findByText('Personal source ready for project citation'),
    ).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Adopt into selected project' }));

    expect(
      await screen.findByText('Project viewers cannot adopt sources into the project library.'),
    ).toBeInTheDocument();
    expect(
      screen.queryByText(
        'Personal source ready for project citation is now available in Project-first Recovery.',
      ),
    ).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Open target project library' })).not.toBeInTheDocument();
  });
});
