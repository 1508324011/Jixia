import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { App } from '../../src/web/app';

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

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('project writer flow', () => {
  it('project page opens the project docs surface and saves updates', async () => {
    const user = userEvent.setup();
    const documentState = {
      document: {
        documentId: 'doc-1',
        latestSnapshot: {
          capturedAt: '2026-03-23T00:40:00.000Z',
          citations: [
            {
              docVersionId: 'doc-version-1',
              evidenceSpan: 'Tumor board evidence',
              id: 'citation-1',
              paperAssetId: 'asset-1',
            },
          ],
          content: 'Promoted governed insight paragraph.',
          doc: {
            createdAt: '2026-03-23T00:35:00.000Z',
            id: 'doc-1',
            ownerType: 'project',
            publishState: 'draft',
            projectId: 'project-1',
            spaceId: 'shared-space',
            title: 'Tumor board literature synthesis',
          },
          docVersionId: 'doc-version-1',
        },
        ownerType: 'project',
        projectId: 'project-1',
        publishState: 'draft',
        spaceId: 'shared-space',
        title: 'Tumor board literature synthesis',
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
          requestUrl.endsWith('/api/writing/shared-space/projects/project-1/document') &&
          (!init?.method || init.method === 'GET')
        ) {
          return jsonResponse(documentState);
        }

        if (
          requestUrl.endsWith('/api/writing/shared-space/projects/project-1/document') &&
          init?.method === 'POST'
        ) {
          const body = JSON.parse(String(init.body)) as { content: string; title: string };
          documentState.document = {
            ...documentState.document,
            latestSnapshot: {
              ...documentState.document.latestSnapshot,
              capturedAt: '2026-03-23T00:45:00.000Z',
              content: body.content,
              doc: {
                ...documentState.document.latestSnapshot.doc,
                title: body.title,
              },
            },
            title: body.title,
          };

          return jsonResponse(documentState);
        }

        throw new Error(`Unexpected fetch: ${requestUrl}`);
      }),
    );

    renderWorkbench('/projects/project-1');

    expect(screen.getByRole('heading', { name: 'Project docs' })).toBeInTheDocument();
    expect(screen.getByText('Shared document tree and current draft live here.')).toBeInTheDocument();

    expect(await screen.findByText('Promoted governed insight paragraph.')).toBeInTheDocument();

    await user.click(screen.getByRole('link', { name: 'Open project docs' }));

    expect(await screen.findByRole('heading', { name: 'Project docs' })).toBeInTheDocument();
    const draftContent = await screen.findByRole('textbox', { name: 'Draft content' });
    await user.clear(draftContent);
    await user.type(draftContent, 'Reopened writer draft with persisted edits.');
    await user.click(screen.getByRole('button', { name: 'Save draft' }));
    await user.click(screen.getByRole('button', { name: 'Reload draft' }));

    expect(await screen.findByDisplayValue('Reopened writer draft with persisted edits.')).toBeInTheDocument();
  });
});
