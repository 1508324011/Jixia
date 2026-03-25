import { render, screen } from '@testing-library/react';
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

describe('notebooks page', () => {
  it('renders notebook entries from the notebook API instead of static teaser cards', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string | URL | Request) => {
        const requestUrl =
          typeof input === 'string'
            ? input
            : input instanceof URL
              ? input.toString()
              : input.url;

        if (requestUrl.endsWith('/api/notebooks')) {
          return jsonResponse({
            notebooks: [
              {
                entryId: 'entry-1',
                noteCount: 2,
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
              {
                entryId: 'entry-2',
                noteCount: 1,
                notebookId: 'notebook-2',
                notesPath: '/notebooks/notebook-2',
                paperAssetId: 'asset-2',
                paperTitle: 'Signal pathway evidence for review escalation',
                readerPath: '/library/entry-2/reader',
                spaceId: 'personal-space-user-alice',
                title: 'Signal review notebook',
                updatedAt: '2026-03-24T08:30:00.000Z',
                workspaceLabel: 'Personal library',
                workspacePath: '/library',
              },
            ],
          });
        }

        throw new Error(`Unexpected fetch: ${requestUrl}`);
      }),
    );

    renderWorkbench('/notebooks');

    expect(await screen.findByRole('heading', { name: 'Notebooks' })).toBeInTheDocument();
    expect(screen.getByText('Tumor board synthesis notebook')).toBeInTheDocument();
    expect(screen.getByText('Signal review notebook')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Open signal review notebook' })).toHaveAttribute(
      'href',
      '/notebooks/notebook-2',
    );
    expect(screen.getByRole('link', { name: 'Open related reader' })).toHaveAttribute(
      'href',
      '/projects/tumor-board/library/entry-1/reader',
    );
  });
});
