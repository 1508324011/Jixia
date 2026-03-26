import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import { App } from '../../src/web/app';

function renderWorkbench(pathname = '/home') {
  window.history.replaceState({}, '', pathname);
  render(<App />);
}

describe('workbench chrome', () => {
  beforeEach(() => {
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

        if (url.endsWith('/api/discovery/today')) {
          return new Response(
            JSON.stringify({
              boards: [],
              items: [],
            }),
            {
              headers: { 'Content-Type': 'application/json' },
              status: 200,
            },
          );
        }

        if (url.endsWith('/api/library/personal')) {
          return new Response(
            JSON.stringify({
              entries: [],
            }),
            {
              headers: { 'Content-Type': 'application/json' },
              status: 200,
            },
          );
        }

        if (url.endsWith('/api/settings/me')) {
          return new Response(
            JSON.stringify({
              apiKeyConfigured: false,
              defaultImportTarget: 'personal-library',
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
  });

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

  it('renders activity rail with action-oriented navigation items', () => {
    renderWorkbench('/home');

    const activityRail = screen.getByTestId('workbench-activity-rail');
    expect(activityRail).toBeInTheDocument();
    expect(activityRail).toHaveAttribute('data-rail-variant', 'activity');

    expect(screen.getByRole('link', { name: 'Home mode' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Projects mode' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Search mode' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Library mode' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Notebooks mode' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'AI mode' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Settings mode' })).toBeInTheDocument();
  });

  it('renders compact sidebar with top-level navigation links', () => {
    renderWorkbench('/home');

    const compactSidebar = screen.getByTestId('workbench-compact-sidebar');
    expect(compactSidebar).toBeInTheDocument();
    
    expect(screen.getByRole('link', { name: 'Home' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Projects' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Search' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Library' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Notebooks' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'AI' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Settings' })).toBeInTheDocument();
  });

  it('renders open-view strip for quick access to currently open views', () => {
    renderWorkbench('/home');

    const openViewStrip = screen.getByTestId('workbench-open-view-strip');
    expect(openViewStrip).toBeInTheDocument();
    expect(openViewStrip).toHaveAttribute('data-strip-variant', 'open-views');
  });

  it('maintains inspector-style context rail for project and personal contexts', () => {
    renderWorkbench('/projects/tumor-board');

    const contextRail = screen.getByTestId('workbench-context-rail');
    expect(contextRail).toHaveAttribute('data-rail-variant', 'inspector');
  });

  it('renders shell correctly on /home route', () => {
    renderWorkbench('/home');

    expect(screen.getByTestId('workbench-activity-rail')).toBeInTheDocument();
    expect(screen.getByTestId('workbench-compact-sidebar')).toBeInTheDocument();
    expect(screen.getByTestId('workbench-open-view-strip')).toBeInTheDocument();
    expect(screen.getByTestId('workbench-main-surface')).toBeInTheDocument();
    expect(screen.getByTestId('workbench-context-rail')).toBeInTheDocument();
  });

  it('renders shell correctly on /projects route', () => {
    renderWorkbench('/projects');

    expect(screen.getByTestId('workbench-activity-rail')).toBeInTheDocument();
    expect(screen.getByTestId('workbench-compact-sidebar')).toBeInTheDocument();
    expect(screen.getByTestId('workbench-open-view-strip')).toBeInTheDocument();
    expect(screen.getByTestId('workbench-main-surface')).toBeInTheDocument();
    expect(screen.getByTestId('workbench-context-rail')).toBeInTheDocument();
  });

  it('labels the today route in the open-view strip', () => {
    renderWorkbench('/today');

    expect(screen.getByText('Open · Today')).toBeInTheDocument();
  });

  it('labels the project library route in the open-view strip', () => {
    renderWorkbench('/projects/tumor-board/library');

    expect(screen.getByText('Open · Project library')).toBeInTheDocument();
  });

  it('labels the project notes route in the open-view strip', () => {
    renderWorkbench('/projects/tumor-board/library/entry-1/notes');

    expect(screen.getByText('Open · Project notes')).toBeInTheDocument();
  });

  it('provides consistent shell surface ordering across all workbench routes', () => {
    const routes = ['/home', '/today', '/projects', '/library', '/search', '/notebooks', '/ai', '/settings'];

    for (const route of routes) {
      renderWorkbench(route);

      const activityRail = screen.getByTestId('workbench-activity-rail');
      const compactSidebar = screen.getByTestId('workbench-compact-sidebar');
      const mainSurface = screen.getByTestId('workbench-main-surface');
      const openViewStrip = screen.getByTestId('workbench-open-view-strip');
      const contextRail = screen.getByTestId('workbench-context-rail');

      expect(activityRail).toBeInTheDocument();
      expect(compactSidebar).toBeInTheDocument();
      expect(mainSurface).toBeInTheDocument();
      expect(openViewStrip).toBeInTheDocument();
      expect(contextRail).toBeInTheDocument();

      cleanup();
    }
  });
});
