import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { App } from '../../src/web/app';

function jsonResponse(payload: unknown): Response {
  return new Response(JSON.stringify(payload), {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
    },
    status: 200,
  });
}

function stubNativeDemoFetch(): void {
  const spacesResponse = {
    spaces: [
      {
        importLocator: 'pmid:123456',
        kind: 'shared',
        name: 'Tumor Board Shared Space',
        projectId: 'tumor-board',
        spaceId: 'shared-space',
        visibility: 'space_shared',
      },
    ],
  };

  const libraryResponse = {
    entries: [
      {
        canonicalId: 'pmid:123456',
        entryId: 'entry-1',
        title: 'Imported PMID paper 123456',
        visibility: 'space_shared',
      },
    ],
  };

  const readingResponse = {
    asset: {
      abstractText: 'Imported PMID metadata for 123456',
      canonicalId: 'pmid:123456',
      id: 'asset-pmid-123456',
      title: 'Imported PMID paper 123456',
    },
    entry: {
      id: 'entry-1',
      visibility: 'space_shared',
    },
    insights: [
      {
        conversationId: 'conversation-1',
        createdAt: '2026-03-22T01:05:00.000Z',
        evidenceSpans: [],
        id: 'insight-1',
        libraryEntryId: 'entry-1',
        summary: 'Evidence-backed summary for board prep.',
      },
    ],
    notes: [
      {
        authorUserId: 'demo-operator',
        body: 'Key mutation note',
        createdAt: '2026-03-22T01:00:00.000Z',
        id: 'note-1',
        libraryEntryId: 'entry-1',
        visibility: 'space_shared',
      },
    ],
  };

  const writingResponse = {
    document: {
      documentId: 'doc-1',
      latestSnapshot: {
        capturedAt: '2026-03-22T01:10:00.000Z',
        citations: [],
        content: 'Initial seeded paragraph.',
      },
      publishState: 'review',
      title: 'Tumor board synthesis',
    },
  };

  const governedSummaryResponse = {
    governedJob: {
      audits: [
        {
          action: 'job.created',
          detail: 'Governed summary job created for shared-space.',
          id: 'audit-1',
        },
        {
          action: 'job.completed',
          detail: 'Governed summary job completed successfully.',
          id: 'audit-2',
        },
      ],
      events: [
        {
          id: 'event-1',
          message: 'Queued governed summary for shared tumor board.',
          status: 'queued',
        },
        {
          id: 'event-2',
          message: 'Running governed summary for shared tumor board.',
          status: 'running',
        },
        {
          id: 'event-3',
          message: 'Governed summary completed for shared tumor board.',
          status: 'succeeded',
        },
      ],
      job: {
        id: 'job-1',
        status: 'succeeded',
      },
    },
  };

  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string | URL | Request) => {
      const requestUrl =
        typeof input === 'string'
          ? input
          : input instanceof URL
            ? input.toString()
            : input.url;

      if (requestUrl.endsWith('/api/spaces')) {
        return jsonResponse(spacesResponse);
      }

      if (requestUrl.endsWith('/api/spaces/shared-space/projects/tumor-board/library')) {
        return jsonResponse(libraryResponse);
      }

      if (requestUrl.endsWith('/api/reading/entry-1')) {
        return jsonResponse(readingResponse);
      }

      if (requestUrl.endsWith('/api/writing/shared-space/projects/tumor-board/document')) {
        return jsonResponse(writingResponse);
      }

      if (requestUrl.endsWith('/api/spaces/shared-space/governed-summary')) {
        return jsonResponse(governedSummaryResponse);
      }

      throw new Error(`Unexpected fetch: ${requestUrl}`);
    }),
  );
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('mvp workflow shell', () => {
  it('navigates from spaces to library, reader, and writing', async () => {
    const user = userEvent.setup();

    window.history.replaceState({}, '', '/spaces');
    stubNativeDemoFetch();

    render(<App />);

    expect(
      screen.getByRole('heading', { name: 'Spaces' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Space → Project → Entry → Doc')).toBeInTheDocument();

    await user.click(
      await screen.findByRole('link', { name: 'Enter shared space' }),
    );

    expect(
      await screen.findByRole('heading', { name: 'Library' }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText('context bar')).toHaveTextContent(
      'Context · Tumor Board Shared Space / tumor-board',
    );
    expect(screen.getByLabelText('context bar')).toHaveTextContent(
      'space_shared',
    );
    expect(screen.getByLabelText('context bar')).toHaveTextContent(
      'pmid:123456',
    );
    expect(screen.getByText('Project · tumor-board')).toBeInTheDocument();
    expect(screen.getByText('Imported PMID paper 123456')).toBeInTheDocument();
    expect(screen.queryByText('Loading state placeholder')).not.toBeInTheDocument();
    expect(screen.queryByText('Empty shelf placeholder')).not.toBeInTheDocument();

    await user.click(screen.getByRole('link', { name: 'Open reader' }));

    expect(await screen.findByRole('heading', { name: 'Reader' })).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: 'Evidence workspace' }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText('context bar')).toHaveTextContent(
      'Space context · shared-space',
    );
    expect(screen.getByLabelText('context bar')).toHaveTextContent(
      'Project context · tumor-board',
    );
    expect(screen.getByLabelText('context bar')).toHaveTextContent(
      'Entry · entry-1',
    );

    await user.click(screen.getByRole('link', { name: 'Open writing' }));

    expect(await screen.findByRole('heading', { name: 'Writing' })).toBeInTheDocument();
    expect(
      screen.getByRole('heading', {
        name: 'Versions, references, and governed jobs',
      }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText('context bar')).toHaveTextContent(
      'Space context · shared-space',
    );
    expect(screen.getByLabelText('context bar')).toHaveTextContent(
      'Project context · tumor-board · doc-1',
    );
  });

  it('shares scholarly shell primitives across pages', async () => {
    const user = userEvent.setup();

    window.history.replaceState({}, '', '/spaces');
    stubNativeDemoFetch();

    render(<App />);

    expect(screen.getByTestId('app-shell')).toHaveClass('app-shell');
    expect(screen.getByRole('heading', { name: 'Spaces' })).toHaveClass('page-title');

    await user.click(
      await screen.findByRole('link', { name: 'Enter shared space' }),
    );

    expect(screen.getByLabelText('context bar')).toHaveClass('context-bar');
    expect(
      screen.getByRole('heading', { name: 'Imported PMID paper 123456' }),
    ).toHaveClass('panel-title');
    expect(screen.getAllByText('space_shared')[0]).toHaveClass('status-badge');
  });

  it('surfaces governance cues across library, reader, and writing', async () => {
    const user = userEvent.setup();

    window.history.replaceState({}, '', '/spaces');
    stubNativeDemoFetch();

    render(<App />);

    await user.click(
      await screen.findByRole('link', { name: 'Enter shared space' }),
    );

    expect(
      await screen.findByText('Shared context · Tumor Board Shared Space'),
    ).toBeInTheDocument();
    expect(screen.getByText('Visibility · space_shared')).toBeInTheDocument();

    await user.click(screen.getByRole('link', { name: 'Open reader' }));

    expect(
      await screen.findByText('Governed action source · queued → running → succeeded'),
    ).toBeInTheDocument();
    expect(screen.getByText('Latest governed finale')).toBeInTheDocument();
    expect(screen.getByText('Key mutation note')).toBeInTheDocument();

    await user.click(screen.getByRole('link', { name: 'Open writing' }));

    expect(await screen.findByText('Publish state path')).toBeInTheDocument();
    expect(screen.getByText('draft · review · published')).toBeInTheDocument();
    expect(screen.getByText('Event timeline')).toBeInTheDocument();
    expect(screen.getByText('Audit trail')).toBeInTheDocument();
    expect(screen.getByText('job.created')).toBeInTheDocument();
    expect(screen.getByText('job.completed')).toBeInTheDocument();
  });

  it('supports direct reader deep links with project and entry context', async () => {
    window.history.replaceState(
      {},
      '',
      '/spaces/shared-space/projects/tumor-board/library/entry-1/reader',
    );
    stubNativeDemoFetch();

    render(<App />);

    expect(await screen.findByRole('heading', { name: 'Reader' })).toBeInTheDocument();
    expect(screen.getByLabelText('context bar')).toHaveTextContent(
      'Space context · shared-space',
    );
    expect(screen.getByLabelText('context bar')).toHaveTextContent(
      'Project context · tumor-board',
    );
    expect(screen.getByLabelText('context bar')).toHaveTextContent('Entry · entry-1');
    expect(screen.getByText('Imported PMID paper 123456')).toBeInTheDocument();
  });

  it('supports direct library deep links with space and project context', async () => {
    window.history.replaceState(
      {},
      '',
      '/spaces/shared-space/projects/tumor-board/library',
    );
    stubNativeDemoFetch();

    render(<App />);

    expect(await screen.findByRole('heading', { name: 'Library' })).toBeInTheDocument();
    expect(screen.getByLabelText('context bar')).toHaveTextContent(
      'Context · Tumor Board Shared Space / tumor-board',
    );
    expect(screen.getByText('Project · tumor-board')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Open reader' })).toBeInTheDocument();
  });

  it('supports direct writing deep links with project and doc context', async () => {
    window.history.replaceState(
      {},
      '',
      '/spaces/shared-space/projects/tumor-board/writing/doc-1',
    );
    stubNativeDemoFetch();

    render(<App />);

    expect(await screen.findByRole('heading', { name: 'Writing' })).toBeInTheDocument();
    expect(screen.getByLabelText('context bar')).toHaveTextContent(
      'Space context · shared-space',
    );
    expect(screen.getByLabelText('context bar')).toHaveTextContent(
      'Project context · tumor-board · doc-1',
    );
    expect(screen.getByText('draft · review · published')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Run governed summary' }),
    ).toBeInTheDocument();
  });
});
