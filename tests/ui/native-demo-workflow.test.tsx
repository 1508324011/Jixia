import { readFileSync } from 'node:fs';

import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { App } from '../../src/web/app';

const RUNBOOK_PATH = 'docs/runbooks/native-demo-showcase.md';

function jsonResponse(payload: unknown): Response {
  return new Response(JSON.stringify(payload), {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
    },
    status: 200,
  });
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('native demo workflow', () => {
  it('renders fetched spaces instead of placeholder showcase cards', async () => {
    window.history.replaceState({}, '', '/spaces');

    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string | URL | Request) => {
        const requestUrl =
          typeof input === 'string'
            ? input
            : input instanceof URL
              ? input.toString()
              : input.url;

        if (requestUrl.endsWith('/api/spaces')) {
          return jsonResponse({
            spaces: [
              {
                importLocator: 'pmid:123456',
                kind: 'shared',
                name: 'Tumor Board Shared Space',
                projectId: 'tumor-board',
                spaceId: 'shared-space',
                visibility: 'space_shared',
              },
            ],
          });
        }

        throw new Error(`Unexpected fetch: ${requestUrl}`);
      }),
    );

    render(<App />);

    expect(await screen.findByText('Tumor Board Shared Space')).toBeInTheDocument();
    expect(screen.getByText('Project starter · tumor-board')).toBeInTheDocument();
    expect(screen.getByText('Import anchor · pmid:123456')).toBeInTheDocument();
    expect(
      screen.queryByText('Placeholder shell for the next Task 11 step.'),
    ).not.toBeInTheDocument();
  });

  it('creates a personal space from /spaces and opens its library route', async () => {
    const user = userEvent.setup();

    window.history.replaceState({}, '', '/spaces');

    const spaces = [
      {
        importLocator: 'pmid:123456',
        kind: 'shared',
        name: 'Tumor Board Shared Space',
        projectId: 'tumor-board',
        spaceId: 'shared-space',
        visibility: 'space_shared',
      },
    ];

    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
        const requestUrl =
          typeof input === 'string'
            ? input
            : input instanceof URL
              ? input.toString()
              : input.url;

        if (requestUrl.endsWith('/api/spaces') && (!init?.method || init.method === 'GET')) {
          return jsonResponse({ spaces });
        }

        if (requestUrl.endsWith('/api/spaces') && init?.method === 'POST') {
          const body = JSON.parse(String(init.body)) as {
            kind: 'personal' | 'shared';
            name: string;
          };

          expect(body).toEqual({
            kind: 'personal',
            name: 'Genomics Sandbox',
          });

          const createdSpace = {
            importLocator: 'pmid:123456',
            kind: 'personal' as const,
            name: 'Genomics Sandbox',
            projectId: 'tumor-board',
            spaceId: 'space-2',
            visibility: 'space_shared',
          };

          spaces.push(createdSpace);

          return new Response(JSON.stringify({ space: createdSpace }), {
            headers: {
              'Content-Type': 'application/json; charset=utf-8',
            },
            status: 201,
          });
        }

        if (
          requestUrl.endsWith('/api/spaces/space-2/projects/tumor-board/library') &&
          (!init?.method || init.method === 'GET')
        ) {
          return jsonResponse({ entries: [] });
        }

        throw new Error(`Unexpected fetch: ${requestUrl}`);
      }),
    );

    render(<App />);

    expect(await screen.findByText('Tumor Board Shared Space')).toBeInTheDocument();

    await user.type(screen.getByRole('textbox', { name: 'Space name' }), 'Genomics Sandbox');
    await user.selectOptions(screen.getByRole('combobox', { name: 'Space kind' }), 'personal');
    await user.click(screen.getByRole('button', { name: 'Create space' }));

    expect(await screen.findByText('Genomics Sandbox')).toBeInTheDocument();

    await user.click(screen.getByRole('link', { name: 'Open library' }));

    expect(window.location.pathname).toBe('/projects/tumor-board/library');
    expect(window.location.search).toBe('?spaceId=space-2');
  });

  it('renders fetched library data instead of placeholder demo copy', async () => {
    window.history.replaceState(
      {},
      '',
      '/spaces/shared-space/projects/tumor-board/library',
    );

    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string | URL | Request) => {
        const requestUrl =
          typeof input === 'string'
            ? input
            : input instanceof URL
              ? input.toString()
              : input.url;

        if (requestUrl.endsWith('/api/spaces')) {
          return jsonResponse({
            spaces: [
              {
                kind: 'shared',
                name: 'Tumor Board Shared Space',
                spaceId: 'shared-space',
              },
            ],
          });
        }

        if (
          requestUrl.endsWith('/api/spaces/shared-space/projects/tumor-board/library')
        ) {
          return jsonResponse({
            entries: [
              {
                entryId: 'entry-1',
                title: 'Imported PMID paper 123456',
              },
            ],
          });
        }

        throw new Error(`Unexpected fetch: ${requestUrl}`);
      }),
    );

    render(<App />);

    expect(await screen.findByText('Imported PMID paper 123456')).toBeInTheDocument();
    expect(screen.queryByText('Loading state placeholder')).not.toBeInTheDocument();
    expect(screen.queryByText('Empty shelf placeholder')).not.toBeInTheDocument();
  });

  it('imports a paper from the library page and shows the new entry', async () => {
    const user = userEvent.setup();

    window.history.replaceState(
      {},
      '',
      '/spaces/shared-space/projects/tumor-board/library',
    );

    const entries = [
      {
        canonicalId: 'pmid:123456',
        entryId: 'entry-1',
        title: 'Imported PMID paper 123456',
        visibility: 'space_shared',
      },
    ];

    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
        const requestUrl =
          typeof input === 'string'
            ? input
            : input instanceof URL
              ? input.toString()
              : input.url;

        if (requestUrl.endsWith('/api/spaces')) {
          return jsonResponse({
            spaces: [
              {
                importLocator: 'pmid:123456',
                kind: 'shared',
                name: 'Tumor Board Shared Space',
                projectId: 'tumor-board',
                spaceId: 'shared-space',
                visibility: 'space_shared',
              },
            ],
          });
        }

        if (
          requestUrl.endsWith('/api/spaces/shared-space/projects/tumor-board/library') &&
          (!init?.method || init.method === 'GET')
        ) {
          return jsonResponse({ entries });
        }

        if (
          requestUrl.endsWith('/api/spaces/shared-space/import') &&
          init?.method === 'POST'
        ) {
          const body = JSON.parse(String(init.body)) as {
            sourceLocator: string;
            sourceType: string;
          };

          expect(body).toEqual({
            sourceLocator: '654321',
            sourceType: 'pmid',
            visibility: 'space_shared',
          });

          entries.push({
            canonicalId: 'pmid:654321',
            entryId: 'entry-2',
            title: 'Imported PMID paper 654321',
            visibility: 'space_shared',
          });

          return new Response(
            JSON.stringify({
              asset: {
                canonicalId: 'pmid:654321',
                id: 'asset-pmid-654321',
                title: 'Imported PMID paper 654321',
              },
              entry: {
                id: 'entry-2',
                paperAssetId: 'asset-pmid-654321',
                spaceId: 'shared-space',
                visibility: 'space_shared',
              },
            }),
            {
              headers: {
                'Content-Type': 'application/json; charset=utf-8',
              },
              status: 201,
            },
          );
        }

        throw new Error(`Unexpected fetch: ${requestUrl}`);
      }),
    );

    render(<App />);

    expect(await screen.findByText('Imported PMID paper 123456')).toBeInTheDocument();

    await user.clear(screen.getByRole('textbox', { name: 'Import locator' }));
    await user.type(screen.getByRole('textbox', { name: 'Import locator' }), '654321');
    await user.click(screen.getByRole('button', { name: 'Import paper' }));

    expect(await screen.findByText('Imported PMID paper 654321')).toBeInTheDocument();
  });

  it('routes reader, private notes, and project docs through separate surfaces', async () => {
    const user = userEvent.setup();

    window.history.replaceState(
      {},
      '',
      '/projects/tumor-board/library/entry-1/reader',
    );

    const readingResponse = {
      asset: {
        abstractText: 'Imported PMID metadata for 123456',
        canonicalId: 'pmid:123456',
        id: 'asset-pmid-123456',
        title: 'Imported PMID paper 123456',
      },
      entry: {
        id: 'entry-1',
        visibility: 'space_shared',
      },
      insights: [] as Array<{
        conversationId: string;
        createdAt: string;
        evidenceSpans: Array<never>;
        id: string;
        libraryEntryId: string;
        summary: string;
      }>,
      notes: [] as Array<{
        authorUserId: string;
        body: string;
        createdAt: string;
        id: string;
        libraryEntryId: string;
        visibility: string;
      }>,
    };
    const documentResponse = {
      document: {
        documentId: 'doc-1',
        latestSnapshot: {
          capturedAt: '2026-03-22T00:00:00.000Z',
          citations: [],
          content: 'Initial seeded paragraph.',
          doc: {
            createdAt: '2026-03-22T00:00:00.000Z',
            id: 'doc-1',
            publishState: 'draft',
            spaceId: 'shared-space',
            title: 'Tumor board synthesis',
          },
          docVersionId: 'doc-version-1',
        },
        projectId: 'tumor-board',
        publishState: 'draft',
        references: [] as Array<{
          createdAt: string;
          documentId: string;
          id: string;
          ownerType: 'project';
          paperAssetId: string;
          projectId: string;
          selectedText: string;
          sourceKind: 'projection';
          sourceType: 'notebook-note';
        }>,
        spaceId: 'shared-space',
        title: 'Tumor board synthesis',
      },
    };

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
          requestUrl.endsWith('/api/reading/entry-1') &&
          (!init?.method || init.method === 'GET')
        ) {
          return jsonResponse(readingResponse);
        }

        if (
          requestUrl.endsWith('/api/reading/entry-1?spaceId=shared-space') &&
          (!init?.method || init.method === 'GET')
        ) {
          return jsonResponse(readingResponse);
        }

        if (
          requestUrl.endsWith('/api/writing/shared-space/projects/tumor-board/document') &&
          (!init?.method || init.method === 'GET')
        ) {
          return jsonResponse(documentResponse);
        }

        if (
          requestUrl.endsWith('/api/reading/entry-1/notes') &&
          init?.method === 'POST'
        ) {
          const body = JSON.parse(String(init.body)) as {
            body: string;
            visibility?: 'private' | 'space_shared';
          };

          readingResponse.notes.push({
            authorUserId: 'demo-operator',
            body: body.body,
            createdAt: '2026-03-22T01:00:00.000Z',
            id: `note-${readingResponse.notes.length + 1}`,
            libraryEntryId: 'entry-1',
            visibility: body.visibility ?? 'space_shared',
          });

          return jsonResponse({ note: readingResponse.notes.at(-1) });
        }

        if (
          requestUrl.endsWith('/api/reading/entry-1/notes?spaceId=shared-space') &&
          init?.method === 'POST'
        ) {
          const body = JSON.parse(String(init.body)) as {
            body: string;
            visibility?: 'private' | 'space_shared';
          };

          readingResponse.notes.push({
            authorUserId: 'demo-operator',
            body: body.body,
            createdAt: '2026-03-22T01:00:00.000Z',
            id: `note-${readingResponse.notes.length + 1}`,
            libraryEntryId: 'entry-1',
            visibility: body.visibility ?? 'space_shared',
          });

          return jsonResponse({ note: readingResponse.notes.at(-1) });
        }

        if (
          requestUrl.endsWith('/api/projects/tumor-board/docs/doc-1/references') &&
          init?.method === 'POST'
        ) {
          const body = JSON.parse(String(init.body)) as {
            noteId: string;
            notebookId: string;
            paperAssetId: string;
            selectedText: string;
          };

          documentResponse.document.references.push({
            createdAt: '2026-03-22T01:05:00.000Z',
            documentId: 'doc-1',
            id: `reference-${documentResponse.document.references.length + 1}`,
            ownerType: 'project',
            paperAssetId: body.paperAssetId,
            projectId: 'tumor-board',
            selectedText: body.selectedText,
            sourceKind: 'projection',
            sourceType: 'notebook-note',
          });

          return jsonResponse({ reference: documentResponse.document.references.at(-1) });
        }

        throw new Error(`Unexpected fetch: ${requestUrl}`);
      }),
    );

    render(<App />);

    expect(await screen.findByText('Imported PMID paper 123456')).toBeInTheDocument();
    expect(screen.getByText('Imported PMID metadata for 123456')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Promote latest insight to Writer' })).not.toBeInTheDocument();

    await user.click(screen.getByRole('link', { name: 'Open notes workspace' }));

    expect(await screen.findByRole('heading', { name: 'Notes workspace' })).toBeInTheDocument();

    await user.type(
      screen.getByRole('textbox', {
        name: 'Private note for “What changes my interpretation of this paper?”',
      }),
      'Key mutation note',
    );
    await user.click(screen.getByRole('button', { name: 'Save private note' }));

    expect(await screen.findByText('Key mutation note')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Insert into project docs' }));

    expect(await screen.findByText('Project-owned reference created.')).toBeInTheDocument();

    await user.click(screen.getByRole('link', { name: 'Open project docs' }));

    expect(await screen.findByRole('heading', { name: 'Project docs' })).toBeInTheDocument();
    expect(screen.getByDisplayValue('Initial seeded paragraph.')).toBeInTheDocument();
    expect(screen.getByText('Reference rail')).toBeInTheDocument();
    expect(screen.getByText('Key mutation note')).toBeInTheDocument();
  });

  it('keeps imported search results inside stable source lanes while updating import state in place', async () => {
    const user = userEvent.setup();

    window.history.replaceState({}, '', '/search');

    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
        const requestUrl =
          typeof input === 'string'
            ? input
            : input instanceof URL
              ? input.toString()
              : input.url;

        if (requestUrl.includes('/api/discovery/search')) {
          return jsonResponse({
            boards: [
              {
                id: 'pubmed-board',
                items: [
                  {
                    abstractText: 'Curated abstract snippet for rapid triage.',
                    canonicalId: 'pmid:654321',
                    id: 'pubmed-result',
                    imported: false,
                    objectType: 'external-candidate',
                    reason: 'PubMed result matched the tumor board intake query.',
                    sourceLabel: 'PubMed',
                    sourceLocator: '654321',
                    sourceType: 'pmid',
                    state: 'new',
                    title: 'Tumor board biomarkers for rapid review',
                  },
                ],
                title: 'PubMed',
              },
              {
                id: 'arxiv-board',
                items: [
                  {
                    abstractText: 'Preprint abstract focused on multimodal intake signals.',
                    canonicalId: 'arxiv:2403.12345',
                    id: 'arxiv-result',
                    imported: false,
                    objectType: 'external-candidate',
                    reason: 'arXiv preprint extends the project’s intake horizon.',
                    sourceLabel: 'arXiv',
                    sourceLocator: '2403.12345',
                    sourceType: 'arxiv',
                    state: 'new',
                    title: 'Multimodal evidence triage for tumor boards',
                  },
                ],
                title: 'arXiv',
              },
            ],
            hasNextPage: true,
            items: [],
            page: 1,
            pageSize: 2,
            query: 'tumor board',
            total: 12,
          });
        }

        if (requestUrl.endsWith('/api/library/personal/import') && init?.method === 'POST') {
          return jsonResponse({
            asset: {
              canonicalId: 'pmid:654321',
              id: 'asset-1',
              title: 'Tumor board biomarkers for rapid review',
            },
            entry: {
              id: 'entry-1',
              paperAssetId: 'asset-1',
              spaceId: 'personal-space-user-alice',
              visibility: 'private',
            },
          });
        }

        throw new Error(`Unexpected fetch: ${requestUrl}`);
      }),
    );

    render(<App />);

    await user.click(screen.getByRole('button', { name: 'Search intake boards' }));

    const pubmedLane = await screen.findByRole('region', { name: 'PubMed intake lane' });
    expect(within(pubmedLane).getByText('Curated abstract snippet for rapid triage.')).toBeInTheDocument();
    expect(screen.getByText('Showing 1-2 of 12')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Next page' })).toBeInTheDocument();

    await user.click(within(pubmedLane).getByRole('button', { name: '导入到个人 Library' }));

    expect(
      await within(pubmedLane).findByRole('button', { name: '已进入个人 Library' }),
    ).toBeDisabled();
    expect(screen.getByRole('region', { name: 'arXiv intake lane' })).toBeInTheDocument();
  });

  it('loads a created-space reader by scoping requests to the selected space', async () => {
    window.history.replaceState(
      {},
      '',
      '/projects/tumor-board/library/entry-2/reader?spaceId=space-2',
    );

    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string | URL | Request) => {
        const requestUrl =
          typeof input === 'string'
            ? input
            : input instanceof URL
              ? input.toString()
              : input.url;

        if (requestUrl.endsWith('/api/reading/entry-2?spaceId=space-2')) {
          return jsonResponse({
            asset: {
              abstractText: 'Imported PMID metadata for 789012',
              canonicalId: 'pmid:789012',
              id: 'asset-pmid-789012',
              title: 'Imported PMID paper 789012',
            },
            entry: {
              id: 'entry-2',
              visibility: 'space_shared',
            },
            insights: [],
            notes: [],
          });
        }

        if (requestUrl.endsWith('/api/spaces/space-2/governed-summary')) {
          return jsonResponse({ governedJob: null });
        }

        throw new Error(`Unexpected fetch: ${requestUrl}`);
      }),
    );

    render(<App />);

    expect(await screen.findByText('Imported PMID paper 789012')).toBeInTheDocument();
    expect(screen.getByText('Imported PMID metadata for 789012')).toBeInTheDocument();
    expect(screen.getByText('Space context · space-2')).toBeInTheDocument();
  });

  it('loads, saves, reloads, and publishes the writing document through browser fetch calls', async () => {
    const user = userEvent.setup();

    window.history.replaceState(
      {},
      '',
      '/projects/tumor-board/writing/doc-1',
    );

    const documentResponse = {
      document: {
        documentId: 'doc-1',
        latestSnapshot: {
          capturedAt: '2026-03-22T00:00:00.000Z',
          citations: [
            {
              docVersionId: 'doc-version-1',
              id: 'citation-1',
              paperAssetId: 'asset-pmid-123456',
            },
          ],
          content: 'Initial seeded paragraph.',
          doc: {
            createdAt: '2026-03-22T00:00:00.000Z',
            id: 'doc-1',
            publishState: 'draft',
            spaceId: 'shared-space',
            title: 'Tumor board synthesis',
          },
          docVersionId: 'doc-version-1',
        },
        projectId: 'tumor-board',
        publishState: 'draft',
        spaceId: 'shared-space',
        title: 'Tumor board synthesis',
      },
    };
    const governedSummaryResponse: {
      governedJob: null | {
        audits: Array<{ action: string; detail: string; id: string; recordedAt: string }>;
        events: Array<{ id: string; message: string; recordedAt: string; status: string }>;
        job: {
          createdAt: string;
          credentialRef: string;
          id: string;
          kind: string;
          status: string;
        };
      };
    } = {
      governedJob: null,
    };

    vi.stubGlobal(
      'fetch',
      vi.fn(
        async (input: string | URL | Request, init?: RequestInit) => {
          const requestUrl =
            typeof input === 'string'
              ? input
              : input instanceof URL
                ? input.toString()
                : input.url;

          if (
            requestUrl.endsWith('/api/writing/shared-space/projects/tumor-board/document') &&
            (!init?.method || init.method === 'GET')
          ) {
            return jsonResponse(documentResponse);
          }

          if (
            requestUrl.endsWith('/api/spaces/shared-space/governed-summary') &&
            (!init?.method || init.method === 'GET')
          ) {
            return jsonResponse(governedSummaryResponse);
          }

          if (
            requestUrl.endsWith('/api/spaces/shared-space/governed-summary') &&
            init?.method === 'POST'
          ) {
            governedSummaryResponse.governedJob = {
              audits: [
                {
                  action: 'job.created',
                  detail: 'Created ai.summary with credential cred-demo.',
                  id: 'audit-1',
                  recordedAt: '2026-03-22T01:10:00.000Z',
                },
                {
                  action: 'job.completed',
                  detail: 'Completed ai.summary with credential cred-demo.',
                  id: 'audit-2',
                  recordedAt: '2026-03-22T01:12:00.000Z',
                },
              ],
              events: [
                {
                  id: 'job-event-1',
                  message: 'ai.summary queued for execution.',
                  recordedAt: '2026-03-22T01:10:00.000Z',
                  status: 'queued',
                },
                {
                  id: 'job-event-2',
                  message: 'Running ai.summary with openai.',
                  recordedAt: '2026-03-22T01:11:00.000Z',
                  status: 'running',
                },
                {
                  id: 'job-event-3',
                  message: 'ai.summary completed successfully.',
                  recordedAt: '2026-03-22T01:12:00.000Z',
                  status: 'succeeded',
                },
              ],
              job: {
                createdAt: '2026-03-22T01:10:00.000Z',
                credentialRef: 'cred-demo',
                id: 'job-1',
                kind: 'ai.summary',
                status: 'succeeded',
              },
            };

            return jsonResponse(governedSummaryResponse);
          }

          if (
            requestUrl.endsWith('/api/writing/shared-space/projects/tumor-board/document') &&
            init?.method === 'POST'
          ) {
            const body = JSON.parse(String(init.body)) as { content: string };

            documentResponse.document.latestSnapshot = {
              ...documentResponse.document.latestSnapshot,
              capturedAt: '2026-03-22T01:00:00.000Z',
              content: body.content,
              doc: {
                ...documentResponse.document.latestSnapshot.doc,
                publishState: documentResponse.document.publishState,
              },
              docVersionId: 'doc-version-2',
            };

            return jsonResponse(documentResponse);
          }

          if (
            requestUrl.endsWith('/api/writing/doc-1/publish?spaceId=shared-space') &&
            init?.method === 'POST'
          ) {
            documentResponse.document.publishState = 'published';
            documentResponse.document.latestSnapshot = {
              ...documentResponse.document.latestSnapshot,
              doc: {
                ...documentResponse.document.latestSnapshot.doc,
                publishState: 'published',
              },
            };

            return jsonResponse(documentResponse);
          }

          throw new Error(`Unexpected fetch: ${requestUrl}`);
        },
      ),
    );

    render(<App />);

    expect(await screen.findByDisplayValue('Initial seeded paragraph.')).toBeInTheDocument();

    const editor = screen.getByRole('textbox', { name: 'Draft content' });
    await user.clear(editor);
    await user.type(editor, 'Updated tumor board synthesis.');
    await user.click(screen.getByRole('button', { name: 'Save draft' }));

    expect(await screen.findByDisplayValue('Updated tumor board synthesis.')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Reload draft' }));

    expect(await screen.findByDisplayValue('Updated tumor board synthesis.')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Publish' }));

    expect(await screen.findByText('published')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Run governed summary' }));

    expect(await screen.findByText('job.created')).toBeInTheDocument();
    expect(screen.getByText('job.completed')).toBeInTheDocument();
    expect(screen.getByText('queued')).toBeInTheDocument();
    expect(screen.getByText('succeeded')).toBeInTheDocument();
    expect(screen.queryByText('Draft canvas')).not.toBeInTheDocument();
  });

  it('loads, saves, reloads, and publishes a created-space writing document', async () => {
    const user = userEvent.setup();

    window.history.replaceState(
      {},
      '',
      '/projects/tumor-board/writing/doc-2?spaceId=space-2',
    );

    const documentResponse = {
      document: {
        documentId: 'doc-2',
        latestSnapshot: {
          capturedAt: '2026-03-22T02:00:00.000Z',
          citations: [],
          content: 'Created space draft.',
          doc: {
            createdAt: '2026-03-22T02:00:00.000Z',
            id: 'doc-2',
            publishState: 'draft',
            spaceId: 'space-2',
            title: 'Created space synthesis',
          },
          docVersionId: 'doc-version-20',
        },
        projectId: 'tumor-board',
        publishState: 'draft',
        spaceId: 'space-2',
        title: 'Created space synthesis',
      },
    };

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
          requestUrl.endsWith('/api/writing/space-2/projects/tumor-board/document') &&
          (!init?.method || init.method === 'GET')
        ) {
          return jsonResponse(documentResponse);
        }

        if (
          requestUrl.endsWith('/api/spaces/space-2/governed-summary') &&
          (!init?.method || init.method === 'GET')
        ) {
          return jsonResponse({ governedJob: null });
        }

        if (
          requestUrl.endsWith('/api/writing/space-2/projects/tumor-board/document') &&
          init?.method === 'POST'
        ) {
          const body = JSON.parse(String(init.body)) as { content: string };

          documentResponse.document.latestSnapshot = {
            ...documentResponse.document.latestSnapshot,
            capturedAt: '2026-03-22T02:10:00.000Z',
            content: body.content,
            doc: {
              ...documentResponse.document.latestSnapshot.doc,
              publishState: documentResponse.document.publishState,
            },
            docVersionId: 'doc-version-21',
          };

          return jsonResponse(documentResponse);
        }

        if (
          requestUrl.endsWith('/api/writing/doc-2/publish?spaceId=space-2') &&
          init?.method === 'POST'
        ) {
          documentResponse.document.publishState = 'published';
          documentResponse.document.latestSnapshot = {
            ...documentResponse.document.latestSnapshot,
            doc: {
              ...documentResponse.document.latestSnapshot.doc,
              publishState: 'published',
            },
          };

          return jsonResponse(documentResponse);
        }

        throw new Error(`Unexpected fetch: ${requestUrl}`);
      }),
    );

    render(<App />);

    expect(await screen.findByDisplayValue('Created space draft.')).toBeInTheDocument();
    expect(screen.getByText('Space context · space-2')).toBeInTheDocument();

    const editor = screen.getByRole('textbox', { name: 'Draft content' });
    await user.clear(editor);
    await user.type(editor, 'Created space synthesis after review.');
    await user.click(screen.getByRole('button', { name: 'Save draft' }));

    expect(
      await screen.findByDisplayValue('Created space synthesis after review.'),
    ).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Reload draft' }));
    expect(
      await screen.findByDisplayValue('Created space synthesis after review.'),
    ).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Publish' }));
    expect(await screen.findByText('published')).toBeInTheDocument();
  });

  it('keeps the runbook wording aligned with the native showcase controls', () => {
    const runbook = readFileSync(RUNBOOK_PATH, 'utf8');

    expect(runbook).toContain('Home -> Projects -> Notebooks -> Reader -> Project Docs');
    expect(runbook).toContain('Genomics Sandbox');
    expect(runbook).toContain('Research workbench');
    expect(runbook).toContain('Open tumor board workspace');
    expect(runbook).toContain('Open active notebook');
    expect(runbook).toContain('Open related reader');
    expect(runbook).toContain('Back to notebook');
    expect(runbook).toContain('Insert into project docs');
    expect(runbook).toContain('Open project docs');
    expect(runbook).toContain('Back to project');
    expect(runbook).not.toContain('Home -> Intake -> Library -> Reader -> Notes Workspace -> Project Docs');
    expect(runbook).not.toContain('browser-facing `quote / insert helper`');
    expect(runbook).not.toContain('browser users can yet create projected references');
  });
});
