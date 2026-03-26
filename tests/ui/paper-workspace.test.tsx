import { render, screen, within } from '@testing-library/react';
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
      document: {
        sections: [
          {
            body:
              'Tumor board biomarkers for rapid review\n\nImported PMID metadata for 654321\n\nReader now treats the paper as a document surface instead of a metadata companion panel.',
            id: 'section-overview',
            title: 'Overview',
          },
        ],
        title: 'Tumor board biomarkers for rapid review',
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
        detail: 'Structured reading content is ready for the document-first canvas.',
        fullTextAvailable: true,
        state: 'document-ready',
        summary: 'Reading document ready',
      },
      workspace: {
        companion: {
          notebookPath: '/projects/project-1/library/entry-1/notes',
          projectDocsPath: '/projects/project-1/writing/doc-1',
          projectPath: '/projects/project-1',
          readerPath: '/projects/project-1/library/entry-1/reader',
        },
        notebookId: 'notebook-1',
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
    const aiWorkspaceResponse = {
      workspace: {
        activeSessionId: 'session-1',
        sessions: [
          {
            attachedEntries: [
              {
                canonicalId: 'pmid:654321',
                entryId: 'entry-1',
                paperAssetId: 'asset-1',
                title: 'Tumor board biomarkers for rapid review',
              },
            ],
            createdAt: '2026-03-25T09:00:00.000Z',
            id: 'session-1',
            summary: 'Compare the current reader evidence against prior tumor-board threads.',
            title: 'Tumor board evidence review',
            updatedAt: '2026-03-25T09:30:00.000Z',
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

        if (
          requestUrl.includes('/api/ai/workspace') &&
          requestUrl.includes('entryId=entry-1') &&
          (!init?.method || init.method === 'GET')
        ) {
          return jsonResponse(aiWorkspaceResponse);
        }

        throw new Error(`Unexpected fetch: ${requestUrl}`);
      }),
    );

    renderWorkbench('/projects/project-1/library/entry-1/reader');

    expect(await screen.findByTestId('reader-workspace-canvas')).toBeInTheDocument();
    expect(await screen.findByText('Tumor board biomarkers for rapid review')).toBeInTheDocument();
    const readerCanvas = await screen.findByTestId('reader-document-canvas');
    expect(readerCanvas.closest('article')).not.toHaveClass('panel');
    expect(within(readerCanvas).getByText('Overview')).toBeInTheDocument();
    expect(
      within(readerCanvas).getByText(
        'Reader now treats the paper as a document surface instead of a metadata companion panel.',
      ),
    ).toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: 'AI 对话' })).not.toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: '私人笔记' })).not.toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: '共享评论' })).not.toBeInTheDocument();
    expect(screen.queryByRole('tab', { name: '关键信息' })).not.toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'AI Workspace' })).toBeInTheDocument();
    expect(screen.getByText('Tumor board evidence review')).toBeInTheDocument();
    const aiAttachments = screen.getByLabelText('AI context attachments');
    expect(aiAttachments).not.toHaveClass('panel');
    expect(within(aiAttachments).getByText('Tumor board biomarkers for rapid review')).toBeInTheDocument();
    expect(within(aiAttachments).getByText('pmid:654321')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Open notebook' })).toHaveAttribute(
      'href',
      '/projects/project-1/library/entry-1/notes',
    );
    expect(screen.getByRole('link', { name: 'Open project overview' })).toHaveAttribute(
      'href',
      '/projects/project-1',
    );
    expect(screen.getByRole('link', { name: 'Open project docs' })).toHaveAttribute(
      'href',
      '/projects/project-1/writing/doc-1',
    );

    expect(screen.getByText('Private note for later synthesis.')).toBeInTheDocument();
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
      document: {
        sections: [
          {
            body:
              'Personal evidence note\n\nImported PMID metadata for 111111\n\nPersonal reading stays document-first even when opened outside a project.',
            id: 'section-personal-overview',
            title: 'Overview',
          },
        ],
        title: 'Personal evidence note',
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
        detail: 'Structured reading content is ready for the document-first canvas.',
        fullTextAvailable: true,
        state: 'document-ready',
        summary: 'Reading document ready',
      },
      workspace: {
        companion: {
          notebookPath: '/library/entry-1/notes',
          readerPath: '/library/entry-1/reader',
        },
        notebookId: 'notebook-personal-1',
        sharedComments: [],
      },
    };
    const aiWorkspaceResponse = {
      workspace: {
        activeSessionId: 'session-personal-1',
        sessions: [
          {
            attachedEntries: [
              {
                canonicalId: 'pmid:111111',
                entryId: 'entry-1',
                paperAssetId: 'asset-personal-1',
                title: 'Personal evidence note',
              },
            ],
            createdAt: '2026-03-25T08:00:00.000Z',
            id: 'session-personal-1',
            summary: 'Personal reading follow-up kept outside the notebook and reader state.',
            title: 'Personal reading follow-up',
            updatedAt: '2026-03-25T08:10:00.000Z',
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

        if (
          requestUrl.includes('/api/ai/workspace') &&
          requestUrl.includes('entryId=entry-1') &&
          (!init?.method || init.method === 'GET')
        ) {
          return jsonResponse(aiWorkspaceResponse);
        }

        throw new Error(`Unexpected fetch: ${requestUrl}`);
      }),
    );

    renderWorkbench('/library/entry-1/reader');

    expect(await screen.findByText('Personal evidence note')).toBeInTheDocument();
    expect(await screen.findByTestId('reader-document-canvas')).toBeInTheDocument();
    expect(screen.getByText('Personal context')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'AI Workspace' })).toBeInTheDocument();
    expect(screen.getByText('Personal reading follow-up')).toBeInTheDocument();
    expect(screen.queryByText('Project context · project-1')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Open notebook' })).toHaveAttribute(
      'href',
      '/library/entry-1/notes',
    );
    expect(screen.queryByRole('link', { name: 'Open project overview' })).not.toBeInTheDocument();
  });
});
