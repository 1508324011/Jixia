import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { App } from '../../src/web/app';

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
    const projectFixture = {
      membership: {
        joinedAt: '2026-05-03T00:00:00.000Z',
        projectId: 'project-recovery',
        role: 'owner',
        userId: 'user-alice',
      },
      project: {
        createdAt: '2026-05-03T00:00:00.000Z',
        createdByUserId: 'user-alice',
        id: 'project-recovery',
        name: 'Project-first Recovery',
        spaceId: 'space-recovery',
        status: 'active',
        updatedAt: '2026-05-03T00:00:00.000Z',
      },
    };

    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string | URL) => {
        const url = input.toString();

        if (url.endsWith('/api/library/personal')) {
          return new Response(JSON.stringify({ entries: [] }), {
            headers: { 'Content-Type': 'application/json' },
            status: 200,
          });
        }

        if (url.endsWith('/api/projects')) {
          return new Response(JSON.stringify([projectFixture]), {
            headers: { 'Content-Type': 'application/json' },
            status: 200,
          });
        }

        if (url.endsWith('/api/projects/project-recovery/writing-document')) {
          return new Response(JSON.stringify(null), {
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

    renderWorkbench('/projects/project-recovery');
    expect(await screen.findByText('Project / Project-first Recovery')).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: '共享 Library' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Writer' })).toBeInTheDocument();
  });
});
