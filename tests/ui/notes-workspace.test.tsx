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
  it('keeps private notebook capture on a dedicated notes surface', async () => {
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
          requestUrl.endsWith('/api/reading/entry-1/notes?spaceId=shared-space') &&
          init?.method === 'POST'
        ) {
          const body = JSON.parse(String(init.body)) as {
            body: string;
            visibility: 'private' | 'space_shared';
          };

          const note = {
            authorUserId: 'user-alice',
            body: body.body,
            createdAt: '2026-03-23T00:10:00.000Z',
            id: `note-${readingDetail.notes.length + 1}`,
            libraryEntryId: 'entry-1',
            visibility: body.visibility,
          };
          readingDetail.notes.push(note);

          return jsonResponse({ note }, 201);
        }

        throw new Error(`Unexpected fetch: ${requestUrl}`);
      }),
    );

    renderWorkbench('/projects/project-1/library/entry-1/notes?spaceId=shared-space');

    expect(await screen.findByRole('heading', { name: 'Notes workspace' })).toBeInTheDocument();
    expect(screen.getByText('Notebook questions')).toBeInTheDocument();

    await user.type(screen.getByRole('textbox', { name: 'Private note' }), 'Cross-paper note for later synthesis.');
    await user.click(screen.getByRole('button', { name: 'Save private note' }));

    expect(await screen.findByText('Cross-paper note for later synthesis.')).toBeInTheDocument();
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

    expect(await screen.findByRole('heading', { name: 'Notes workspace' })).toBeInTheDocument();

    await user.click(screen.getByRole('link', { name: 'Open project docs' }));

    expect(await screen.findByRole('heading', { name: 'Project docs' })).toBeInTheDocument();
    expect(screen.getByText('No project doc found')).toBeInTheDocument();
    expect(screen.queryByText('Project docs unavailable')).not.toBeInTheDocument();
  });
});
