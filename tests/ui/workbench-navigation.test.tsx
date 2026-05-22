import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { App } from '../../src/web/app';
import {
  deriveWorkbenchRouteContext,
  isWorkbenchNavigationItemActive,
  resolveWorkbenchNavigationTarget,
  workbenchNavigationItems,
} from '../../src/web/lib/workbench-navigation';

import { expectDocumentBlocksToOmitAuthorityFields } from './document-block-assertions';

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

function renderWorkbench(pathname = '/home') {
  window.history.replaceState({}, '', pathname);
  render(<App />);
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('workbench navigation', () => {
  it('recognizes preserved spaces deep links but generates project-first targets', () => {
    const readerPath = '/spaces/space-alpha/projects/project-alpha/library/entry-alpha/reader';
    const readerContext = deriveWorkbenchRouteContext(readerPath);

    expect(readerContext).toEqual({
      currentSection: 'reader',
      entryId: 'entry-alpha',
      projectId: 'project-alpha',
      spaceId: 'space-alpha',
    });
    expect(isWorkbenchNavigationItemActive(readerPath, 'library')).toBe(true);

    const libraryItem = workbenchNavigationItems.find((item) => item.key === 'library');
    if (!libraryItem) {
      throw new Error('Library navigation item is required.');
    }

    expect(resolveWorkbenchNavigationTarget(libraryItem, readerContext)).toBe(
      '/projects/project-alpha/library',
    );

    const writingPath = '/spaces/space-alpha/projects/project-alpha/writing/doc-alpha';
    const writingContext = deriveWorkbenchRouteContext(writingPath);
    expect(writingContext).toEqual({
      currentSection: 'writing',
      docId: 'doc-alpha',
      projectId: 'project-alpha',
      spaceId: 'space-alpha',
    });
    expect(isWorkbenchNavigationItemActive(writingPath, 'projects')).toBe(true);

    const projectsItem = workbenchNavigationItems.find((item) => item.key === 'projects');
    if (!projectsItem) {
      throw new Error('Projects navigation item is required.');
    }

    expect(resolveWorkbenchNavigationTarget(projectsItem, writingContext)).toBe(
      '/projects/project-alpha',
    );
  });

  it('resolves the project overview route to visible server-owned project context', () => {
    const projectContext = deriveWorkbenchRouteContext('/projects/project-alpha');

    expect(projectContext).toEqual({
      currentSection: 'projects',
      projectId: 'project-alpha',
    });
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
        reason: 'PubMed result for today\'s tumor-board queue.',
        sourceLabel: 'PubMed',
        sourceLocator: '654321',
        sourceType: 'pmid',
        title: 'Tumor board biomarkers for rapid review',
      },
    ];
    const notebooks = [
      {
        createdAt: '2026-03-23T00:00:00.000Z',
        id: 'notebook-1',
        ownerId: 'user-alice',
        title: 'Private synthesis notebook',
        updatedAt: '2026-03-23T00:00:00.000Z',
      },
    ];
    let notebookContent = 'Initial private Notebook content';
    let notebookDocumentContent = {
      blocks: [
        {
          text: notebookContent,
          type: 'paragraph',
        },
      ],
      schemaVersion: 1,
    };

    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string | URL, init?: RequestInit) => {
        const url = input.toString();

        if (url.includes('/api/discovery/search')) {
          return new Response(
            JSON.stringify({
              items: discoveryItems,
              query: 'tumor board',
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
              items: discoveryItems,
            }),
            {
              headers: { 'Content-Type': 'application/json' },
              status: 200,
            },
          );
        }

        if (url.endsWith('/api/session/me')) {
          return new Response(
            JSON.stringify({
              user: {
                displayName: 'Alice',
                email: 'alice@example.test',
                id: 'user-alice',
              },
            }),
            {
              headers: { 'Content-Type': 'application/json' },
              status: 200,
            },
          );
        }

        if (url.endsWith('/api/home-cockpit')) {
          return new Response(
            JSON.stringify({
              actor: {
                displayName: 'Alice',
                email: 'alice@example.test',
                id: 'user-alice',
              },
              contract: 'jixia-home-cockpit-contract',
              generatedAt: '2026-05-17T12:00:00.000Z',
              nextActions: [],
              notices: [],
              recentActivity: [],
              sections: [
                {
                  description: 'Server-visible spaces and project memberships define collaboration access.',
                  id: 'collaboration',
                  metrics: [{ label: 'Visible projects', value: 1 }],
                  primaryAction: {
                    description: 'Review visible project workspaces.',
                    id: 'open-projects',
                    label: 'Open Projects',
                    priority: 'primary',
                    to: '/projects',
                  },
                  status: 'active',
                  title: 'Collaboration cockpit',
                },
                {
                  description: 'Personal Library entries are ready for reading and project adoption.',
                  id: 'library',
                  metrics: [{ label: 'Personal sources', value: personalLibraryEntries.length }],
                  primaryAction: {
                    description: 'Continue from server-owned personal sources.',
                    id: 'open-library',
                    label: 'Open Library',
                    priority: 'primary',
                    to: '/library',
                  },
                  status: personalLibraryEntries.length > 0 ? 'active' : 'empty',
                  title: 'Literature and reading',
                },
                {
                  description: 'Private notebooks and project Writer drafts are available through server document contracts.',
                  id: 'writing',
                  metrics: [{ label: 'Private notebooks', value: notebooks.length }],
                  primaryAction: {
                    description: 'Return to private synthesis.',
                    id: 'open-notebook',
                    label: 'Open Notebook',
                    priority: 'primary',
                    to: '/notebook',
                  },
                  status: notebooks.length > 0 ? 'active' : 'empty',
                  title: 'Writing and versioning',
                },
                {
                  description: 'Configure provider credentials before running governed AI jobs.',
                  id: 'jobs',
                  metrics: [{ label: 'Personal jobs', value: 0 }],
                  primaryAction: {
                    description: 'Set up a credential reference before launching jobs.',
                    id: 'configure-credentials',
                    label: 'Configure credentials',
                    priority: 'primary',
                    to: '/settings',
                  },
                  status: 'empty',
                  title: 'Governed jobs',
                },
              ],
              workbench: {
                label: 'Personal workbench',
                route: '/home',
                scope: { id: 'user-alice', type: 'user' },
              },
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

        if (url.endsWith('/api/notebooks') && (!init?.method || init.method === 'GET')) {
          return new Response(
            JSON.stringify({ documents: notebooks }),
            {
              headers: { 'Content-Type': 'application/json' },
              status: 200,
            },
          );
        }

        if (url.endsWith('/api/notebooks') && init?.method === 'POST') {
          const body = JSON.parse(String(init.body)) as { title: string };
          const document = {
            createdAt: '2026-03-23T00:30:00.000Z',
            id: `notebook-${notebooks.length + 1}`,
            ownerId: 'user-alice',
            title: body.title,
            updatedAt: '2026-03-23T00:30:00.000Z',
          };
          notebooks.unshift(document);
          notebookContent = '';
          notebookDocumentContent = { blocks: [], schemaVersion: 1 };

          return new Response(JSON.stringify(document), {
            headers: { 'Content-Type': 'application/json' },
            status: 200,
          });
        }

        if (url.endsWith('/api/notebooks/notebook-1/snapshot') && (!init?.method || init.method === 'GET')) {
          return new Response(
            JSON.stringify({
              capturedAt: '2026-03-23T00:00:00.000Z',
              citations: [],
              content: notebookContent,
              documentContent: notebookDocumentContent,
              document: notebooks.find((notebook) => notebook.id === 'notebook-1'),
              versionId: 'notebook-version-1',
              versionNumber: 1,
            }),
            {
              headers: { 'Content-Type': 'application/json' },
              status: 200,
            },
          );
        }

        if (url.endsWith('/api/notebooks/notebook-1/versions') && init?.method === 'POST') {
          const body = JSON.parse(String(init.body)) as {
            content?: string;
            documentContent?: typeof notebookDocumentContent;
          };
          expect(body).not.toHaveProperty('content');
          expectDocumentBlocksToOmitAuthorityFields(body.documentContent);
          expect(body.documentContent).toEqual({
            blocks: [
              {
                text: 'Saved private Notebook content',
                type: 'paragraph',
              },
            ],
            schemaVersion: 1,
          });
          notebookDocumentContent = body.documentContent ?? { blocks: [], schemaVersion: 1 };
          notebookContent = notebookDocumentContent.blocks[0]?.text ?? '';

          return new Response(
            JSON.stringify({
              capturedAt: '2026-03-23T00:40:00.000Z',
              citations: [],
              content: notebookContent,
              documentContent: notebookDocumentContent,
              document: notebooks.find((notebook) => notebook.id === 'notebook-1'),
              versionId: 'notebook-version-2',
              versionNumber: 2,
            }),
            {
              headers: { 'Content-Type': 'application/json' },
              status: 200,
            },
          );
        }

        if (url.endsWith('/api/projects')) {
          return new Response(JSON.stringify([projectFixture]), {
            headers: { 'Content-Type': 'application/json' },
            status: 200,
          });
        }

        if (url.endsWith('/api/projects/project-alpha/members')) {
          return new Response(JSON.stringify([projectFixture.membership]), {
            headers: { 'Content-Type': 'application/json' },
            status: 200,
          });
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

    await screen.findByRole('link', { name: '搜索' });
    await user.click(screen.getByRole('link', { name: '搜索' }));
    expect(screen.getByRole('heading', { name: '外部搜索' })).toBeInTheDocument();
    await user.clear(screen.getByLabelText('检索主题'));
    await user.type(screen.getByLabelText('检索主题'), 'tumor board');
    await user.click(screen.getByRole('button', { name: '检索 PubMed' }));
    expect(
      await screen.findByRole('heading', { name: 'Tumor board biomarkers for rapid review' }),
    ).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: '导入到个人 Library' }));
    expect(await screen.findByText('Imported into personal library')).toBeInTheDocument();

    await user.click(screen.getByRole('link', { name: 'Library' }));
    expect(screen.getByRole('heading', { name: 'Library' })).toBeInTheDocument();
    expect(
      await screen.findByRole('heading', { name: 'Tumor board biomarkers for rapid review' }),
    ).toBeInTheDocument();

    await user.click(screen.getByRole('link', { name: 'Notebook' }));
    expect(screen.getByRole('heading', { name: 'Notebook' })).toBeInTheDocument();
    expect(await screen.findByRole('button', { name: 'Private synthesis notebook' })).toBeInTheDocument();
    expect(screen.getByRole('textbox', { name: 'Paragraph block 1' })).toHaveValue('Initial private Notebook content');
    await user.clear(screen.getByRole('textbox', { name: 'Paragraph block 1' }));
    await user.type(screen.getByRole('textbox', { name: 'Paragraph block 1' }), 'Saved private Notebook content');
    await user.click(screen.getByRole('button', { name: 'Save Notebook' }));
    expect(await screen.findByText(/Saved Private synthesis notebook version 2/)).toBeInTheDocument();

    await user.click(screen.getByRole('link', { name: 'Projects' }));
    expect(screen.getByRole('heading', { name: '项目工作台' })).toBeInTheDocument();

    await user.click(screen.getByRole('link', { name: '设置' }));
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
        credentials: 'same-origin',
        headers: expect.objectContaining({
          'Content-Type': 'application/json',
        }),
        method: 'POST',
      }),
    );

    await user.click(screen.getByRole('link', { name: '今日推荐' }));
    expect(screen.getByRole('heading', { name: '今日推荐' })).toBeInTheDocument();
    expect(
      await screen.findByRole('heading', { name: 'Tumor board biomarkers for rapid review' }),
    ).toBeInTheDocument();
  });
});
