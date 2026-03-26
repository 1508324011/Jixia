import { cleanup, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { App } from '../../src/web/app';

function renderWorkbench(pathname = '/home') {
  window.history.replaceState({}, '', pathname);
  render(<App />);
}

afterEach(() => {
  cleanup();
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('workbench navigation', () => {
  it('renders the IDE Classic Lite shell chrome alongside navigation', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string | URL) => {
        const url = input.toString();

        if (url.endsWith('/api/workbench/summary')) {
          return new Response(JSON.stringify({
            recentImports: [],
            recentProjects: [],
            resumeTargets: [],
          }), {
            headers: { 'Content-Type': 'application/json' },
            status: 200,
          });
        }

        if (url.endsWith('/api/discovery/today')) {
          return new Response(JSON.stringify({ boards: [], items: [] }), {
            headers: { 'Content-Type': 'application/json' },
            status: 200,
          });
        }

        if (url.endsWith('/api/library/personal')) {
          return new Response(JSON.stringify({ entries: [] }), {
            headers: { 'Content-Type': 'application/json' },
            status: 200,
          });
        }

        if (url.endsWith('/api/settings/me')) {
          return new Response(JSON.stringify({
            apiKeyConfigured: false,
            defaultImportTarget: 'personal-library',
          }), {
            headers: { 'Content-Type': 'application/json' },
            status: 200,
          });
        }

        throw new Error(`Unexpected fetch request: ${url}`);
      }),
    );

    renderWorkbench('/home');

    expect(screen.getByTestId('workbench-activity-rail')).toBeInTheDocument();
    expect(screen.getByTestId('workbench-compact-sidebar')).toBeInTheDocument();
    expect(screen.getByTestId('workbench-open-view-strip')).toBeInTheDocument();
    expect(screen.getByTestId('workbench-left-rail')).toBeInTheDocument();
    expect(screen.getByTestId('workbench-main-surface')).toBeInTheDocument();
    expect(screen.getByTestId('workbench-context-rail')).toBeInTheDocument();
  });

  it('keeps the top-level /projects route labeled as Projects in the open-view strip', async () => {
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

    renderWorkbench('/projects');

    expect(await screen.findByText('Open · Projects')).toBeInTheDocument();
    expect(screen.queryByText('Open · Home')).not.toBeInTheDocument();
    expect(screen.getByRole('main')).toHaveClass('workbench-route');
    expect(screen.getByRole('main')).not.toHaveClass('page-shell');
  });

  it('sidebar switches among approved top-level surfaces', async () => {
    const user = userEvent.setup();
    const personalLibraryEntries: Array<{
      addedAt: string;
      canonicalId: string;
      entryId: string;
      paperAssetId: string;
      spaceId: string;
      title: string;
      visibility: 'private';
    }> = [];
    const discoveryItems = [
      {
        canonicalId: 'pmid:654321',
        id: 'discovery-1',
        imported: false,
        objectType: 'external-candidate',
        reason: 'PubMed result for today\'s tumor-board queue.',
        sourceLabel: 'PubMed',
        sourceLocator: '654321',
        state: 'new',
        sourceType: 'pmid',
        title: 'Tumor board biomarkers for rapid review',
      },
    ];
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
    const notebooksResponse = {
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
    };
    const aiWorkspaceResponse = {
      workspace: {
        activeSessionId: 'session-1',
        sessions: [
          {
            attachedEntries: [
              {
                canonicalId: 'pmid:654321',
                entryId: 'entry-1',
                paperAssetId: 'asset-1',
                title: 'Tumor board biomarkers for rapid review',
              },
              {
                canonicalId: 'pmid:222222',
                entryId: 'entry-2',
                paperAssetId: 'asset-2',
                title: 'Signal pathway evidence for review escalation',
              },
            ],
            createdAt: '2026-03-25T09:00:00.000Z',
            id: 'session-1',
            summary: 'Cross-paper reasoning stays in the AI workspace instead of inside Reader.',
            title: 'Cross-paper biomarker synthesis',
            updatedAt: '2026-03-25T09:20:00.000Z',
          },
        ],
      },
    };

    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string | URL, init?: RequestInit) => {
        const url = input.toString();

        if (url.includes('/api/discovery/search')) {
          return new Response(
            JSON.stringify({
              boards: [
                {
                  id: 'search-results',
                  items: discoveryItems,
                  title: 'Search results',
                },
              ],
              items: discoveryItems,
              query: 'tumor board',
            }),
            {
              headers: { 'Content-Type': 'application/json' },
              status: 200,
            },
          );
        }

        if (url.endsWith('/api/workbench/summary')) {
          return new Response(JSON.stringify(workbenchSummaryResponse), {
            headers: { 'Content-Type': 'application/json' },
            status: 200,
          });
        }

        if (url.endsWith('/api/notebooks')) {
          return new Response(JSON.stringify(notebooksResponse), {
            headers: { 'Content-Type': 'application/json' },
            status: 200,
          });
        }

        if (url.includes('/api/ai/workspace')) {
          return new Response(JSON.stringify(aiWorkspaceResponse), {
            headers: { 'Content-Type': 'application/json' },
            status: 200,
          });
        }

        if (url.endsWith('/api/discovery/today')) {
          return new Response(
            JSON.stringify({
              boards: [
                {
                  id: 'today-intake',
                  items: discoveryItems,
                  title: 'Today intake',
                },
              ],
              items: discoveryItems,
            }),
            {
              headers: { 'Content-Type': 'application/json' },
              status: 200,
            },
          );
        }

        if (url.endsWith('/api/library/personal/import') && init?.method === 'POST') {
          discoveryItems[0] = {
            ...discoveryItems[0],
            imported: true,
          };
          personalLibraryEntries.splice(0, personalLibraryEntries.length, {
            addedAt: '2026-03-23T00:00:00.000Z',
            canonicalId: discoveryItems[0].canonicalId,
            entryId: 'entry-1',
            paperAssetId: 'asset-1',
            spaceId: 'personal-space-user-alice',
            title: discoveryItems[0].title,
            visibility: 'private',
          });

          return new Response(
            JSON.stringify({
              asset: {
                canonicalId: discoveryItems[0].canonicalId,
                id: 'asset-1',
                title: discoveryItems[0].title,
              },
              entry: {
                id: 'entry-1',
                paperAssetId: 'asset-1',
                spaceId: 'personal-space-user-alice',
                visibility: 'private',
              },
            }),
            {
              headers: { 'Content-Type': 'application/json' },
              status: 201,
            },
          );
        }

        if (url.endsWith('/api/library/personal')) {
          return new Response(
            JSON.stringify({
              entries: personalLibraryEntries,
            }),
            {
              headers: { 'Content-Type': 'application/json' },
              status: 200,
            },
          );
        }

        if (url.endsWith('/api/settings/me') && init?.method === 'POST') {
          return new Response(
            JSON.stringify({
              apiKeyConfigured: true,
              defaultImportTarget: 'project-workspace',
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

    renderWorkbench('/home');

    expect(screen.getByRole('link', { name: 'Home' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Notebooks' })).toBeInTheDocument();

    await user.click(screen.getByRole('link', { name: 'Search' }));
    expect(screen.getByRole('heading', { name: 'Search' })).toBeInTheDocument();
    await user.clear(screen.getByLabelText('Search topic'));
    await user.type(screen.getByLabelText('Search topic'), 'tumor board');
    await user.click(screen.getByRole('button', { name: 'Search intake boards' }));
    expect(
      await screen.findByRole('heading', { name: 'Tumor board biomarkers for rapid review' }),
    ).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '导入到个人 Library' }));
    expect(await screen.findByRole('button', { name: '已进入个人 Library' })).toBeDisabled();

    await user.click(screen.getByRole('link', { name: 'Library' }));
    expect(screen.getByRole('heading', { name: 'Library' })).toBeInTheDocument();
    expect(
      await screen.findByRole('heading', { name: 'Tumor board biomarkers for rapid review' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('main')).toHaveClass('workbench-route');
    expect(screen.getByTestId('library-inventory-surface')).not.toHaveClass('panel');

    await user.click(screen.getByRole('link', { name: 'Projects' }));
    expect(await screen.findByRole('link', { name: /open tumor board workspace/i })).toBeInTheDocument();
    expect(screen.getByText(/recent activity/i)).toBeInTheDocument();

    await user.click(screen.getByRole('link', { name: 'Notebooks' }));
    expect(await screen.findByText('Signal review notebook')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Open signal review notebook' })).toHaveAttribute(
      'href',
      '/notebooks/notebook-2',
    );

    await user.click(screen.getByRole('link', { name: 'AI' }));
    expect(await screen.findByRole('heading', { name: 'AI Workspace' })).toBeInTheDocument();
    expect(screen.getByText('Cross-paper biomarker synthesis')).toBeInTheDocument();
    expect(screen.getByLabelText('AI context attachments')).toBeInTheDocument();
    expect(screen.getByText('Signal pathway evidence for review escalation')).toBeInTheDocument();

    await user.click(screen.getByRole('link', { name: 'Settings' }));
    expect(screen.getByLabelText('API Key')).toBeInTheDocument();
    expect(await screen.findByText('API key not configured')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Personal Library')).toBeInTheDocument();

    await user.type(screen.getByLabelText('API Key'), 'sk-browser-secret');
    await user.selectOptions(
      screen.getByRole('combobox', { name: '默认导入目标' }),
      'project-workspace',
    );
    await user.click(screen.getByRole('button', { name: '保存设置' }));

    expect(await screen.findByText('Settings saved')).toBeInTheDocument();

    const fetchMock = vi.mocked(fetch);
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringMatching(/\/api\/settings\/me$/),
      expect.objectContaining({
        body: JSON.stringify({
          apiKey: 'sk-browser-secret',
          defaultImportTarget: 'project-workspace',
        }),
        method: 'POST',
      }),
    );

    await user.click(screen.getByRole('link', { name: 'Home' }));
    expect(screen.getByRole('heading', { name: 'Research workbench' })).toBeInTheDocument();
  });

  it('project surfaces link to canonical /projects project-doc routes', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
        const requestUrl =
          typeof input === 'string'
            ? input
            : input instanceof URL
              ? input.toString()
              : input.url;

        if (
          requestUrl.endsWith('/api/writing/shared-space/projects/project-1/document') &&
          (!init?.method || init.method === 'GET')
        ) {
          return new Response(
            JSON.stringify({
              document: {
                documentId: 'doc-1',
                latestSnapshot: {
                  capturedAt: '2026-03-24T00:00:00.000Z',
                  citations: [],
                  content: 'Shared project draft',
                  doc: {
                    createdAt: '2026-03-24T00:00:00.000Z',
                    id: 'doc-1',
                    ownerType: 'project',
                    projectId: 'project-1',
                    publishState: 'draft',
                    spaceId: 'shared-space',
                    title: 'Tumor board synthesis',
                  },
                  docVersionId: 'doc-version-1',
                },
                ownerType: 'project',
                projectId: 'project-1',
                publishState: 'draft',
                spaceId: 'shared-space',
                title: 'Tumor board synthesis',
              },
            }),
            {
              headers: { 'Content-Type': 'application/json' },
              status: 200,
            },
          );
        }

        throw new Error(`Unexpected fetch request: ${requestUrl}`);
      }),
    );

    renderWorkbench('/projects/project-1');

    const projectDocsLink = await screen.findByRole('link', { name: 'Open project docs' });
    expect(projectDocsLink).toHaveAttribute('href', '/projects/project-1/writing/doc-1');
  });

  it('keeps notebook, ai workspace, and project docs as separate reader exits', async () => {
    const aiWorkspaceResponse = {
      workspace: {
        activeSessionId: 'session-1',
        sessions: [
          {
            attachedEntries: [
              {
                canonicalId: 'pmid:111111',
                entryId: 'entry-1',
                paperAssetId: 'asset-1',
                title: 'Tumor board biomarkers for rapid review',
              },
            ],
            createdAt: '2026-03-25T09:00:00.000Z',
            id: 'session-1',
            summary: 'Dock the active AI conversation beside Reader without making Reader own it.',
            title: 'Reader docking session',
            updatedAt: '2026-03-25T09:10:00.000Z',
          },
        ],
      },
    };

    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string | URL) => {
        const url = input.toString();

        if (url.endsWith('/api/reading/entry-1')) {
          return new Response(
            JSON.stringify({
              asset: {
                abstractText: 'Imported record for reader surface testing.',
                canonicalId: 'pmid:111111',
                id: 'asset-1',
                title: 'Tumor board biomarkers for rapid review',
              },
              entry: {
                id: 'entry-1',
                visibility: 'space_shared',
              },
              insights: [],
              notes: [
                {
                  content: 'Shared note',
                  createdAt: '2026-03-24T09:00:00.000Z',
                  id: 'note-1',
                  visibility: 'space_shared',
                },
              ],
            }),
            {
              headers: { 'Content-Type': 'application/json' },
              status: 200,
            },
          );
        }

        if (url.includes('/api/ai/workspace') && url.includes('entryId=entry-1')) {
          return new Response(JSON.stringify(aiWorkspaceResponse), {
            headers: { 'Content-Type': 'application/json' },
            status: 200,
          });
        }

        throw new Error(`Unexpected fetch request: ${url}`);
      }),
    );

    renderWorkbench('/projects/tumor-board/library/entry-1/reader');

    expect(await screen.findByRole('heading', { name: 'Reader' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'AI Workspace' })).toBeInTheDocument();
    expect(screen.getByText('Reader docking session')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: /open notebook/i })).toHaveAttribute(
      'href',
      '/projects/tumor-board/library/entry-1/notes',
    );
    expect(screen.getByRole('link', { name: /open ai workspace/i })).toHaveAttribute('href', '/ai');
    expect(screen.getByRole('link', { name: /open project docs/i })).toHaveAttribute(
      'href',
      '/projects/tumor-board/writing/doc-1',
    );
  });
});
