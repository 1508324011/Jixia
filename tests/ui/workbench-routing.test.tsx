import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { App } from '../../src/web/app';

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
    },
    status,
  });
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('workbench routing', () => {
  it('redirects authenticated users to /home and renders stable nav', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string | URL | Request) => {
        const requestUrl =
          typeof input === 'string'
            ? input
            : input instanceof URL
              ? input.toString()
              : input.url;

        if (requestUrl.endsWith('/api/session/me')) {
          return jsonResponse({
            user: {
              displayName: 'Alice',
              email: 'alice@example.test',
              id: 'user-alice',
            },
          });
        }

        if (requestUrl.endsWith('/api/projects')) {
          return jsonResponse([]);
        }

        if (requestUrl.endsWith('/api/home-cockpit')) {
          return jsonResponse({
            actor: {
              displayName: 'Alice',
              email: 'alice@example.test',
              id: 'user-alice',
            },
            contract: 'jixia-home-cockpit-contract',
            generatedAt: '2026-05-17T12:00:00.000Z',
            nextActions: [],
            notices: [],
            recentActivity: [],
            sections: [
              {
                description: 'Create or join a governed space and project before sharing research assets.',
                id: 'collaboration',
                metrics: [{ label: 'Visible projects', value: 0 }],
                primaryAction: {
                  description: 'Start a collaboration lane from a governed space.',
                  id: 'create-project',
                  label: 'Create project',
                  priority: 'primary',
                  to: '/projects',
                },
                status: 'empty',
                title: 'Collaboration cockpit',
              },
              {
                description: 'Import literature into your Personal Library before reading or adopting into a project.',
                id: 'library',
                metrics: [{ label: 'Personal sources', value: 0 }],
                primaryAction: {
                  description: 'Find PubMed or arXiv sources to import.',
                  id: 'search-literature',
                  label: 'Search literature',
                  priority: 'primary',
                  to: '/search',
                },
                status: 'empty',
                title: 'Literature and reading',
              },
              {
                description: 'Capture evidence into a Notebook or promote project reading into Writer when ready.',
                id: 'writing',
                metrics: [{ label: 'Private notebooks', value: 0 }],
                primaryAction: {
                  description: 'Create a private synthesis notebook.',
                  id: 'start-notebook',
                  label: 'Start Notebook',
                  priority: 'primary',
                  to: '/notebook',
                },
                status: 'empty',
                title: 'Writing and versioning',
              },
              {
                description: 'Configure provider credentials before running governed AI jobs.',
                id: 'jobs',
                metrics: [{ label: 'Personal jobs', value: 0 }],
                primaryAction: {
                  description: 'Set up a credential reference before launching jobs.',
                  id: 'configure-credentials',
                  label: 'Configure credentials',
                  priority: 'primary',
                  to: '/settings',
                },
                status: 'empty',
                title: 'Governed jobs',
              },
            ],
            workbench: {
              label: 'Personal workbench',
              route: '/home',
              scope: { id: 'user-alice', type: 'user' },
            },
          });
        }

        throw new Error(`Unexpected fetch: ${requestUrl}`);
      }),
    );

    render(<App />);

    const homeLink = await screen.findByRole('link', { name: 'Home' });
    expect(homeLink).toBeInTheDocument();
    expect(homeLink).toHaveAttribute('aria-current', 'page');
    expect(await screen.findByRole('heading', { name: '个人工作台' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '今日推荐' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '搜索' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Library' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Notebook' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Projects' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Jobs' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '设置' })).toBeInTheDocument();
  });
});
