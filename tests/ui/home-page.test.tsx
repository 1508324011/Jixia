import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { HomeCockpitResponse } from '../../src/shared/contracts/home-cockpit';
import { App } from '../../src/web/app';

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
    },
    status,
  });
}

function createHomeCockpitFixture(
  overrides: Partial<HomeCockpitResponse> = {},
): HomeCockpitResponse {
  return {
    actor: {
      displayName: 'Alice',
      email: 'alice@example.test',
      id: 'user-alice',
    },
    contract: 'jixia-home-cockpit-contract',
    generatedAt: '2026-05-17T12:00:00.000Z',
    nextActions: [
      {
        description: 'Use the discovery feed to decide the next source to read.',
        id: 'next-open-today',
        label: 'Review today\'s recommendations',
        priority: 'primary',
        to: '/today',
      },
    ],
    notices: [
      {
        body: 'Home cockpit data is built on the server from session-derived actor access and shared transport contracts.',
        id: 'server-owned-read-model',
        title: 'Server-owned cockpit',
        tone: 'info',
      },
    ],
    projectReview: {
      emptyState: {
        body: 'Project review and attention items will appear here when visible projects have Project Docs in review, governed jobs needing monitoring, or project Reader collaboration signals.',
        title: 'No project review items yet',
      },
      items: [
        {
          href: '/projects/project-alpha/writing/project-doc-alpha',
          id: 'project-review:project-alpha:project-doc-review:project-doc-alpha',
          kind: 'project-doc-review',
          occurredAt: '2026-05-17T11:15:00.000Z',
          priority: 'review',
          projectId: 'project-alpha',
          projectName: 'Project Alpha',
          sourceId: 'project-doc-alpha',
          sourceLabel: 'Project Doc',
          summary: 'Project Doc is in review · version 2',
          title: 'Project Alpha review draft',
        },
      ],
      summary: {
        collaborationSignals: 0,
        documentsInReview: 1,
        jobsNeedingAttention: 0,
        newestReviewTimestamp: '2026-05-17T11:15:00.000Z',
        projectsWithReviewItems: 1,
        totalReviewItems: 1,
        visibleProjects: 1,
      },
      totalCount: 1,
    },
    recentActivity: [
      {
        context: 'owner · space-alpha',
        href: '/projects/project-alpha',
        id: 'project:project-alpha',
        kind: 'project',
        occurredAt: '2026-05-17T11:00:00.000Z',
        title: 'Project Alpha',
      },
    ],
    sections: [
      {
        description: 'Server-visible spaces and project memberships define collaboration access.',
        id: 'collaboration',
        metrics: [
          { label: 'Visible projects', value: 1 },
          { label: 'Active projects', value: 1 },
          { label: 'Shared spaces', value: 1 },
        ],
        primaryAction: {
          description: 'Review visible project workspaces.',
          id: 'open-projects',
          label: 'Open Projects',
          priority: 'primary',
          to: '/projects',
        },
        status: 'active',
        title: 'Collaboration cockpit',
      },
      {
        description: 'Personal Library entries are ready for reading and project adoption.',
        id: 'library',
        metrics: [{ label: 'Personal sources', value: 2 }],
        primaryAction: {
          description: 'Continue from server-owned personal sources.',
          id: 'open-library',
          label: 'Open Library',
          priority: 'primary',
          to: '/library',
        },
        status: 'active',
        title: 'Literature and reading',
      },
      {
        description: 'Private notebooks and project Writer drafts are available through server document contracts.',
        id: 'writing',
        metrics: [{ label: 'Project drafts', value: 1 }],
        primaryAction: {
          description: 'Return to private synthesis.',
          id: 'open-notebook',
          label: 'Open Notebook',
          priority: 'primary',
          to: '/notebook',
        },
        status: 'active',
        title: 'Writing and versioning',
      },
      {
        description: 'Governed job status is listed from actor-authorized job scopes.',
        id: 'jobs',
        metrics: [{ label: 'Queued or running', value: 1 }],
        primaryAction: {
          description: 'Review governed runtime activity.',
          id: 'open-jobs',
          label: 'Open Jobs',
          priority: 'primary',
          to: '/jobs',
        },
        status: 'attention',
        title: 'Governed jobs',
      },
    ],
    workbench: {
      label: 'Personal workbench',
      route: '/home',
      scope: { id: 'user-alice', type: 'user' },
    },
    ...overrides,
  };
}

type HomeCockpitFetchMode =
  | { type: 'error'; message: string; status?: number }
  | { type: 'success'; cockpit: HomeCockpitResponse };

function renderHomePage(
  mode: HomeCockpitFetchMode = {
    cockpit: createHomeCockpitFixture(),
    type: 'success',
  },
) {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
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
        expect(init?.body).toBeUndefined();

        if (mode.type === 'error') {
          return jsonResponse(
            { error: mode.message },
            mode.status ?? 500,
          );
        }

        return jsonResponse(mode.cockpit);
      }

      throw new Error(`Unexpected fetch: ${requestUrl}`);
    }),
  );

  window.history.replaceState({}, '', '/home');
  render(<App />);
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('home page', () => {
  it('renders the server-owned Home cockpit read model', async () => {
    renderHomePage();

    expect(
      await screen.findByRole('heading', { name: '个人工作台' }),
    ).toBeInTheDocument();
    expect(
      await screen.findByRole('heading', { name: 'Server context' }),
    ).toBeInTheDocument();
    expect(screen.getByText(/Personal workbench/)).toBeInTheDocument();
    expect(screen.getByText(/Actor: Alice/)).toBeInTheDocument();
    expect(screen.getByText('jixia-home-cockpit-contract')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Collaboration cockpit' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Literature and reading' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Writing and versioning' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Governed jobs' })).toBeInTheDocument();
    expect(screen.getByText('Visible projects')).toBeInTheDocument();
    expect(screen.getByText('Project Alpha')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Project review and attention' })).toBeInTheDocument();
    expect(screen.getByText('Project Alpha review draft')).toBeInTheDocument();
    expect(screen.getByText('Documents in review')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Review today\'s recommendations' })).toHaveAttribute('href', '/today');
    expect(screen.getByRole('link', { name: 'Open Jobs' })).toHaveAttribute('href', '/jobs');
    expect(screen.getByRole('heading', { name: 'Server-owned cockpit' })).toBeInTheDocument();
  });

  it('renders deterministic empty-state guidance from an empty server response', async () => {
    renderHomePage(
      {
        cockpit: createHomeCockpitFixture({
          nextActions: [],
          recentActivity: [],
          projectReview: {
            emptyState: {
              body: 'Project review and attention items will appear here when visible projects have Project Docs in review, governed jobs needing monitoring, or project Reader collaboration signals.',
              title: 'No project review items yet',
            },
            items: [],
            summary: {
              collaborationSignals: 0,
              documentsInReview: 0,
              jobsNeedingAttention: 0,
              projectsWithReviewItems: 0,
              totalReviewItems: 0,
              visibleProjects: 0,
            },
            totalCount: 0,
          },
          sections: createHomeCockpitFixture().sections.map((section) => ({
            ...section,
            metrics: section.metrics.map((metric) => ({ ...metric, value: 0 })),
            status: 'empty',
          })),
        }),
        type: 'success',
      },
    );

    expect(
      await screen.findByRole('heading', { name: 'No server activity yet' }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/This is a successful empty Home cockpit response/),
    ).toBeInTheDocument();
    expect(screen.getByText('No server-visible activity is available for this actor yet.')).toBeInTheDocument();
  });

  it('renders an explicit error state without stale cockpit data', async () => {
    renderHomePage({
      message: 'Home cockpit test failure',
      status: 503,
      type: 'error',
    });

    expect(
      await screen.findByRole('heading', { name: 'Unable to load Home cockpit' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Home cockpit test failure')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Retry Home cockpit' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Server context' })).not.toBeInTheDocument();
    expect(screen.queryByText('Project Alpha')).not.toBeInTheDocument();
  });

  it('retries the Home cockpit after an initial server error', async () => {
    const user = userEvent.setup();
    let shouldFailHomeCockpit = true;

    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
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
          expect(init?.body).toBeUndefined();

          if (shouldFailHomeCockpit) {
            shouldFailHomeCockpit = false;
            return jsonResponse({ error: 'temporary Home cockpit failure' }, 503);
          }

          return jsonResponse(createHomeCockpitFixture());
        }

        throw new Error(`Unexpected fetch: ${requestUrl}`);
      }),
    );

    window.history.replaceState({}, '', '/home');
    render(<App />);

    await user.click(
      await screen.findByRole('button', { name: 'Retry Home cockpit' }),
    );

    expect(
      await screen.findByRole('heading', { name: 'Server context' }),
    ).toBeInTheDocument();
    expect(screen.queryByText('temporary Home cockpit failure')).not.toBeInTheDocument();
  });
});
