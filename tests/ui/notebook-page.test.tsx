import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { App } from '../../src/web/app';

function renderWorkbench(pathname = '/notebook') {
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
});
