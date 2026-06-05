import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter } from 'react-router-dom';

import type { TodayRecommendation } from '../../src/shared/contracts/discovery';
import type { TodayContinuationResponse } from '../../src/shared/contracts/today-continuation';
import { TodayPage } from '../../src/web/pages/today-page';

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
    },
    status,
  });
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
        reason: 'pmid:111111 · Today continuation paper',
        source: 'reader',
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
            title: 'Today continuation paper',
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
            description: 'Project review and attention items from projects visible to this actor.',
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

function createRecommendationFixture(
  overrides: Partial<TodayRecommendation> = {},
): TodayRecommendation {
  return {
    canonicalId: 'pmid:654321',
    id: 'recommendation-alpha',
    imported: false,
    reason: 'PubMed result for today\'s continuation queue.',
    sourceLabel: 'PubMed',
    sourceLocator: '654321',
    sourceType: 'pmid',
    title: 'Discovery recommendation to import',
    ...overrides,
  };
}

function renderTodayPage() {
  render(
    <MemoryRouter initialEntries={['/today']}>
      <TodayPage />
    </MemoryRouter>,
  );
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('today page continuation read model', () => {
  it('renders server-classified continuation before recommendations and preserves personal import payloads', async () => {
    const user = userEvent.setup();
    const recommendation = createRecommendationFixture();
    let importBody: unknown;

    const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const requestUrl =
        typeof input === 'string'
          ? input
          : input instanceof URL
            ? input.toString()
            : input.url;

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

        return jsonResponse(createTodayContinuationFixture());
      }

      if (requestUrl.endsWith('/api/discovery/today')) {
        return jsonResponse({ items: [recommendation] });
      }

      if (requestUrl.endsWith('/api/library/personal/import') && init?.method === 'POST') {
        importBody = JSON.parse(String(init.body));
        expect(importBody).toEqual({
          sourceLocator: recommendation.sourceLocator,
          sourceType: recommendation.sourceType,
        });

        return jsonResponse({
          asset: {
            canonicalId: recommendation.canonicalId,
            id: 'asset-alpha',
            title: recommendation.title,
          },
          entry: {
            id: 'entry-imported',
            paperAssetId: 'asset-alpha',
            visibility: 'private',
          },
        }, 201);
      }

      throw new Error(`Unexpected fetch: ${requestUrl}`);
    });

    vi.stubGlobal('fetch', fetchMock);
    renderTodayPage();

    const continuationHeading = await screen.findByRole('heading', { name: 'Continue today' });
    const recommendationsHeading = await screen.findByRole('heading', { name: 'Discovery recommendations' });
    expect(
      continuationHeading.compareDocumentPosition(recommendationsHeading) & Node.DOCUMENT_POSITION_FOLLOWING,
    ).toBeTruthy();
    expect(screen.getByText('jixia.today.continuation.v1')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Top continuation actions' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Continue reading' })).toHaveAttribute(
      'href',
      '/library/entry-alpha/reader',
    );
    expect(screen.getByRole('heading', { name: 'Today continuation paper' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Discovery recommendation to import' })).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: '导入到个人 Library' }));

    expect(await screen.findByText('Imported into personal library')).toBeInTheDocument();
    expect(importBody).toEqual({ sourceLocator: '654321', sourceType: 'pmid' });
  });

  it('renders deterministic empty continuation and empty recommendation states', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string | URL | Request) => {
        const requestUrl =
          typeof input === 'string'
            ? input
            : input instanceof URL
              ? input.toString()
              : input.url;

        if (requestUrl.endsWith('/api/today/continuation')) {
          const fixture = createTodayContinuationFixture();
          return jsonResponse({
            ...fixture,
            nextActions: [],
            sections: fixture.sections.map((section) => ({
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
          });
        }

        if (requestUrl.endsWith('/api/discovery/today')) {
          return jsonResponse({ items: [] });
        }

        throw new Error(`Unexpected fetch: ${requestUrl}`);
      }),
    );

    renderTodayPage();

    expect(await screen.findByRole('heading', { name: 'No continuation items for today' })).toBeInTheDocument();
    expect(screen.getByText(/No personal reading, imports, Notebook drafts/)).toBeInTheDocument();
    expect(await screen.findByText('No recommendations available right now.')).toBeInTheDocument();
  });

  it('shows continuation errors without breaking discovery recommendations', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string | URL | Request) => {
        const requestUrl =
          typeof input === 'string'
            ? input
            : input instanceof URL
              ? input.toString()
              : input.url;

        if (requestUrl.endsWith('/api/today/continuation')) {
          return jsonResponse({ error: 'Continuation test failure' }, 503);
        }

        if (requestUrl.endsWith('/api/discovery/today')) {
          return jsonResponse({ items: [createRecommendationFixture()] });
        }

        throw new Error(`Unexpected fetch: ${requestUrl}`);
      }),
    );

    renderTodayPage();

    expect(await screen.findByRole('heading', { name: 'Unable to load today continuation' })).toBeInTheDocument();
    expect(screen.getByText('Continuation test failure')).toBeInTheDocument();
    expect(await screen.findByRole('heading', { name: 'Discovery recommendation to import' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Discovery recommendations' })).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.queryByRole('heading', { name: 'Continue today' })).not.toBeInTheDocument();
    });
  });
});
