import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

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

const importedEntryFixture = {
  asset: {
    abstractText: 'A server-owned project recovery paper.',
    canonicalId: 'doi:10.1000/project-recovery',
    createdAt: '2026-05-03T00:00:00.000Z',
    id: 'asset-recovery',
    title: 'Project-first recovery paper',
  },
  entry: {
    addedAt: '2026-05-03T00:00:00.000Z',
    addedByUserId: 'user-alice',
    createdAt: '2026-05-03T00:00:00.000Z',
    id: 'entry-recovery',
    paperAssetId: 'asset-recovery',
    scope: { type: 'project', id: 'project-recovery' },
    scopeId: 'project-recovery',
    scopeType: 'project',
    spaceId: 'space-recovery',
    visibility: 'space_shared',
  },
};

function installFetchMock() {
  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const requestUrl = new URL(String(input), window.location.origin);
    const headers = new Headers(init?.headers);
    const actor = headers.get('x-jixia-actor');

    if (requestUrl.pathname.startsWith('/api/')) {
      const protectedRoute = requestUrl.pathname !== '/api/health' && !requestUrl.pathname.startsWith('/api/writing/');

      if (protectedRoute && !actor) {
        return Response.json(
          { error: 'Missing server-derived actor session.' },
          { status: 401 },
        );
      }

      if (
        requestUrl.searchParams.has('actorUserId') ||
        requestUrl.searchParams.has('actorSpaceId') ||
        requestUrl.searchParams.has('userId')
      ) {
        return Response.json(
          { error: 'Actor authority must travel by session header only.' },
          { status: 400 },
        );
      }
    }

    if (requestUrl.pathname === '/api/projects' && init?.method === 'POST') {
      return Response.json(projectFixture);
    }

    if (requestUrl.pathname === '/api/projects') {
      return Response.json(actor === 'user-alice' ? [projectFixture] : []);
    }

    if (requestUrl.pathname === '/api/projects/project-recovery/members') {
      return Response.json([projectFixture.membership]);
    }

    if (requestUrl.pathname === '/api/spaces') {
      return Response.json([
        {
          createdAt: '2026-05-03T00:00:00.000Z',
          id: 'space-recovery',
          kind: 'shared',
          name: 'Recovery Governance Space',
        },
      ]);
    }

    if (requestUrl.pathname === '/api/spaces/space-recovery/memberships') {
      return Response.json([
        {
          joinedAt: '2026-05-03T00:00:00.000Z',
          role: 'owner',
          spaceId: 'space-recovery',
          userId: 'user-alice',
        },
      ]);
    }

    if (requestUrl.pathname === '/api/library') {
      return Response.json([importedEntryFixture]);
    }

    if (requestUrl.pathname === '/api/reading/entry-recovery') {
      return Response.json({
        ...importedEntryFixture,
        insights: [
          {
            conversationId: 'conversation-recovery',
            createdAt: '2026-05-03T00:10:00.000Z',
            evidenceSpans: [
              {
                endOffset: 20,
                paperAssetId: 'asset-recovery',
                quote: 'project recovery evidence',
                startOffset: 0,
              },
            ],
            id: 'insight-recovery',
            libraryEntryId: 'entry-recovery',
            summary: 'Project recovery insight ready for Writer.',
          },
        ],
        notes: [],
      });
    }

    if (requestUrl.pathname === '/api/projects/project-recovery/writing/document') {
      return Response.json({
        document: {
          documentId: 'doc-1',
          latestSnapshot: null,
          projectId: 'project-recovery',
          publishState: 'draft',
          spaceId: 'space-recovery',
          title: 'Project-first Recovery',
        },
      });
    }

    return Response.json({ error: 'Unhandled mock route' }, { status: 404 });
  });

  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function renderLegacyWorkflow() {
  window.history.replaceState({}, '', '/projects');
  render(<App />);
}

beforeEach(() => {
  installFetchMock();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('mvp workflow shell', () => {
  it('navigates from spaces to library, reader, and writing', async () => {
    const user = userEvent.setup();

    renderLegacyWorkflow();

    expect(
      screen.getByRole('heading', { name: 'Projects' }),
    ).toBeInTheDocument();
    expect(
      screen.getByText('Space is governance · Project is collaboration'),
    ).toBeInTheDocument();

    await waitFor(() =>
      expect(
        screen.getByRole('link', { name: 'Open project library' }),
      ).toBeInTheDocument(),
    );
    await user.click(screen.getByRole('link', { name: 'Open project library' }));

    expect(
      screen.getByRole('heading', { name: 'Library' }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText('context bar')).toHaveTextContent(
      'Context · space-recovery / project-recovery',
    );
    expect(screen.getByLabelText('context bar')).toHaveTextContent(
      'pmid import',
    );
    await waitFor(() =>
      expect(screen.getByText('Project · Project-first Recovery')).toBeInTheDocument(),
    );
    expect(screen.getByText('Loading state placeholder')).toBeInTheDocument();
    expect(screen.getByText('Empty shelf placeholder')).toBeInTheDocument();

    await user.click(screen.getByRole('link', { name: 'Open reader' }));

    expect(screen.getByRole('heading', { name: 'Reader' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Workbench' })).toBeInTheDocument();
    expect(screen.getByLabelText('context bar')).toHaveTextContent(
      'Space context · space-recovery',
    );
    expect(screen.getByText('Project context · Project-first Recovery')).toBeInTheDocument();
    expect(screen.getByText('Entry · entry-recovery')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Promote latest insight to Writer' }));
    expect(await screen.findByText('Promoted latest insight into Writer.')).toBeInTheDocument();
    await user.click(screen.getByRole('link', { name: 'Open writing' }));

    expect(screen.getByRole('heading', { name: 'Writing' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Versions and references' })).toBeInTheDocument();
    expect(
      screen.getByLabelText('context bar'),
    ).toHaveTextContent('Space context · space-recovery');
    expect(
      screen.getByLabelText('context bar'),
    ).toHaveTextContent('Project context · Project-first Recovery · doc-1');
  });

  it('shares scholarly shell primitives across pages', async () => {
    const user = userEvent.setup();

    renderLegacyWorkflow();

    expect(screen.getByTestId('app-shell')).toHaveClass('app-shell');
    expect(screen.getByRole('heading', { name: 'Projects' })).toHaveClass('page-title');

    await waitFor(() =>
      expect(
        screen.getByRole('link', { name: 'Open project library' }),
      ).toBeInTheDocument(),
    );
    await user.click(screen.getByRole('link', { name: 'Open project library' }));

    expect(screen.getByLabelText('context bar')).toHaveClass('context-bar');
    await waitFor(() =>
      expect(
        screen.getByRole('heading', { name: 'Project-first recovery paper' }),
      ).toHaveClass('panel-title'),
    );
    expect(screen.getAllByText('space_shared')[0]).toHaveClass('status-badge');
  });

  it('surfaces governance cues across library, reader, and writing', async () => {
    const user = userEvent.setup();

    renderLegacyWorkflow();

    await waitFor(() =>
      expect(
        screen.getByRole('link', { name: 'Open project library' }),
      ).toBeInTheDocument(),
    );
    await user.click(screen.getByRole('link', { name: 'Open project library' }));

    await waitFor(() =>
      expect(screen.getByText('Shared context · space-recovery')).toBeInTheDocument(),
    );
    expect(screen.getByText('Visibility · space_shared')).toBeInTheDocument();

    await user.click(screen.getByRole('link', { name: 'Open reader' }));

    expect(
      screen.getByText('Governed action source · queued → running → succeeded'),
    ).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Promote latest insight to Writer' }));
    expect(await screen.findByText('Promoted latest insight into Writer.')).toBeInTheDocument();
    await user.click(screen.getByRole('link', { name: 'Open writing' }));

    expect(screen.getByText('Publish state path')).toBeInTheDocument();
    expect(screen.getByText('draft · review · published')).toBeInTheDocument();
  });

  it('supports direct reader deep links with project and entry context', async () => {
    window.history.replaceState(
      {},
      '',
      '/projects/project-recovery/library/entry-recovery/reader',
    );

    render(<App />);

    expect(screen.getByRole('heading', { name: 'Reader' })).toBeInTheDocument();
    expect(screen.getByText('Entry · entry-recovery')).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByLabelText('context bar')).toHaveTextContent(
        'Space context · space-recovery',
      ),
    );
  });

  it('supports direct library deep links with space and project context', async () => {
    window.history.replaceState(
      {},
      '',
      '/projects/project-recovery/library',
    );

    render(<App />);

    expect(screen.getByRole('heading', { name: 'Library' })).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByLabelText('context bar')).toHaveTextContent(
        'Context · space-recovery / project-recovery',
      ),
    );
  });

  it('supports direct writing deep links with project and doc context', async () => {
    window.history.replaceState(
      {},
      '',
      '/projects/project-recovery/writing/doc-1',
    );

    render(<App />);

    expect(screen.getByRole('heading', { name: 'Writing' })).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByLabelText('context bar')).toHaveTextContent(
        'Space context · space-recovery',
      ),
    );
  });
});
