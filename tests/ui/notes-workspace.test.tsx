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

describe('notes workspace', () => {
  it('renders a document-first private notebook surface and saves notebook content', async () => {
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
        spaceId: 'shared-space',
        visibility: 'space_shared',
      },
      insights: [],
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
          notebookPath: '/projects/project-1/library/entry-1/notes?spaceId=shared-space',
          projectDocsPath: '/projects/project-1/writing/doc-1?spaceId=shared-space',
          projectPath: '/projects/project-1?spaceId=shared-space',
          readerPath: '/projects/project-1/library/entry-1/reader?spaceId=shared-space',
        },
        notebookId: 'notebook-1',
        sharedComments: [],
      },
    };
    const notebookSummary = {
      entryId: 'entry-1',
      noteCount: 0,
      notebookId: 'notebook-1',
      notesPath: '/notebooks/notebook-1',
      paperAssetId: 'asset-1',
      paperTitle: 'Tumor board biomarkers for rapid review',
      projectDocsPath: '/projects/project-1/writing/doc-1?spaceId=shared-space',
      projectId: 'project-1',
      readerPath: '/projects/project-1/library/entry-1/reader?spaceId=shared-space',
      spaceId: 'shared-space',
      title: 'Tumor board synthesis notebook',
      updatedAt: '2026-03-23T00:09:00.000Z',
      workspaceLabel: 'Tumor board workspace',
      workspacePath: '/projects/project-1?spaceId=shared-space',
    };
    const notebookDocument = {
      document: {
        documentId: 'notebook-doc-1',
        latestSnapshot: {
          capturedAt: '2026-03-23T00:09:00.000Z',
          content: 'Initial private notebook draft.',
        },
        ownerType: 'user',
        ownerUserId: 'user-alice',
        title: 'Tumor board synthesis notebook',
        visibility: 'private',
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

        if (
          requestUrl.endsWith('/api/reading/entry-1?spaceId=shared-space') &&
          (!init?.method || init.method === 'GET')
        ) {
          return jsonResponse(readingDetail);
        }

        if (
          requestUrl.endsWith('/api/notebooks/notebook-1') &&
          (!init?.method || init.method === 'GET')
        ) {
          return jsonResponse({ notebook: notebookSummary });
        }

        if (
          requestUrl.endsWith('/api/notebooks/notebook-1/document') &&
          (!init?.method || init.method === 'GET')
        ) {
          return jsonResponse(notebookDocument);
        }

        if (
          requestUrl.endsWith('/api/notebooks/notebook-1/document') &&
          init?.method === 'POST'
        ) {
          const body = JSON.parse(String(init.body)) as { content: string; title: string };

          notebookDocument.document = {
            ...notebookDocument.document,
            latestSnapshot: {
              capturedAt: '2026-03-23T00:10:00.000Z',
              content: body.content,
            },
            title: body.title,
          };
          Object.assign(notebookSummary, {
            title: body.title,
            updatedAt: '2026-03-23T00:10:00.000Z',
          });

          return jsonResponse(notebookDocument);
        }

        throw new Error(`Unexpected fetch: ${requestUrl}`);
      }),
    );

    renderWorkbench('/projects/project-1/library/entry-1/notes?spaceId=shared-space');

    expect(await screen.findByRole('heading', { name: 'Notebook' })).toBeInTheDocument();
    expect(screen.getByRole('main')).toHaveClass('workbench-route');
    expect(screen.getByRole('main')).not.toHaveClass('page-shell');
    expect(screen.queryByText('Notebook questions')).not.toBeInTheDocument();
    expect(screen.getByTestId('document-editor')).toBeInTheDocument();
    const notebookEditor = await screen.findByRole('textbox', {
      name: 'Private notebook document',
    });
    expect(notebookEditor).toHaveValue('Initial private notebook draft.');
    expect(screen.getByRole('link', { name: 'Back to project' })).toHaveAttribute(
      'href',
      '/projects/project-1?spaceId=shared-space',
    );

    await user.clear(notebookEditor);
    await user.type(notebookEditor, 'Cross-paper notebook draft for later synthesis.');
    await user.click(screen.getByRole('button', { name: 'Save notebook' }));

    expect(
      await screen.findByDisplayValue('Cross-paper notebook draft for later synthesis.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Open project docs' })).toHaveAttribute(
      'href',
      '/projects/project-1/writing/doc-1?spaceId=shared-space',
    );
  });

  it('opens an empty project-doc surface from the personal notes flow when no shared doc exists yet', async () => {
    const user = userEvent.setup();

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
          return jsonResponse({
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
            insights: [],
            notes: [],
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
              notebookId: 'notebook-1',
              sharedComments: [],
            },
          });
        }

        if (requestUrl.endsWith('/api/notebooks/notebook-1')) {
          return jsonResponse({
            notebook: {
              entryId: 'entry-1',
              noteCount: 0,
              notebookId: 'notebook-1',
              notesPath: '/notebooks/notebook-1',
              paperAssetId: 'asset-1',
              paperTitle: 'Tumor board biomarkers for rapid review',
              readerPath: '/library/entry-1/reader',
              spaceId: 'personal-space-user-alice',
              title: 'Personal review notebook',
              updatedAt: '2026-03-23T00:00:00.000Z',
              workspaceLabel: 'Personal library',
              workspacePath: '/library',
            },
          });
        }

        if (requestUrl.endsWith('/api/notebooks/notebook-1/document')) {
          return jsonResponse({
            document: {
              documentId: 'notebook-doc-1',
              latestSnapshot: null,
              ownerType: 'user',
              ownerUserId: 'user-alice',
              title: 'Personal review notebook',
              visibility: 'private',
            },
          });
        }

        if (requestUrl.endsWith('/api/writing/shared-space/projects/project-1/document')) {
          return jsonResponse({ error: 'Writing document not found.' }, 404);
        }

        if (requestUrl.endsWith('/api/spaces/shared-space/governed-summary')) {
          return jsonResponse({ governedJob: null });
        }

        throw new Error(`Unexpected fetch: ${requestUrl}`);
      }),
    );

    renderWorkbench('/projects/project-1/library/entry-1/notes');

    expect(await screen.findByRole('heading', { name: 'Notebook' })).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Private notebook document' })).toBeInTheDocument();

    await user.click(screen.getByRole('link', { name: 'Open project docs' }));

    expect(await screen.findByRole('heading', { name: 'Project docs' })).toBeInTheDocument();
    expect(screen.getByText('No project doc found')).toBeInTheDocument();
    expect(screen.queryByText('Project docs unavailable')).not.toBeInTheDocument();
  });

  it('loads notebook work directly from /notebooks/:notebookId without first entering through a reader route', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string | URL | Request) => {
        const requestUrl =
          typeof input === 'string'
            ? input
            : input instanceof URL
              ? input.toString()
              : input.url;

        if (requestUrl.endsWith('/api/notebooks/notebook-1')) {
          return jsonResponse({
            notebook: {
              entryId: 'entry-1',
              noteCount: 1,
              notebookId: 'notebook-1',
              notesPath: '/notebooks/notebook-1',
              paperAssetId: 'asset-1',
              paperTitle: 'Tumor board biomarkers for rapid review',
              projectDocsPath: '/projects/tumor-board/writing/doc-1',
              projectId: 'tumor-board',
              readerPath: '/projects/tumor-board/library/entry-1/reader',
              spaceId: 'shared-space',
              title: 'Tumor board synthesis notebook',
              updatedAt: '2026-03-24T09:00:00.000Z',
              workspaceLabel: 'Tumor board workspace',
              workspacePath: '/projects/tumor-board',
            },
          });
        }

        if (requestUrl.endsWith('/api/notebooks/notebook-1/document')) {
          return jsonResponse({
            document: {
              documentId: 'notebook-doc-1',
              latestSnapshot: {
                capturedAt: '2026-03-24T09:00:00.000Z',
                content: 'Direct notebook route content.',
              },
              ownerType: 'user',
              ownerUserId: 'user-alice',
              title: 'Tumor board synthesis notebook',
              visibility: 'private',
            },
          });
        }

        if (requestUrl.endsWith('/api/reading/entry-1')) {
          return jsonResponse({
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
              spaceId: 'shared-space',
              visibility: 'space_shared',
            },
            insights: [],
            notes: [],
            retrieval: {
              detail: 'Abstract metadata is ready for review, but full text stays outside this demo.',
              fullTextAvailable: false,
              state: 'metadata-only',
              summary: 'Metadata imported',
            },
            workspace: {
              companion: {
                notebookPath: '/projects/tumor-board/library/entry-1/notes',
                projectDocsPath: '/projects/tumor-board/writing/doc-1',
                projectPath: '/projects/tumor-board',
                readerPath: '/projects/tumor-board/library/entry-1/reader',
              },
              notebookId: 'notebook-1',
              sharedComments: [],
            },
          });
        }

        throw new Error(`Unexpected fetch: ${requestUrl}`);
      }),
    );

    renderWorkbench('/notebooks/notebook-1');

    expect(await screen.findByRole('heading', { name: 'Notebook' })).toBeInTheDocument();
    expect(screen.getByRole('main')).toHaveClass('workbench-route');
    expect(screen.getByRole('main')).not.toHaveClass('page-shell');
    expect(screen.getByDisplayValue('Direct notebook route content.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Back to notebooks' })).toHaveAttribute(
      'href',
      '/notebooks',
    );
    expect(screen.getByRole('link', { name: 'Back to reader' })).toHaveAttribute(
      'href',
      '/projects/tumor-board/library/entry-1/reader',
    );
  });
});
