import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { App } from '../../src/web/app';

import { expectDocumentBlocksToOmitAuthorityFields } from './document-block-assertions';

function renderWorkbench(pathname: string) {
  window.history.replaceState({}, '', pathname);
  render(<App />);
}

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
    },
    status,
  });
}

function createDeferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (error?: unknown) => void;

  const promise = new Promise<T>((nextResolve, nextReject) => {
    resolve = nextResolve;
    reject = nextReject;
  });

  return { promise, reject, resolve };
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('project writer flow', () => {
  it('project page shows Writer onboarding when no known project document id exists', async () => {
    const projectFixture = {
      membership: {
        joinedAt: '2026-03-23T00:35:00.000Z',
        projectId: 'project-1',
        role: 'owner',
        userId: 'user-alice',
      },
      project: {
        createdAt: '2026-03-23T00:35:00.000Z',
        createdByUserId: 'user-alice',
        id: 'project-1',
        name: 'Tumor board project',
        spaceId: 'personal-space-user-alice',
        status: 'active',
        updatedAt: '2026-03-23T00:35:00.000Z',
      },
    };

    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string | URL | Request) => {
        const requestUrl =
          typeof input === 'string'
            ? input
            : input instanceof URL
              ? input.toString()
              : input.url;

        if (requestUrl.endsWith('/api/session/me')) {
          return jsonResponse({
            user: {
              displayName: 'Alice',
              email: 'alice@example.test',
              id: 'user-alice',
            },
          });
        }

        if (requestUrl.endsWith('/api/projects')) {
          return jsonResponse([projectFixture]);
        }

        if (requestUrl.endsWith('/api/projects/project-1/writing-document')) {
          return jsonResponse(null);
        }

        throw new Error(`Unexpected fetch: ${requestUrl}`);
      }),
    );

    renderWorkbench('/projects/project-1');

    expect(await screen.findByText('Writer 文档区')).toBeInTheDocument();
    expect(await screen.findByText('No Writer draft selected yet')).toBeInTheDocument();
    expect(
      screen.getByText('Promote a governed Reader insight to create a project document before reopening it here.'),
    ).toBeInTheDocument();
  });

  it('writing page reopens the promoted writer draft and saves updates', async () => {
    const user = userEvent.setup();
    const projectFixture = {
      membership: {
        joinedAt: '2026-03-23T00:35:00.000Z',
        projectId: 'project-1',
        role: 'owner',
        userId: 'user-alice',
      },
      project: {
        createdAt: '2026-03-23T00:35:00.000Z',
        createdByUserId: 'user-alice',
        id: 'project-1',
        name: 'Tumor board project',
        spaceId: 'personal-space-user-alice',
        status: 'active',
        updatedAt: '2026-03-23T00:35:00.000Z',
      },
    };
    const documentState = {
      capturedAt: '2026-03-23T00:40:00.000Z',
      citations: [
        {
          createdAt: '2026-03-23T00:40:00.000Z',
          evidenceSpan: 'Tumor board evidence',
          id: 'citation-1',
          paperAssetId: 'asset-1',
          projectDocVersionId: 'project-doc-version-1',
        },
      ],
      content: 'Promoted governed insight paragraph.',
      documentContent: {
        blocks: [
          {
            text: 'Promoted governed insight paragraph.',
            type: 'paragraph',
          },
        ],
        schemaVersion: 1,
      },
      document: {
        createdAt: '2026-03-23T00:35:00.000Z',
        createdByUserId: 'user-alice',
        id: 'doc-project-1',
        projectId: 'project-1',
        publishState: 'draft',
        title: 'Tumor board literature synthesis',
        updatedAt: '2026-03-23T00:35:00.000Z',
      },
      versionId: 'project-doc-version-1',
      versionNumber: 1,
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

        if (requestUrl.endsWith('/api/session/me')) {
          return jsonResponse({
            user: {
              displayName: 'Alice',
              email: 'alice@example.test',
              id: 'user-alice',
            },
          });
        }

        if (requestUrl.endsWith('/api/projects')) {
          return jsonResponse([projectFixture]);
        }

        if (requestUrl.endsWith('/api/projects/project-1/writing-document')) {
          return jsonResponse(documentState.document);
        }

        if (requestUrl.endsWith('/api/project-docs/doc-project-1') && (!init?.method || init.method === 'GET')) {
          return jsonResponse(documentState);
        }

        if (requestUrl.endsWith('/api/project-docs/doc-project-1/versions') && init?.method === 'POST') {
          const body = JSON.parse(String(init.body)) as {
            content?: string;
            documentContent: typeof documentState.documentContent;
          };
          expect(body).not.toHaveProperty('content');
          expectDocumentBlocksToOmitAuthorityFields(body.documentContent);
          expect(body.documentContent).toEqual({
            blocks: [
              {
                text: 'Reopened writer draft with persisted edits.',
                type: 'paragraph',
              },
            ],
            schemaVersion: 1,
          });
          documentState.documentContent = body.documentContent;
          documentState.content = body.documentContent.blocks[0]?.text ?? '';
          documentState.capturedAt = '2026-03-23T00:45:00.000Z';
          documentState.versionId = 'project-doc-version-2';
          documentState.versionNumber = 2;
          documentState.document = {
            ...documentState.document,
            updatedAt: '2026-03-23T00:45:00.000Z',
          };

          return jsonResponse(documentState);
        }

        throw new Error(`Unexpected fetch: ${requestUrl}`);
      }),
    );

    renderWorkbench('/projects/project-1/writing/doc-project-1');

    expect(
      await screen.findByRole('textbox', { name: 'Paragraph block 1' }),
    ).toHaveValue('Promoted governed insight paragraph.');

    const draftContent = await screen.findByRole('textbox', { name: 'Paragraph block 1' });
    await user.clear(draftContent);
    await user.type(draftContent, 'Reopened writer draft with persisted edits.');
    await user.click(screen.getByRole('button', { name: 'Save draft' }));
    expect(
      await screen.findByText('Latest snapshot · 2026-03-23T00:45:00.000Z'),
    ).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByRole('textbox', { name: 'Paragraph block 1' })).toHaveValue(
        'Reopened writer draft with persisted edits.',
      );
    });

    const reloadButton = await screen.findByRole('button', { name: 'Reload draft' });
    expect(reloadButton).toBeEnabled();
    await user.click(reloadButton);
    expect(await screen.findByDisplayValue('Reopened writer draft with persisted edits.')).toBeInTheDocument();
  });

  it('writer page keeps reload locked while a save is still pending', async () => {
    const user = userEvent.setup();
    const projectFixture = {
      membership: {
        joinedAt: '2026-03-23T00:35:00.000Z',
        projectId: 'project-1',
        role: 'owner',
        userId: 'user-alice',
      },
      project: {
        createdAt: '2026-03-23T00:35:00.000Z',
        createdByUserId: 'user-alice',
        id: 'project-1',
        name: 'Tumor board project',
        spaceId: 'personal-space-user-alice',
        status: 'active',
        updatedAt: '2026-03-23T00:35:00.000Z',
      },
    };
    const documentState = {
      capturedAt: '2026-03-23T00:40:00.000Z',
      citations: [],
      content: 'Original promoted draft.',
      documentContent: {
        blocks: [
          {
            text: 'Original promoted draft.',
            type: 'paragraph',
          },
        ],
        schemaVersion: 1,
      },
      document: {
        createdAt: '2026-03-23T00:35:00.000Z',
        createdByUserId: 'user-alice',
        id: 'doc-project-1',
        projectId: 'project-1',
        publishState: 'draft',
        title: 'Tumor board literature synthesis',
        updatedAt: '2026-03-23T00:35:00.000Z',
      },
      versionId: 'project-doc-version-1',
      versionNumber: 1,
    };
    const pendingSaveRequest = createDeferred<Response>();

    vi.stubGlobal(
      'fetch',
      vi.fn((input: string | URL | Request, init?: RequestInit) => {
        const requestUrl =
          typeof input === 'string'
            ? input
            : input instanceof URL
              ? input.toString()
              : input.url;

        if (requestUrl.endsWith('/api/session/me')) {
          return Promise.resolve(jsonResponse({
            user: {
              displayName: 'Alice',
              email: 'alice@example.test',
              id: 'user-alice',
            },
          }));
        }

        if (requestUrl.endsWith('/api/projects')) {
          return Promise.resolve(jsonResponse([projectFixture]));
        }

        if (requestUrl.endsWith('/api/projects/project-1/writing-document')) {
          return Promise.resolve(jsonResponse(documentState.document));
        }

        if (requestUrl.endsWith('/api/project-docs/doc-project-1') && (!init?.method || init.method === 'GET')) {
          return Promise.resolve(jsonResponse(documentState));
        }

        if (requestUrl.endsWith('/api/project-docs/doc-project-1/versions') && init?.method === 'POST') {
          return pendingSaveRequest.promise;
        }

        throw new Error(`Unexpected fetch: ${requestUrl}`);
      }),
    );

    renderWorkbench('/projects/project-1/writing/doc-project-1');

    const draftContent = await screen.findByRole('textbox', { name: 'Paragraph block 1' });
    await user.clear(draftContent);
    await user.type(draftContent, 'Queued writer edits that should survive the save.');
    await user.click(screen.getByRole('button', { name: 'Save draft' }));

    const savingButton = await screen.findByRole('button', { name: 'Saving draft…' });
    expect(savingButton).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Reload draft' })).toBeDisabled();
    expect(screen.getByRole('textbox', { name: 'Paragraph block 1' })).toBeDisabled();

    documentState.content = 'Queued writer edits that should survive the save.';
    documentState.documentContent = {
      blocks: [
        {
          text: 'Queued writer edits that should survive the save.',
          type: 'paragraph',
        },
      ],
      schemaVersion: 1,
    };
    documentState.capturedAt = '2026-03-23T00:45:00.000Z';
    documentState.versionId = 'project-doc-version-2';
    documentState.versionNumber = 2;
    documentState.document = {
      ...documentState.document,
      updatedAt: '2026-03-23T00:45:00.000Z',
    };
    pendingSaveRequest.resolve(jsonResponse(documentState));

    expect(
      await screen.findByText('Latest snapshot · 2026-03-23T00:45:00.000Z'),
    ).toBeInTheDocument();
    expect(
      await screen.findByDisplayValue('Queued writer edits that should survive the save.'),
    ).toBeInTheDocument();
    expect(await screen.findByRole('button', { name: 'Reload draft' })).toBeEnabled();
  });

  it('project page treats a missing writer draft as an empty state instead of a runtime failure', async () => {
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

    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string | URL | Request) => {
        const requestUrl =
          typeof input === 'string'
            ? input
            : input instanceof URL
              ? input.toString()
              : input.url;

        if (requestUrl.endsWith('/api/session/me')) {
          return jsonResponse({
            user: {
              displayName: 'Alice',
              email: 'alice@example.test',
              id: 'user-alice',
            },
          });
        }

        if (requestUrl.endsWith('/api/projects')) {
          return jsonResponse([projectFixture]);
        }

        if (requestUrl.endsWith('/api/projects/project-alpha/writing-document')) {
          return jsonResponse(
            { error: 'No Writer document exists for project project-alpha.' },
            404,
          );
        }

        throw new Error(`Unexpected fetch: ${requestUrl}`);
      }),
    );

    renderWorkbench('/projects/project-alpha');

    expect(await screen.findByText('No Writer draft selected yet')).toBeInTheDocument();
    expect(screen.queryByText('Writer preview unavailable')).not.toBeInTheDocument();
  });
});
