import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { MemoryRouter, Route, Routes, useParams } from 'react-router-dom';

import { App } from '../../src/web/app';
import { NotebookPage } from '../../src/web/pages/notebook-page';

function renderWorkbench(pathname = '/notebook') {
  window.history.replaceState({}, '', pathname);
  render(<App />);
}

function ProjectDocDestination() {
  const { docId, projectId } = useParams<{ docId?: string; projectId?: string }>();

  return <p>Project Doc destination · {projectId} · {docId}</p>;
}

function renderNotebookRoute(pathname = '/notebook') {
  render(
    <MemoryRouter initialEntries={[pathname]}>
      <Routes>
        <Route path="/notebook" element={<NotebookPage />} />
        <Route path="/notebook/:documentId" element={<NotebookPage />} />
        <Route path="/projects/:projectId/writing/:docId" element={<ProjectDocDestination />} />
      </Routes>
    </MemoryRouter>,
  );
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

describe('notebook page', () => {
  it('opens the route-targeted private Notebook instead of defaulting to the first visible document', async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
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

      if (requestUrl.endsWith('/api/notebooks')) {
        return jsonResponse({
          documents: [
            {
              createdAt: '2026-05-18T00:00:00.000Z',
              id: 'notebook-first',
              ownerId: 'user-alice',
              title: 'First visible notebook',
              updatedAt: '2026-05-18T00:00:00.000Z',
            },
            {
              createdAt: '2026-05-18T00:01:00.000Z',
              id: 'notebook-target',
              ownerId: 'user-alice',
              title: 'Route target notebook',
              updatedAt: '2026-05-18T00:01:00.000Z',
            },
          ],
        });
      }

      if (requestUrl.endsWith('/api/notebooks/notebook-target/snapshot')) {
        return jsonResponse({
          capturedAt: '2026-05-18T00:02:00.000Z',
          citations: [],
          content: 'Route-targeted notebook body.',
          document: {
            createdAt: '2026-05-18T00:01:00.000Z',
            id: 'notebook-target',
            ownerId: 'user-alice',
            title: 'Route target notebook',
            updatedAt: '2026-05-18T00:01:00.000Z',
          },
          documentContent: {
            blocks: [
              {
                text: 'Route-targeted notebook body.',
                type: 'paragraph',
              },
            ],
            schemaVersion: 1,
          },
          versionId: 'notebook-version-target',
          versionNumber: 3,
        });
      }

      if (requestUrl.endsWith('/api/notebooks/notebook-first/snapshot')) {
        throw new Error('The /notebook/:documentId route should not load the first notebook snapshot.');
      }

      throw new Error(`Unexpected fetch: ${requestUrl}`);
    });

    vi.stubGlobal('fetch', fetchMock);

    renderWorkbench('/notebook/notebook-target');

    expect(await screen.findByRole('heading', { name: 'Notebook' })).toBeInTheDocument();
    expect(await screen.findByRole('heading', { name: 'Route target notebook' })).toBeInTheDocument();
    expect(await screen.findByDisplayValue('Route-targeted notebook body.')).toBeInTheDocument();
    expect(screen.getByText(/Saved snapshot · notebook-version-target · 0 citation\(s\)/)).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringMatching(/\/api\/notebooks\/notebook-target\/snapshot$/),
      expect.any(Object),
    );
  });

  it('submits explicit Notebook adoption intent without actor or project authority fields', async () => {
    const user = userEvent.setup();
    let adoptionBody: unknown;
    const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const requestUrl =
        typeof input === 'string'
          ? input
          : input instanceof URL
            ? input.toString()
            : input.url;

      if (requestUrl.endsWith('/api/notebooks')) {
        return jsonResponse({
          documents: [
            {
              createdAt: '2026-05-23T00:00:00.000Z',
              id: 'notebook-adoption-source',
              ownerId: 'user-alice',
              title: 'Adoption source notebook',
              updatedAt: '2026-05-23T00:01:00.000Z',
            },
          ],
        });
      }

      if (requestUrl.endsWith('/api/notebooks/notebook-adoption-source/snapshot')) {
        return jsonResponse({
          capturedAt: '2026-05-23T00:02:00.000Z',
          citations: [],
          content: 'Notebook evidence selected for explicit adoption.',
          document: {
            createdAt: '2026-05-23T00:00:00.000Z',
            id: 'notebook-adoption-source',
            ownerId: 'user-alice',
            title: 'Adoption source notebook',
            updatedAt: '2026-05-23T00:01:00.000Z',
          },
          documentContent: {
            blocks: [
              {
                text: 'Notebook evidence selected for explicit adoption.',
                type: 'paragraph',
              },
            ],
            schemaVersion: 1,
          },
          versionId: 'notebook-version-4',
          versionNumber: 4,
        });
      }

      if (requestUrl.endsWith('/api/project-docs/doc-project-1/notebook-adoptions') && init?.method === 'POST') {
        adoptionBody = JSON.parse(String(init.body));

        return jsonResponse({
          citationTrace: {
            capturedAt: '2026-05-23T00:03:00.000Z',
            citations: [],
            document: {
              createdAt: '2026-05-23T00:00:00.000Z',
              createdByUserId: 'user-alice',
              id: 'doc-from-server',
              projectId: 'project-from-server',
              publishState: 'draft',
              title: 'Shared Project Doc',
              updatedAt: '2026-05-23T00:03:00.000Z',
            },
            generatedAt: '2026-05-23T00:03:00.000Z',
            versionId: 'project-doc-version-5',
            versionNumber: 5,
          },
          provenance: {
            paperAssetIds: [],
            projectDocId: 'doc-from-server',
            projectDocVersionId: 'project-doc-version-5',
            projectDocVersionNumber: 5,
            projectId: 'project-from-server',
            projectLibraryEntryIds: [],
            readerExcerptIds: [],
            sourceNotebookCapturedAt: '2026-05-23T00:02:00.000Z',
            sourceNotebookDocumentId: 'notebook-adoption-source',
            sourceNotebookVersionId: 'notebook-version-4',
            sourceNotebookVersionNumber: 4,
          },
          snapshot: {
            capturedAt: '2026-05-23T00:03:00.000Z',
            citations: [],
            content: 'Adopted Notebook content.',
            document: {
              createdAt: '2026-05-23T00:00:00.000Z',
              createdByUserId: 'user-alice',
              id: 'doc-from-server',
              projectId: 'project-from-server',
              publishState: 'draft',
              title: 'Shared Project Doc',
              updatedAt: '2026-05-23T00:03:00.000Z',
            },
            documentContent: {
              blocks: [{ text: 'Adopted Notebook content.', type: 'paragraph' }],
              schemaVersion: 1,
            },
            versionId: 'project-doc-version-5',
            versionNumber: 5,
          },
        });
      }

      throw new Error(`Unexpected fetch: ${requestUrl}`);
    });

    vi.stubGlobal('fetch', fetchMock);

    renderNotebookRoute('/notebook?adoptProjectId=project-1&adoptProjectDocId=doc-project-1');

    expect(await screen.findByRole('heading', { name: 'Adoption source notebook' })).toBeInTheDocument();
    expect(screen.getByText(/Project Doc adoption target · doc-project-1/)).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Adopt into Project Doc' }));

    await waitFor(() => {
      expect(adoptionBody).toEqual({ notebookDocumentId: 'notebook-adoption-source' });
    });
    expect(adoptionBody).not.toHaveProperty('actorUserId');
    expect(adoptionBody).not.toHaveProperty('ownerId');
    expect(adoptionBody).not.toHaveProperty('projectId');
    expect(await screen.findByText('Project Doc destination · project-from-server · doc-from-server')).toBeInTheDocument();
  });
});
