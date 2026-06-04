import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { HomeCockpitResponse } from '../../src/shared/contracts/home-cockpit';
import type { TodayContinuationResponse } from '../../src/shared/contracts/today-continuation';
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

function createTodayContinuationFixture(
  overrides: Partial<TodayContinuationResponse> = {},
): TodayContinuationResponse {
  return {
    contract: 'jixia.today.continuation.v1',
    emptyState: {
      body: 'No personal reading, imports, Notebook drafts, visible project review items, or governed AI jobs need action right now.',
      href: '/search',
      title: 'No continuation items for today',
    },
    generatedAt: '2026-06-04T12:00:00.000Z',
    nextActions: [
      {
        description: 'Reading progress 64% · continue from the personal Reader.',
        href: '/library/entry-alpha/reader',
        id: 'action:reader:entry-alpha',
        label: 'Continue reading',
        priority: 'high',
        reason: 'pmid:111111 · Home continuation paper',
        source: 'reader',
      },
      {
        description: 'Governed personal job status · queued',
        href: '/jobs?jobId=job-alpha',
        id: 'action:ai-job:job-alpha',
        label: 'Check AI job',
        priority: 'medium',
        reason: 'Personal AI job · today.personal.summary',
        source: 'ai_job',
      },
    ],
    sections: [
      {
        description: 'Personal Library entries where this actor has meaningful incomplete reading progress.',
        emptyState: {
          body: 'Personal Library entries with meaningful saved reading progress will appear here.',
          href: '/library',
          title: 'No in-progress readings',
        },
        items: [
          {
            href: '/library/entry-alpha/reader',
            id: 'reader:entry-alpha',
            kind: 'in_progress_reading',
            priority: 'high',
            sourceLabel: 'pmid:111111',
            summary: 'Reading progress 64% · continue from the personal Reader.',
            timestamp: '2026-06-04T11:30:00.000Z',
            title: 'Home continuation paper',
          },
        ],
        kind: 'in_progress_reading',
        title: 'Continue reading',
        totalCount: 1,
      },
      {
        description: 'Personal Library entries that are imported but have no meaningful reading progress yet.',
        emptyState: {
          body: 'Recently imported personal Library entries without meaningful reading progress will appear here as continuation hints.',
          href: '/library',
          title: 'No unread personal imports',
        },
        items: [],
        kind: 'new_imports',
        title: 'New imports to triage',
        totalCount: 0,
      },
      {
        description: 'Owner-scoped private Notebook documents that can be resumed without exposing note bodies.',
        emptyState: {
          body: 'Private Notebook documents owned by this actor will appear here as conservative synthesis continuation hints.',
          href: '/notebook',
          title: 'No private Notebook drafts',
        },
        items: [],
        kind: 'notebook_drafts',
        title: 'Private Notebook drafts',
        totalCount: 0,
      },
      {
        description: 'Project workspace review and attention items from projects visible to this actor.',
        emptyState: {
          body: 'Review items from projects visible through persisted project membership will appear here.',
          href: '/projects',
          title: 'No visible project review items',
        },
        items: [],
        kind: 'project_review',
        title: 'Visible project review',
        totalCount: 0,
      },
      {
        description: 'Server-classified governed job statuses for personal and visible project scopes.',
        emptyState: {
          body: 'Governed jobs that are failed, queued, or running will appear here with links to the Jobs or AI Workspace surfaces.',
          href: '/ai-workspace',
          title: 'No AI jobs need action',
        },
        items: [
          {
            href: '/jobs?jobId=job-alpha',
            id: 'ai-job:job-alpha',
            kind: 'ai_jobs',
            priority: 'medium',
            sourceLabel: 'Personal AI job',
            summary: 'Governed personal job status · queued',
            timestamp: '2026-06-04T11:00:00.000Z',
            title: 'today.personal.summary',
          },
        ],
        kind: 'ai_jobs',
        title: 'Governed AI jobs needing action',
        totalCount: 1,
      },
    ],
    summary: {
      aiJobsNeedingAction: 1,
      inProgressReadings: 1,
      notebookDrafts: 0,
      projectReviewItems: 0,
      unreadImports: 0,
    },
    ...overrides,
  };
}

type HomeCockpitFetchMode =
  | { type: 'error'; message: string; status?: number }
  | { type: 'success'; cockpit: HomeCockpitResponse };

type HomeContinuationFetchMode =
  | { type: 'error'; message: string; status?: number }
  | { type: 'success'; continuation: TodayContinuationResponse };

function renderHomePage(
  mode: HomeCockpitFetchMode = {
    cockpit: createHomeCockpitFixture(),
    type: 'success',
  },
  continuationMode: HomeContinuationFetchMode = {
    continuation: createTodayContinuationFixture(),
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

      if (requestUrl.endsWith('/api/today/continuation')) {
        expect(init?.body).toBeUndefined();
        expect(init?.credentials).toBe('same-origin');
        const url = new URL(requestUrl);
        for (const fieldName of [
          'actorUserId',
          'requestedByUserId',
          'userId',
          'authorUserId',
          'startedByUserId',
          'actorSpaceId',
          'createdByUserId',
          'ownerId',
          'projectId',
          'scope',
          'scopeType',
          'scopeId',
          'spaceId',
          'visibility',
        ]) {
          expect(url.searchParams.get(fieldName)).toBeNull();
        }

        if (continuationMode.type === 'error') {
          return jsonResponse(
            { error: continuationMode.message },
            continuationMode.status ?? 500,
          );
        }

        return jsonResponse(continuationMode.continuation);
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
    expect(screen.getByRole('heading', { name: 'Today continuation' })).toBeInTheDocument();
    expect(screen.getByText('jixia.today.continuation.v1')).toBeInTheDocument();
    expect(screen.getByText('Readings')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Continue reading' })).toHaveAttribute('href', '/library/entry-alpha/reader');
    expect(screen.getByText('pmid:111111 · Home continuation paper')).toBeInTheDocument();
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
      {
        continuation: createTodayContinuationFixture({
          nextActions: [],
          sections: createTodayContinuationFixture().sections.map((section) => ({
            ...section,
            items: [],
            totalCount: 0,
          })),
          summary: {
            aiJobsNeedingAction: 0,
            inProgressReadings: 0,
            notebookDrafts: 0,
            projectReviewItems: 0,
            unreadImports: 0,
          },
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
    expect(screen.getByRole('heading', { name: 'No continuation items for today' })).toBeInTheDocument();
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

        if (requestUrl.endsWith('/api/today/continuation')) {
          expect(init?.body).toBeUndefined();
          return jsonResponse(createTodayContinuationFixture());
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
