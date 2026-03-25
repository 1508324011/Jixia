import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { App } from '../../src/web/app';

function renderWorkbench(pathname = '/home') {
  window.history.replaceState({}, '', pathname);
  render(<App />);
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('workbench routing', () => {
  it('redirects authenticated users to /home and renders the top-level workbench nav', () => {
    renderWorkbench();

    expect(screen.getByRole('link', { name: 'Home' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Projects' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Search' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Library' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Notebooks' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'AI' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Settings' })).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: '今日推荐' })).not.toBeInTheDocument();
  });

  it('renders a canonical top-level ai workspace route', () => {
    renderWorkbench('/ai');

    expect(screen.getByRole('heading', { name: 'AI Workspace' })).toBeInTheDocument();
    expect(window.location.pathname).toBe('/ai');
  });

  it('redirects legacy /spaces library deep links to canonical /projects paths', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string | URL) => {
        const url = input.toString();

        if (url.endsWith('/api/spaces')) {
          return new Response(
            JSON.stringify({
              spaces: [
                {
                  importLocator: 'pmid:123456',
                  kind: 'shared',
                  name: 'Shared Space',
                  projectId: 'tumor-board',
                  spaceId: 'shared-space',
                  visibility: 'space_shared',
                },
              ],
            }),
            {
              headers: { 'Content-Type': 'application/json' },
              status: 200,
            },
          );
        }

        if (url.endsWith('/api/spaces/shared-space/projects/tumor-board/library')) {
          return new Response(JSON.stringify({ entries: [] }), {
            headers: { 'Content-Type': 'application/json' },
            status: 200,
          });
        }

        throw new Error(`Unexpected fetch request: ${url}`);
      }),
    );

    renderWorkbench('/spaces/shared-space/projects/tumor-board/library');

    expect(await screen.findByRole('heading', { name: 'Library' })).toBeInTheDocument();
    expect(window.location.pathname).toBe('/projects/tumor-board/library');
  });

  it('renders canonical personal reader routes without inventing a project route', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string | URL) => {
        const url = input.toString();

        if (url.endsWith('/api/reading/entry-1')) {
          return new Response(
            JSON.stringify({
              asset: {
                abstractText: 'Personal imported record for quiet review.',
                canonicalId: 'pmid:111111',
                id: 'asset-1',
                title: 'Personal evidence note',
              },
              entry: {
                id: 'entry-1',
                visibility: 'private',
              },
              insights: [],
              notes: [],
            }),
            {
              headers: { 'Content-Type': 'application/json' },
              status: 200,
            },
          );
        }

        throw new Error(`Unexpected fetch request: ${url}`);
      }),
    );

    renderWorkbench('/library/entry-1/reader');

    expect(await screen.findByRole('heading', { name: 'Reader' })).toBeInTheDocument();
    expect(window.location.pathname).toBe('/library/entry-1/reader');
  });
});
