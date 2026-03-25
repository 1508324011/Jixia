import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { App } from '../../src/web/app';

function renderWorkbench(pathname: string) {
  window.history.replaceState({}, '', pathname);
  render(<App />);
}

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

describe('paper workspace', () => {
  it('keeps deep reading, private notes, and project docs on separate surfaces', async () => {
    const user = userEvent.setup();
    const readingDetail = {
      asset: {
        abstractText: 'Imported PMID metadata for 654321',
        canonicalId: 'pmid:654321',
        createdAt: '2026-03-23T00:00:00.000Z',
        id: 'asset-1',
        title: 'Tumor board biomarkers for rapid review',
      },
      entry: {
        addedAt: '2026-03-23T00:00:00.000Z',
        id: 'entry-1',
        paperAssetId: 'asset-1',
        spaceId: 'personal-space-user-alice',
        visibility: 'private',
      },
      insights: [] as Array<{
        conversationId: string;
        createdAt: string;
        evidenceSpans: Array<{ endOffset: number; paperAssetId: string; quote: string; startOffset: number }>;
        id: string;
        libraryEntryId: string;
        summary: string;
      }>,
      notes: [
        {
          authorUserId: 'user-alice',
          body: 'Private note for later synthesis.',
          createdAt: '2026-03-23T00:05:00.000Z',
          id: 'note-private-1',
          libraryEntryId: 'entry-1',
          visibility: 'private',
        },
        {
          authorUserId: 'user-alice',
          body: 'Project-visible comment for the tumor board.',
          createdAt: '2026-03-23T00:07:00.000Z',
          id: 'note-shared-1',
          libraryEntryId: 'entry-1',
          visibility: 'space_shared',
        },
      ],
      retrieval: {
        detail: 'Abstract metadata is ready for review, but full text stays outside this demo.',
        fullTextAvailable: false,
        state: 'metadata-only',
        summary: 'Metadata imported',
      },
      workspace: {
        companion: {
          notebookPath: '/projects/project-1/library/entry-1/notes',
          projectDocsPath: '/projects/project-1/writing/doc-1',
          projectPath: '/projects/project-1',
          readerPath: '/projects/project-1/library/entry-1/reader',
        },
        notebookId: 'notebook-1',
        privateNotes: [
          {
            authorUserId: 'user-alice',
            body: 'Private note for later synthesis.',
            createdAt: '2026-03-23T00:05:00.000Z',
            id: 'note-private-1',
            libraryEntryId: 'entry-1',
            visibility: 'private',
          },
        ],
        questions: [
          {
            id: 'question-1',
            prompt: 'What changes my interpretation of this paper?',
          },
          {
            id: 'question-2',
            prompt: 'Which claim deserves a project-level reference?',
          },
        ],
        sharedComments: [
          {
            authorUserId: 'user-alice',
            body: 'Project-visible comment for the tumor board.',
            createdAt: '2026-03-23T00:07:00.000Z',
            id: 'note-shared-1',
            libraryEntryId: 'entry-1',
            visibility: 'space_shared',
          },
        ],
      },
    };

    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
        const requestUrl =
          typeof input === 'string'
            ? input
            : input instanceof URL
              ? input.toString()
              : input.url;

        if (requestUrl.endsWith('/api/reading/entry-1') && (!init?.method || init.method === 'GET')) {
          return jsonResponse(readingDetail);
        }

        throw new Error(`Unexpected fetch: ${requestUrl}`);
      }),
    );

    renderWorkbench('/projects/project-1/library/entry-1/reader');

    expect(await screen.findByText('Tumor board biomarkers for rapid review')).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'AI 对话' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: '私人笔记' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: '共享评论' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: '关键信息' })).toBeInTheDocument();

    expect(screen.queryByRole('button', { name: 'Promote latest insight to Writer' })).not.toBeInTheDocument();
    expect(screen.queryByRole('textbox', { name: 'Private note' })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Back to notebook' })).toHaveAttribute(
      'href',
      '/projects/project-1/library/entry-1/notes',
    );
    expect(screen.getByRole('link', { name: 'Back to project' })).toHaveAttribute(
      'href',
      '/projects/project-1',
    );
    expect(screen.getByRole('link', { name: 'Open notes workspace' })).toHaveAttribute(
      'href',
      '/projects/project-1/library/entry-1/notes',
    );
    expect(screen.getByRole('link', { name: 'Open project docs' })).toHaveAttribute(
      'href',
      '/projects/project-1/writing/doc-1',
    );

    await user.click(screen.getByRole('tab', { name: '关键信息' }));
    expect(screen.getByText('Retrieval state')).toBeInTheDocument();
    expect(screen.getByText('Metadata imported')).toBeInTheDocument();
    expect(
      screen.getByText('Abstract metadata is ready for review, but full text stays outside this demo.'),
    ).toBeInTheDocument();

    await user.click(screen.getByRole('tab', { name: '私人笔记' }));
    expect(screen.getByText('Private note for later synthesis.')).toBeInTheDocument();

    await user.click(screen.getByRole('tab', { name: '共享评论' }));
    expect(screen.getByText('Project-visible comment for the tumor board.')).toBeInTheDocument();
  });

  it('uses personal reader context and notes routes when opened from the personal library', async () => {
    const readingDetail = {
      asset: {
        abstractText: 'Imported PMID metadata for 111111',
        canonicalId: 'pmid:111111',
        createdAt: '2026-03-23T00:00:00.000Z',
        id: 'asset-personal-1',
        title: 'Personal evidence note',
      },
      entry: {
        addedAt: '2026-03-23T00:00:00.000Z',
        id: 'entry-1',
        paperAssetId: 'asset-personal-1',
        spaceId: 'personal-space-user-alice',
        visibility: 'private',
      },
      insights: [] as Array<{
        conversationId: string;
        createdAt: string;
        evidenceSpans: Array<{ endOffset: number; paperAssetId: string; quote: string; startOffset: number }>;
        id: string;
        libraryEntryId: string;
        summary: string;
      }>,
      notes: [] as Array<{
        authorUserId: string;
        body: string;
        createdAt: string;
        id: string;
        libraryEntryId: string;
        visibility: 'private' | 'space_shared';
      }>,
      retrieval: {
        detail: 'Abstract metadata is ready for review, but full text stays outside this demo.',
        fullTextAvailable: false,
        state: 'metadata-only',
        summary: 'Metadata imported',
      },
      workspace: {
        companion: {
          notebookPath: '/library/entry-1/notes',
          readerPath: '/library/entry-1/reader',
        },
        notebookId: 'notebook-personal-1',
        privateNotes: [],
        questions: [
          {
            id: 'question-1',
            prompt: 'What changes my interpretation of this paper?',
          },
        ],
        sharedComments: [],
      },
    };

    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
        const requestUrl =
          typeof input === 'string'
            ? input
            : input instanceof URL
              ? input.toString()
              : input.url;

        if (requestUrl.endsWith('/api/reading/entry-1') && (!init?.method || init.method === 'GET')) {
          return jsonResponse(readingDetail);
        }

        throw new Error(`Unexpected fetch: ${requestUrl}`);
      }),
    );

    renderWorkbench('/library/entry-1/reader');

    expect(await screen.findByText('Personal evidence note')).toBeInTheDocument();
    expect(screen.getByText('Personal context')).toBeInTheDocument();
    expect(screen.queryByText('Project context · project-1')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Back to notebook' })).toHaveAttribute(
      'href',
      '/library/entry-1/notes',
    );
    expect(screen.queryByRole('link', { name: 'Back to project' })).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Open notes workspace' })).toHaveAttribute(
      'href',
      '/library/entry-1/notes',
    );
  });
});
