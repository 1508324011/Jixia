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

describe('project writer flow', () => {
  it('project page opens the project docs surface and saves updates', async () => {
    const user = userEvent.setup();
    const documentState = {
      document: {
        documentId: 'doc-1',
        latestSnapshot: {
          capturedAt: '2026-03-23T00:40:00.000Z',
          citations: [
            {
              docVersionId: 'doc-version-1',
              evidenceSpan: 'Tumor board evidence',
              id: 'citation-1',
              paperAssetId: 'asset-1',
            },
          ],
          content: 'Promoted governed insight paragraph.',
          doc: {
            createdAt: '2026-03-23T00:35:00.000Z',
            id: 'doc-1',
            ownerType: 'project',
            publishState: 'draft',
            projectId: 'project-1',
            spaceId: 'shared-space',
            title: 'Tumor board literature synthesis',
          },
          docVersionId: 'doc-version-1',
        },
        ownerType: 'project',
        projectId: 'project-1',
        publishState: 'draft',
        spaceId: 'shared-space',
        title: 'Tumor board literature synthesis',
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
          requestUrl.endsWith('/api/writing/shared-space/projects/project-1/document') &&
          (!init?.method || init.method === 'GET')
        ) {
          return jsonResponse(documentState);
        }

        if (
          requestUrl.endsWith('/api/writing/shared-space/projects/project-1/document') &&
          init?.method === 'POST'
        ) {
          const body = JSON.parse(String(init.body)) as { content: string; title: string };
          documentState.document = {
            ...documentState.document,
            latestSnapshot: {
              ...documentState.document.latestSnapshot,
              capturedAt: '2026-03-23T00:45:00.000Z',
              content: body.content,
              doc: {
                ...documentState.document.latestSnapshot.doc,
                title: body.title,
              },
            },
            title: body.title,
          };

          return jsonResponse(documentState);
        }

        throw new Error(`Unexpected fetch: ${requestUrl}`);
      }),
    );

    renderWorkbench('/projects/project-1');

    expect(screen.getByRole('heading', { name: 'Project docs' })).toBeInTheDocument();
    expect(screen.getByText('Shared document tree and current draft live here.')).toBeInTheDocument();

    expect(await screen.findByText('Promoted governed insight paragraph.')).toBeInTheDocument();

    await user.click(screen.getByRole('link', { name: 'Open project docs' }));

    expect(await screen.findByRole('heading', { name: 'Project docs' })).toBeInTheDocument();
    const draftContent = await screen.findByRole('textbox', { name: 'Draft content' });
    await user.clear(draftContent);
    await user.type(draftContent, 'Reopened writer draft with persisted edits.');
    await user.click(screen.getByRole('button', { name: 'Save draft' }));
    await user.click(screen.getByRole('button', { name: 'Reload draft' }));

    expect(await screen.findByDisplayValue('Reopened writer draft with persisted edits.')).toBeInTheDocument();
  });

  it('preserves explicit project space context in writer preview links', async () => {
    const documentState = {
      document: {
        documentId: 'doc-1',
        latestSnapshot: {
          capturedAt: '2026-03-23T00:40:00.000Z',
          citations: [],
          content: 'Review-space draft preview.',
          doc: {
            createdAt: '2026-03-23T00:35:00.000Z',
            id: 'doc-1',
            ownerType: 'project',
            projectId: 'project-1',
            publishState: 'draft',
            spaceId: 'review-space',
            title: 'Review board synthesis',
          },
          docVersionId: 'doc-version-1',
        },
        ownerType: 'project',
        projectId: 'project-1',
        publishState: 'draft',
        references: [],
        spaceId: 'review-space',
        title: 'Review board synthesis',
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
          requestUrl.endsWith('/api/writing/review-space/projects/project-1/document') &&
          (!init?.method || init.method === 'GET')
        ) {
          return jsonResponse(documentState);
        }

        throw new Error(`Unexpected fetch: ${requestUrl}`);
      }),
    );

    renderWorkbench('/projects/project-1?spaceId=review-space');

    expect(await screen.findByText('Review-space draft preview.')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Open project docs' })).toHaveAttribute(
      'href',
      '/projects/project-1/writing/doc-1?spaceId=review-space',
    );
  });

  it('projects notebook material from notes workspace into the writer reference rail', async () => {
    const user = userEvent.setup();
    const projectedReference = {
      createdAt: '2026-03-24T01:15:00.000Z',
      documentId: 'doc-1',
      id: 'project-reference-1',
      ownerType: 'project',
      paperAssetId: 'asset-1',
      projectId: 'project-1',
      selectedText: 'Key projected excerpt for the project document.',
      sourceKind: 'projection',
      sourceType: 'notebook-note',
    };
    const documentState = {
      document: {
        documentId: 'doc-1',
        latestSnapshot: {
          capturedAt: '2026-03-24T01:10:00.000Z',
          citations: [],
          content: 'Existing project draft content.',
          doc: {
            createdAt: '2026-03-24T01:00:00.000Z',
            id: 'doc-1',
            ownerType: 'project',
            projectId: 'project-1',
            publishState: 'draft',
            spaceId: 'shared-space',
            title: 'Tumor board literature synthesis',
          },
          docVersionId: 'doc-version-1',
        },
        ownerType: 'project',
        projectId: 'project-1',
        publishState: 'draft',
        references: [] as Array<typeof projectedReference>,
        spaceId: 'shared-space',
        title: 'Tumor board literature synthesis',
      },
    };
    const readingDetail = {
      asset: {
        abstractText: 'Imported PMID metadata for 654321',
        canonicalId: 'pmid:654321',
        createdAt: '2026-03-24T00:00:00.000Z',
        id: 'asset-1',
        title: 'Tumor board biomarkers for rapid review',
      },
      entry: {
        addedAt: '2026-03-24T00:00:00.000Z',
        id: 'entry-1',
        paperAssetId: 'asset-1',
        spaceId: 'shared-space',
        visibility: 'space_shared',
      },
      insights: [],
      notes: [
        {
          authorUserId: 'user-alice',
          body: 'Private notebook body that stays in notebook only.',
          createdAt: '2026-03-24T00:20:00.000Z',
          id: 'note-1',
          libraryEntryId: 'entry-1',
          visibility: 'private',
        },
      ],
      retrieval: {
        detail: 'Abstract metadata is ready for review, but full text stays outside this demo.',
        fullTextAvailable: false,
        state: 'metadata-only',
        summary: 'Metadata imported',
      },
      workspace: {
        notebookId: 'notebook-1',
        privateNotes: [
          {
            authorUserId: 'user-alice',
            body: 'Private notebook body that stays in notebook only.',
            createdAt: '2026-03-24T00:20:00.000Z',
            id: 'note-1',
            libraryEntryId: 'entry-1',
            visibility: 'private',
          },
        ],
        questions: [
          {
            id: 'question-1',
            prompt: 'Which claim deserves a project-level reference?',
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

        if (
          requestUrl.endsWith('/api/reading/entry-1?spaceId=shared-space') &&
          (!init?.method || init.method === 'GET')
        ) {
          return jsonResponse(readingDetail);
        }

        if (
          requestUrl.endsWith('/api/projects/project-1/docs/doc-1/references') &&
          init?.method === 'POST'
        ) {
          documentState.document.references = [projectedReference];

          return jsonResponse({ reference: projectedReference }, 201);
        }

        if (
          requestUrl.endsWith('/api/writing/shared-space/projects/project-1/document') &&
          (!init?.method || init.method === 'GET')
        ) {
          return jsonResponse(documentState);
        }

        if (requestUrl.endsWith('/api/spaces/shared-space/governed-summary')) {
          return jsonResponse({ governedJob: null });
        }

        throw new Error(`Unexpected fetch: ${requestUrl}`);
      }),
    );

    renderWorkbench('/projects/project-1/library/entry-1/notes?spaceId=shared-space');

    expect(await screen.findByRole('heading', { name: 'Notes workspace' })).toBeInTheDocument();
    expect(screen.getByText('Private notebook body that stays in notebook only.')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Insert into project docs' }));

    expect(await screen.findByText('Project-owned reference created.')).toBeInTheDocument();

    await user.click(screen.getByRole('link', { name: 'Open project docs' }));

    expect(await screen.findByRole('heading', { name: 'Project docs' })).toBeInTheDocument();
    expect(screen.getByText('Reference rail')).toBeInTheDocument();
    expect(screen.getByText('Key projected excerpt for the project document.')).toBeInTheDocument();
    expect(screen.queryByText('Notebook · notebook-1')).not.toBeInTheDocument();
  });
});
