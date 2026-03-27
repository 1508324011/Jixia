import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { App } from '../../src/web/app';

function renderWorkbench(pathname = '/home') {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: string | URL) => {
      const url = input.toString();

      if (url.endsWith('/api/workbench/summary')) {
        return new Response(
          JSON.stringify({
            recentImports: [],
            recentProjects: [],
            resumeTargets: [],
          }),
          {
            headers: { 'Content-Type': 'application/json' },
            status: 200,
          },
        );
      }

      throw new Error(`Unexpected fetch request: ${url}`);
    }),
  );

  window.history.replaceState({}, '', pathname);
  render(<App />);
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('compact workbench shell', () => {
  it('does not duplicate top-level workbench navigation inside the contextual sidebar', () => {
    renderWorkbench('/search');

    expect(screen.getByTestId('workbench-contextual-sidebar')).toBeInTheDocument();
    expect(screen.getByText('Search scopes')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Home' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Projects' })).not.toBeInTheDocument();
  });

  it('does not render recent-opened filler cards in the default compact shell', () => {
    renderWorkbench('/home');

    expect(screen.queryByText('最近打开')).not.toBeInTheDocument();
  });

  it('does not render a default inspector rail on home when no auxiliary context is needed', () => {
    renderWorkbench('/home');

    expect(screen.queryByTestId('workbench-context-rail')).not.toBeInTheDocument();
    expect(screen.queryByLabelText('current context')).not.toBeInTheDocument();
  });
});
