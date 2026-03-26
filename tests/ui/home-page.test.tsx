import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { App } from '../../src/web/app';

function renderHomePage() {
  window.history.replaceState({}, '', '/home');
  render(<App />);
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

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
      recentActivity: 'Recent activity · Notebook updated 2h ago',
      spaceId: 'shared-space',
      title: 'Tumor board workspace',
    },
  ],
  resumeTargets: [
    {
      description: 'Reopen the private notebook document linked to the active tumor board paper.',
      kind: 'notebook',
      title: 'Resume notebook',
      to: '/projects/tumor-board/library/entry-1/notes',
    },
  ],
};

describe('home page', () => {
  it('renders Home as one workbench resumption canvas instead of dashboard cards', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string | URL) => {
        const url = input.toString();

        if (url.endsWith('/api/workbench/summary')) {
          return new Response(JSON.stringify(workbenchSummaryResponse), {
            headers: { 'Content-Type': 'application/json' },
            status: 200,
          });
        }

        throw new Error(`Unexpected fetch request: ${url}`);
      }),
    );

    renderHomePage();

    expect(await screen.findByTestId('home-resumption-canvas')).toBeInTheDocument();
    expect(screen.getByLabelText('Recent projects')).not.toHaveClass('panel');
  });

  it('renders recent projects and continue-working entries on Home', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string | URL) => {
        const url = input.toString();

        if (url.endsWith('/api/workbench/summary')) {
          return new Response(JSON.stringify(workbenchSummaryResponse), {
            headers: { 'Content-Type': 'application/json' },
            status: 200,
          });
        }

        throw new Error(`Unexpected fetch request: ${url}`);
      }),
    );

    renderHomePage();

    expect(await screen.findByRole('heading', { name: /recent projects/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /open tumor board workspace/i })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /resume notebook/i })).toBeInTheDocument();
  });

  it('renders actionable recent-opened links in the context rail', () => {
    renderHomePage();

    expect(
      screen.getByRole('link', { name: /signal pathways in shared tumor boards/i }),
    ).toBeInTheDocument();
  });
});
