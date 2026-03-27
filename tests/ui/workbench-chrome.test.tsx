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

        if (url.includes('/api/reading/') && !url.includes('/notes')) {
          return new Response(
            JSON.stringify({
              asset: {
                abstractText: 'Reader chrome test abstract',
                canonicalId: 'pmid:reader-test',
                createdAt: '2026-03-26T00:00:00.000Z',
                id: 'asset-reader-test',
                title: 'Reader chrome test paper',
              },
              document: {
                sections: [
                  {
                    body: 'Reader chrome test body',
                    id: 'section-reader-test',
                    title: 'Overview',
                  },
                ],
                title: 'Reader chrome test paper',
              },
              entry: {
                addedAt: '2026-03-26T00:00:00.000Z',
                id: 'entry-1',
                paperAssetId: 'asset-reader-test',
                spaceId: 'shared-space',
                visibility: 'space_shared',
              },
              insights: [],
              notes: [],
              retrieval: {
                detail: 'Reader chrome test retrieval detail',
                fullTextAvailable: true,
                state: 'document-ready',
                summary: 'Reading document ready',
              },
              workspace: {
                companion: {
                  notebookPath: '/projects/tumor-board/library/entry-1/notes',
                  projectDocsPath: '/projects/tumor-board/writing/doc-1',
                  projectPath: '/projects/tumor-board',
                  readerPath: '/projects/tumor-board/library/entry-1/reader',
                },
                notebookId: 'notebook-reader-test',
                sharedComments: [],
              },
            }),
            {
              headers: { 'Content-Type': 'application/json' },
              status: 200,
            },
          );
        }

        if (url.includes('/api/ai/workspace') && url.includes('entryId=entry-1')) {
          return new Response(
            JSON.stringify({
              workspace: {
                activeSessionId: 'session-reader-test',
                sessions: [
                  {
                    attachedEntries: [],
                    createdAt: '2026-03-26T00:00:00.000Z',
                    id: 'session-reader-test',
                    summary: 'Reader chrome test AI summary',
                    title: 'Reader chrome AI session',
                    updatedAt: '2026-03-26T00:00:00.000Z',
                  },
                ],
              },
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

  it('renders compact sidebar as contextual mode content instead of duplicate global navigation', () => {
    renderWorkbench('/projects');

    const compactSidebar = screen.getByTestId('workbench-compact-sidebar');
    expect(compactSidebar).toBeInTheDocument();

    expect(screen.getByTestId('workbench-contextual-sidebar')).toBeInTheDocument();
    expect(screen.getByText('Project workspaces')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Home' })).not.toBeInTheDocument();
  });

  it('renders open-view strip for quick access to currently open views', () => {
    renderWorkbench('/home');

    const openViewStrip = screen.getByTestId('workbench-open-view-strip');
    expect(openViewStrip).toBeInTheDocument();
    expect(openViewStrip).toHaveAttribute('data-strip-variant', 'open-views');
  });

  it('renders the compact shell without sidebar or strip explainer copy', () => {
    renderWorkbench('/library');

    expect(screen.queryByText('IDE Classic Lite')).not.toBeInTheDocument();
    expect(screen.queryByText(/keep primary navigation compact/i)).not.toBeInTheDocument();
    expect(screen.queryByText('Open views')).not.toBeInTheDocument();
    expect(screen.queryByText(/surface the current lane/i)).not.toBeInTheDocument();
  });

  it('does not render recent-opened filler cards in the default compact shell', () => {
    renderWorkbench('/home');

    expect(screen.queryByText('最近打开')).not.toBeInTheDocument();
  });

  it('maintains inspector-style context rail for project and personal contexts', () => {
    renderWorkbench('/projects/tumor-board');

    const contextRail = screen.getByTestId('workbench-context-rail');
    expect(contextRail).toHaveAttribute('data-rail-variant', 'inspector');
    expect(screen.queryByText(/project-owned docs stay shared while notebook evidence is promoted deliberately/i)).not.toBeInTheDocument();

    cleanup();

    renderWorkbench('/home');

    expect(screen.queryByTestId('workbench-context-rail')).not.toBeInTheDocument();
  });

  it('renders shell correctly on /home route', () => {
    renderWorkbench('/home');

    expect(screen.getByTestId('workbench-activity-rail')).toBeInTheDocument();
    expect(screen.getByTestId('workbench-compact-sidebar')).toBeInTheDocument();
    expect(screen.getByTestId('workbench-open-view-strip')).toBeInTheDocument();
    expect(screen.getByTestId('workbench-main-surface')).toBeInTheDocument();
    expect(screen.queryByTestId('workbench-context-rail')).not.toBeInTheDocument();
  });

  it('renders shell correctly on /projects route', () => {
    renderWorkbench('/projects');

    expect(screen.getByTestId('workbench-activity-rail')).toBeInTheDocument();
    expect(screen.getByTestId('workbench-compact-sidebar')).toBeInTheDocument();
    expect(screen.getByTestId('workbench-open-view-strip')).toBeInTheDocument();
    expect(screen.getByTestId('workbench-main-surface')).toBeInTheDocument();
    expect(screen.queryByTestId('workbench-context-rail')).not.toBeInTheDocument();
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

  it('labels the top-level /projects route correctly in the open-view strip', () => {
    renderWorkbench('/projects');

    expect(screen.getByText('Open · Projects')).toBeInTheDocument();
    expect(screen.queryByText('Open · Home')).not.toBeInTheDocument();
  });

  it('renders Home as one workbench resumption canvas instead of dashboard cards', async () => {
    renderWorkbench('/home');

    expect(await screen.findByTestId('home-resumption-canvas')).toBeInTheDocument();
    expect(screen.getByLabelText('Recent projects')).not.toHaveClass('panel');
  });

  it('renders Reader as one dominant reading workspace instead of stacked boxed panels', async () => {
    renderWorkbench('/projects/tumor-board/library/entry-1/reader');

    expect(await screen.findByTestId('reader-workspace-canvas')).toBeInTheDocument();
    expect(screen.getByTestId('reader-document-canvas').closest('article')).not.toHaveClass('panel');
    expect(screen.getByLabelText('AI context attachments')).not.toHaveClass('panel');
  });

  it('keeps the primary workbench routes on one route-shell grammar instead of mixing page-shell cards with workbench chrome', () => {
    const routes = ['/home', '/projects', '/search', '/library', '/notebooks', '/ai'];

    for (const route of routes) {
      renderWorkbench(route);

      const routeMain = screen.getByRole('main');

      expect(routeMain).toHaveClass('workbench-route');
      expect(routeMain).not.toHaveClass('page-shell');

      cleanup();
    }
  });

  it('keeps primary routes concise instead of leading with large explanatory page headers', async () => {
    renderWorkbench('/search');
    expect(screen.queryByText(/search across the current discovery sources/i)).not.toBeInTheDocument();

    cleanup();
    renderWorkbench('/projects');
    expect(screen.queryByText(/review shared workspaces as real inventories/i)).not.toBeInTheDocument();

    cleanup();
    renderWorkbench('/library');
    expect(screen.queryByText(/review imported literature entries/i)).not.toBeInTheDocument();

    cleanup();
    renderWorkbench('/notebooks');
    expect(screen.queryByText(/private notebook documents stay separate/i)).not.toBeInTheDocument();

    cleanup();
    renderWorkbench('/ai');
    expect(screen.queryByText(/keep governed conversations, reading follow-ups/i)).not.toBeInTheDocument();

    cleanup();
    renderWorkbench('/projects/tumor-board/library/entry-1/reader');
    expect(screen.queryByText(/review the evidence here, then continue into notebook/i)).not.toBeInTheDocument();
  });

  it('provides consistent shell surface ordering across all workbench routes', () => {
    const routes = ['/home', '/today', '/projects', '/library', '/search', '/notebooks', '/ai', '/settings'];

    for (const route of routes) {
      renderWorkbench(route);

      const activityRail = screen.getByTestId('workbench-activity-rail');
      const compactSidebar = screen.getByTestId('workbench-compact-sidebar');
      const mainSurface = screen.getByTestId('workbench-main-surface');
      const openViewStrip = screen.getByTestId('workbench-open-view-strip');
      expect(activityRail).toBeInTheDocument();
      expect(compactSidebar).toBeInTheDocument();
      expect(mainSurface).toBeInTheDocument();
      expect(openViewStrip).toBeInTheDocument();

      cleanup();
    }
  });
});
