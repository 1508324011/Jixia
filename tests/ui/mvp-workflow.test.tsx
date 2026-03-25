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
  const sharedComment: {
    authorUserId: string;
    body: string;
    createdAt: string;
    id: string;
    libraryEntryId: string;
    visibility: string;
  } = {
    authorUserId: 'demo-operator',
    body: 'Key mutation note',
    createdAt: '2026-03-22T01:00:00.000Z',
    id: 'note-1',
    libraryEntryId: 'entry-1',
    visibility: 'space_shared',
  };

  const createdNoteResponse = {
    note: {
      authorUserId: 'user-alice',
      body: 'Private notebook body that stays in notebook only.',
      createdAt: '2026-03-24T10:00:00.000Z',
      id: 'note-created-1',
      libraryEntryId: 'entry-1',
      visibility: 'private',
    },
  };

  const projectReferenceResponse = {
    reference: {
      createdAt: '2026-03-24T10:05:00.000Z',
      documentId: 'doc-1',
      id: 'reference-created-1',
      ownerType: 'project',
      paperAssetId: 'asset-pmid-123456',
      projectId: 'tumor-board',
      selectedText: 'Projected notebook-only excerpt',
      sourceKind: 'projection',
      sourceType: 'notebook-note',
    },
  };

  const workbenchSummaryResponse = {
    recentImports: [
      {
        addedAt: '2026-03-24T09:00:00.000Z',
        canonicalId: 'pmid:123456',
        entryId: 'entry-1',
        projectId: 'tumor-board',
        spaceId: 'shared-space',
        title: 'Imported PMID paper 123456',
        to: '/projects/tumor-board/library',
      },
    ],
    recentProjects: [
      {
        activeNotebookCount: 1,
        entryCount: 1,
        projectId: 'tumor-board',
        recentActivity: 'Notebook updated 2h ago',
        spaceId: 'shared-space',
        title: 'Tumor board workspace',
      },
    ],
    resumeTargets: [
      {
        description: 'Return to the active tumor board synthesis notebook.',
        kind: 'notebook',
        title: 'Resume notebook',
        to: '/projects/tumor-board/library/entry-1/notes',
      },
    ],
  };

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
        abstractText: 'Imported PMID metadata for 123456',
        addedAt: '2026-03-22T00:00:00.000Z',
        canonicalId: 'pmid:123456',
        createdAt: '2026-03-22T00:00:00.000Z',
        entryId: 'entry-1',
        paperAssetId: 'asset-pmid-123456',
        sourceLabel: 'PubMed',
        sourceType: 'pmid',
        spaceId: 'shared-space',
        title: 'Imported PMID paper 123456',
        visibility: 'space_shared',
      },
    ],
  };

  const emptyNotebookNotes: Array<typeof createdNoteResponse.note> = [];

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
      sharedComment,
    ],
    workspace: {
      companion: {
        notebookPath: '/projects/tumor-board/library/entry-1/notes',
        projectDocsPath: '/projects/tumor-board/writing/doc-1',
        projectPath: '/projects/tumor-board',
        readerPath: '/projects/tumor-board/library/entry-1/reader',
      },
      notebookId: 'notebook-1',
      privateNotes: emptyNotebookNotes,
      questions: [
        {
          id: 'question-1',
          prompt: 'What changes my interpretation of this paper?',
          status: 'open',
        },
        {
          id: 'question-2',
          prompt: 'What would I quote into a project update?',
          status: 'open',
        },
      ],
      sharedComments: [sharedComment],
    },
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
      references: [
        {
          createdAt: '2026-03-22T01:08:00.000Z',
          documentId: 'doc-1',
          id: 'reference-1',
          ownerType: 'project',
          paperAssetId: 'asset-pmid-123456',
          projectId: 'tumor-board',
          selectedText: 'Projected tumor-board excerpt',
          sourceKind: 'projection',
          sourceType: 'notebook-note',
        },
      ],
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

  let currentReadingResponse = structuredClone(readingResponse);
  let currentWritingResponse = structuredClone(writingResponse);

  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const requestMethod =
        typeof input === 'string' || input instanceof URL
          ? (init?.method?.toUpperCase() ?? 'GET')
          : input.method.toUpperCase();
      const requestUrl =
        typeof input === 'string'
          ? input
          : input instanceof URL
            ? input.toString()
            : input.url;

      if (requestUrl.endsWith('/api/spaces')) {
        return jsonResponse(spacesResponse);
      }

      if (requestUrl.endsWith('/api/workbench/summary')) {
        return jsonResponse(workbenchSummaryResponse);
      }

      if (requestUrl.endsWith('/api/spaces/shared-space/projects/tumor-board/library')) {
        return jsonResponse(libraryResponse);
      }

      if (requestUrl.endsWith('/api/reading/entry-1')) {
        return jsonResponse(currentReadingResponse);
      }

      if (requestUrl.endsWith('/api/reading/entry-1?spaceId=shared-space')) {
        return jsonResponse(currentReadingResponse);
      }

      if (requestMethod === 'POST' && requestUrl.endsWith('/api/reading/entry-1/notes')) {
        currentReadingResponse = {
          ...currentReadingResponse,
          notes: [...currentReadingResponse.notes, createdNoteResponse.note],
          workspace: {
            ...currentReadingResponse.workspace,
            privateNotes: [
              ...currentReadingResponse.workspace.privateNotes,
              createdNoteResponse.note,
            ],
          },
        };
        return jsonResponse(createdNoteResponse);
      }

      if (
        requestMethod === 'POST' &&
        requestUrl.endsWith('/api/projects/tumor-board/docs/doc-1/references')
      ) {
        currentWritingResponse = {
          ...currentWritingResponse,
          document: {
            ...currentWritingResponse.document,
            references: [
              ...currentWritingResponse.document.references,
              projectReferenceResponse.reference,
            ],
          },
        };
        return jsonResponse(projectReferenceResponse);
      }

      if (requestUrl.endsWith('/api/writing/shared-space/projects/tumor-board/document')) {
        return jsonResponse(currentWritingResponse);
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
  it('navigates from home to project notebook reader and project docs', async () => {
    const user = userEvent.setup();

    window.history.replaceState({}, '', '/home');
    stubNativeDemoFetch();

    render(<App />);

    expect(screen.getByRole('heading', { name: 'Research workbench' })).toBeInTheDocument();

    await user.click(
      await screen.findByRole('link', { name: /open tumor board workspace/i }),
    );

    expect(await screen.findByRole('link', { name: 'Open active notebook' })).toBeInTheDocument();

    await user.click(screen.getByRole('link', { name: 'Open active notebook' }));

    expect(await screen.findByRole('heading', { name: 'Notes workspace' })).toBeInTheDocument();
    expect(screen.getByText('Notebook questions')).toBeInTheDocument();

    await user.type(
      screen.getByRole('textbox', {
        name: /private note for/i,
      }),
      'Private notebook body that stays in notebook only.',
    );
    await user.click(screen.getByRole('button', { name: 'Save private note' }));
    expect(
      await screen.findByText('Private notebook body that stays in notebook only.'),
    ).toBeInTheDocument();

    await user.click(screen.getByRole('link', { name: 'Back to reader' }));

    expect(await screen.findByRole('heading', { name: 'Reader' })).toBeInTheDocument();
    expect(
      screen.getByRole('heading', { name: 'Evidence companion' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Back to notebook' })).toHaveAttribute(
      'href',
      '/projects/tumor-board/library/entry-1/notes',
    );

    await user.click(screen.getByRole('link', { name: 'Back to notebook' }));

    expect(await screen.findByRole('heading', { name: 'Notes workspace' })).toBeInTheDocument();
    expect(
      await screen.findByText('Private notebook body that stays in notebook only.'),
    ).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Insert into project docs' }));
    expect(await screen.findByText('Project-owned reference created.')).toBeInTheDocument();

    await user.click(screen.getByRole('link', { name: 'Open project docs' }));

    expect(await screen.findByRole('heading', { name: 'Project docs' })).toBeInTheDocument();
    expect(
      screen.getByRole('heading', {
        name: 'References, publish state, and governed jobs',
      }),
    ).toBeInTheDocument();
    expect(await screen.findByText('Reference rail')).toBeInTheDocument();
    expect(screen.getByText('Projected notebook-only excerpt')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Project overview' })).toHaveAttribute(
      'href',
      '/projects/tumor-board',
    );
  });

  it('shares scholarly shell primitives across pages', async () => {
    const user = userEvent.setup();

    window.history.replaceState({}, '', '/home');
    stubNativeDemoFetch();

    render(<App />);

    expect(screen.getByTestId('app-shell')).toHaveClass('app-shell');
    expect(screen.getByRole('heading', { name: 'Research workbench' })).toHaveClass('page-title');

    await user.click(
      await screen.findByRole('link', { name: /open tumor board workspace/i }),
    );

    expect(screen.getByRole('heading', { name: 'Project docs' })).toHaveClass('panel-title');
    await user.click(screen.getByRole('link', { name: 'Open active notebook' }));
    expect(screen.getByLabelText('context bar')).toHaveClass('context-bar');
    expect(screen.getByLabelText('context bar')).toHaveTextContent('Space context · shared-space');
  });

  it('surfaces governance cues across library, reader, and project docs', async () => {
    const user = userEvent.setup();

    window.history.replaceState({}, '', '/projects/tumor-board/library');
    stubNativeDemoFetch();

    render(<App />);

    expect(
      await screen.findByText('Context · Tumor Board Shared Space / tumor-board'),
    ).toBeInTheDocument();
    expect(screen.getByText('Visibility')).toBeInTheDocument();
    expect(screen.getAllByText('space_shared')[0]).toBeInTheDocument();

      await user.click(screen.getByRole('link', { name: 'Open reader' }));

      expect(await screen.findByText('AI evidence companion')).toBeInTheDocument();
      expect(screen.getByText('Evidence-backed summary for board prep.')).toBeInTheDocument();
      await user.click(screen.getByRole('tab', { name: '关键信息' }));
      expect(screen.getByText('Retrieval state')).toBeInTheDocument();
      expect(screen.getByText('Full text available · No')).toBeInTheDocument();

      await user.click(screen.getByRole('tab', { name: '共享评论' }));
    expect(screen.getByText('Key mutation note')).toBeInTheDocument();

    await user.click(screen.getByRole('link', { name: 'Open project docs' }));

    expect(await screen.findByText('Publish state path')).toBeInTheDocument();
    expect(screen.getByText('draft · review · published')).toBeInTheDocument();
    expect(screen.getByText('Reference rail')).toBeInTheDocument();
    expect(screen.getByText('Projected tumor-board excerpt')).toBeInTheDocument();
    expect(screen.getByText('Event timeline')).toBeInTheDocument();
    expect(screen.getByText('Audit trail')).toBeInTheDocument();
    expect(screen.getByText('job.created')).toBeInTheDocument();
    expect(screen.getByText('job.completed')).toBeInTheDocument();
  });

  it('supports direct reader deep links with project and entry context', async () => {
    window.history.replaceState(
      {},
      '',
      '/projects/tumor-board/library/entry-1/reader',
    );
    stubNativeDemoFetch();

    render(<App />);

    expect(await screen.findByRole('heading', { name: 'Reader' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Evidence companion' })).toBeInTheDocument();
    expect(screen.getByLabelText('context bar')).toHaveTextContent(
      'Project context · tumor-board',
    );
    expect(screen.getByLabelText('context bar')).toHaveTextContent('Entry · entry-1');
  });

  it('supports direct library deep links with space and project context', async () => {
    window.history.replaceState(
      {},
      '',
      '/projects/tumor-board/library',
    );
    stubNativeDemoFetch();

    render(<App />);

    expect(await screen.findByRole('heading', { name: 'Library' })).toBeInTheDocument();
    expect(
      await screen.findByText('Context · Tumor Board Shared Space / tumor-board'),
    ).toBeInTheDocument();
    expect(screen.getByLabelText('context bar')).toHaveTextContent(
      'Context · Tumor Board Shared Space / tumor-board',
    );
    expect(screen.getByText('Project · tumor-board')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Open reader' })).toBeInTheDocument();
  });

  it('supports direct project-doc deep links with project and doc context', async () => {
    window.history.replaceState(
      {},
      '',
      '/projects/tumor-board/writing/doc-1',
    );
    stubNativeDemoFetch();

    render(<App />);

    expect(await screen.findByRole('heading', { name: 'Project docs' })).toBeInTheDocument();
    expect(screen.getByLabelText('context bar')).toHaveTextContent(
      'Space context · shared-space',
    );
    expect(screen.getByLabelText('context bar')).toHaveTextContent(
      'Project context · tumor-board · doc-1',
    );
    expect(
      await screen.findByRole('heading', { name: 'References, publish state, and governed jobs' }),
    ).toBeInTheDocument();
    expect(screen.getByText('draft · review · published')).toBeInTheDocument();
    expect(
      screen.getByRole('button', { name: 'Run governed summary' }),
      ).toBeInTheDocument();
  });
});
