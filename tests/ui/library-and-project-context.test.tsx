import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { App } from '../../src/web/app';

const projectFixture = {
  membership: {
    joinedAt: '2026-05-08T00:00:00.000Z',
    projectId: 'project-alpha',
    role: 'owner',
    userId: 'user-alice',
  },
  project: {
    createdAt: '2026-05-08T00:00:00.000Z',
    createdByUserId: 'user-alice',
    id: 'project-alpha',
    name: 'Project Alpha',
    spaceId: 'space-alpha',
    status: 'active',
    updatedAt: '2026-05-08T00:00:00.000Z',
  },
};

function renderWorkbench(pathname: string) {
  window.history.replaceState({}, '', pathname);
  render(<App />);
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('library and project context', () => {
  it('library and project workspace expose different context labels', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string | URL) => {
        const url = input.toString();

        if (url.endsWith('/api/projects')) {
          return new Response(JSON.stringify([projectFixture]), {
            headers: { 'Content-Type': 'application/json' },
            status: 200,
          });
        }

        if (url.endsWith('/api/projects/project-alpha/writing/document')) {
          return new Response(
            JSON.stringify({
              document: {
                documentId: 'doc-alpha',
                latestSnapshot: null,
                projectId: 'project-alpha',
                publishState: 'draft',
                spaceId: 'space-alpha',
                title: 'Project Alpha draft',
              },
            }),
            {
              headers: { 'Content-Type': 'application/json' },
              status: 200,
            },
          );
        }

        if (url.endsWith('/api/library/personal')) {
          return new Response(JSON.stringify({ entries: [] }), {
            headers: { 'Content-Type': 'application/json' },
            status: 200,
          });
        }

        throw new Error(`Unexpected fetch request: ${url}`);
      }),
    );

    renderWorkbench('/library');
    expect(screen.getByText('Personal')).toBeInTheDocument();
    expect(await screen.findByRole('heading', { name: 'Library' })).toBeInTheDocument();

    cleanup();

    renderWorkbench('/projects/project-alpha');
    expect(screen.getByText('Project / project-alpha')).toBeInTheDocument();
    expect(await screen.findByRole('heading', { name: 'Project Alpha' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: '共享 Library' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Writer' })).toBeInTheDocument();
  });
});
