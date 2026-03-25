import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { App } from '../../src/web/app';

function renderProjectsPage() {
  window.history.replaceState({}, '', '/projects');
  render(<App />);
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

const workbenchSummaryResponse = {
  recentImports: [],
  recentProjects: [
    {
      activeNotebookCount: 1,
      entryCount: 1,
      projectId: 'tumor-board',
      recentActivity: 'Recent activity · Notebook updated 2h ago',
      spaceId: 'shared-space',
      title: 'Tumor board workspace',
    },
    {
      activeNotebookCount: 2,
      entryCount: 3,
      projectId: 'signal-review',
      recentActivity: 'Recent activity · Imported evidence 1d ago',
      spaceId: 'signal-space',
      title: 'Signal review workspace',
    },
  ],
  resumeTargets: [],
};

describe('projects page', () => {
  it('renders a real project inventory on /projects instead of placeholder copy panels', async () => {
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

    renderProjectsPage();

    expect(await screen.findByRole('link', { name: /open tumor board workspace/i })).toBeInTheDocument();
    expect(screen.getByText(/recent activity/i)).toBeInTheDocument();
  });
});
