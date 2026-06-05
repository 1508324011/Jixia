import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';

import { App } from '../../src/web/app';
import { NotebookPage } from '../../src/web/pages/notebook-page';

function renderWorkbench(pathname = '/notebook') {
  window.history.replaceState({}, '', pathname);
  render(<App />);
}

function RouteLocationProbe() {
  const location = useLocation();

  return <p>Route location · {location.pathname}{location.search}</p>;
}

function renderNotebookRoute(pathname = '/notebook') {
  render(
    <MemoryRouter initialEntries={[pathname]}>
      <RouteLocationProbe />
      <Routes>
        <Route path="/notebook" element={<NotebookPage />} />
        <Route path="/notebook/:documentId" element={<NotebookPage />} />
      </Routes>
    </MemoryRouter>,
  );
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

describe('notebook page', () => {
  it('opens the route-targeted private Notebook instead of defaulting to the first visible document', async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
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

      if (requestUrl.endsWith('/api/notebooks')) {
        return jsonResponse({
          documents: [
            {
              createdAt: '2026-05-18T00:00:00.000Z',
              id: 'notebook-first',
              ownerId: 'user-alice',
              title: 'First visible notebook',
              updatedAt: '2026-05-18T00:00:00.000Z',
            },
            {
              createdAt: '2026-05-18T00:01:00.000Z',
              id: 'notebook-target',
              ownerId: 'user-alice',
              title: 'Route target notebook',
              updatedAt: '2026-05-18T00:01:00.000Z',
            },
          ],
        });
      }

      if (requestUrl.endsWith('/api/notebooks/notebook-target/snapshot')) {
        return jsonResponse({
          capturedAt: '2026-05-18T00:02:00.000Z',
          citations: [],
          content: 'Route-targeted notebook body.',
          document: {
            createdAt: '2026-05-18T00:01:00.000Z',
            id: 'notebook-target',
            ownerId: 'user-alice',
            title: 'Route target notebook',
            updatedAt: '2026-05-18T00:01:00.000Z',
          },
          documentContent: {
            blocks: [
              {
                text: 'Route-targeted notebook body.',
                type: 'paragraph',
              },
            ],
            schemaVersion: 1,
          },
          versionId: 'notebook-version-target',
          versionNumber: 3,
        });
      }

      if (requestUrl.endsWith('/api/notebooks/notebook-first/snapshot')) {
        throw new Error('The /notebook/:documentId route should not load the first notebook snapshot.');
      }

      throw new Error(`Unexpected fetch: ${requestUrl}`);
    });

    vi.stubGlobal('fetch', fetchMock);

    renderWorkbench('/notebook/notebook-target');

    expect(await screen.findByRole('heading', { name: 'Notebook' })).toBeInTheDocument();
    expect(await screen.findByRole('heading', { name: 'Route target notebook' })).toBeInTheDocument();
    expect(await screen.findByDisplayValue('Route-targeted notebook body.')).toBeInTheDocument();
    expect(screen.getByText(/Saved snapshot · notebook-version-target · 0 citation\(s\)/)).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringMatching(/\/api\/notebooks\/notebook-target\/snapshot$/),
      expect.any(Object),
    );
  });

  it('ignores removed Project Doc adoption query params while preserving private Notebook editing', async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const requestUrl =
        typeof input === 'string'
          ? input
          : input instanceof URL
            ? input.toString()
            : input.url;

      if (requestUrl.endsWith('/api/notebooks')) {
        return jsonResponse({
          documents: [
            {
              createdAt: '2026-05-23T00:00:00.000Z',
              id: 'notebook-private-source',
              ownerId: 'user-alice',
              title: 'Private synthesis notebook',
              updatedAt: '2026-05-23T00:01:00.000Z',
            },
            {
              createdAt: '2026-05-23T00:01:30.000Z',
              id: 'notebook-second',
              ownerId: 'user-alice',
              title: 'Second private notebook',
              updatedAt: '2026-05-23T00:01:30.000Z',
            },
          ],
        });
      }

      if (requestUrl.endsWith('/api/notebooks/notebook-private-source/snapshot')) {
        return jsonResponse({
          capturedAt: '2026-05-23T00:02:00.000Z',
          citations: [],
          content: 'Notebook evidence stays private until selected evidence is rewritten with citations.',
          document: {
            createdAt: '2026-05-23T00:00:00.000Z',
            id: 'notebook-private-source',
            ownerId: 'user-alice',
            title: 'Private synthesis notebook',
            updatedAt: '2026-05-23T00:01:00.000Z',
          },
          documentContent: {
            blocks: [
              {
                text: 'Notebook evidence stays private until selected evidence is rewritten with citations.',
                type: 'paragraph',
              },
            ],
            schemaVersion: 1,
          },
          versionId: 'notebook-version-4',
          versionNumber: 4,
        });
      }

      if (requestUrl.endsWith('/api/notebooks/notebook-second/snapshot')) {
        return jsonResponse({
          capturedAt: '2026-05-23T00:03:00.000Z',
          citations: [],
          content: 'Second private Notebook body.',
          document: {
            createdAt: '2026-05-23T00:01:30.000Z',
            id: 'notebook-second',
            ownerId: 'user-alice',
            title: 'Second private notebook',
            updatedAt: '2026-05-23T00:01:30.000Z',
          },
          documentContent: {
            blocks: [
              {
                text: 'Second private Notebook body.',
                type: 'paragraph',
              },
            ],
            schemaVersion: 1,
          },
          versionId: 'notebook-version-second',
          versionNumber: 1,
        });
      }

      if (requestUrl.includes('/notebook-adoptions')) {
        throw new Error('Notebook page must not call foreground whole-notebook Project Doc adoption.');
      }

      throw new Error(`Unexpected fetch: ${requestUrl}`);
    });

    vi.stubGlobal('fetch', fetchMock);

    renderNotebookRoute('/notebook?adoptProjectId=project-1&adoptProjectDocId=doc-project-1');

    expect(await screen.findByRole('heading', { name: 'Private synthesis notebook' })).toBeInTheDocument();
    expect(
      await screen.findByDisplayValue('Notebook evidence stays private until selected evidence is rewritten with citations.'),
    ).toBeInTheDocument();
    expect(screen.queryByText(/Project Doc adoption target/)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Adopt into Project Doc' })).not.toBeInTheDocument();
    expect(
      fetchMock.mock.calls.some(([requestInput]) => requestInput.toString().includes('/notebook-adoptions')),
    ).toBe(false);

    await user.click(screen.getByRole('button', { name: 'Second private notebook' }));

    expect(await screen.findByRole('heading', { name: 'Second private notebook' })).toBeInTheDocument();
    expect(await screen.findByText('Route location · /notebook/notebook-second')).toBeInTheDocument();
    expect(
      fetchMock.mock.calls.some(([requestInput]) => requestInput.toString().includes('/notebook-adoptions')),
    ).toBe(false);
  });
});
