import { render, screen, waitFor, within } from '@testing-library/react';
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
  let resolve: ((value: T) => void) | undefined;
  let reject: ((error?: unknown) => void) | undefined;

  const promise = new Promise<T>((nextResolve, nextReject) => {
    resolve = nextResolve;
    reject = nextReject;
  });

  if (!resolve || !reject) {
    throw new Error('Deferred promise failed to initialize.');
  }

  return { promise, reject, resolve };
}

function buildEmptyCitationTrace(documentState: {
  capturedAt: string;
  document: {
    createdAt: string;
    createdByUserId: string;
    id: string;
    projectId: string;
    publishState: string;
    title: string;
    updatedAt: string;
  };
  versionId: string;
  versionNumber: number;
}) {
  return {
    capturedAt: documentState.capturedAt,
    citations: [],
    document: documentState.document,
    generatedAt: '2026-03-23T00:45:30.000Z',
    versionId: documentState.versionId,
    versionNumber: documentState.versionNumber,
  };
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('project writer flow', () => {
  it('project page renders the server-owned Project Docs empty state from the workspace endpoint', async () => {
    const workspaceFixture = {
      activity: {
        emptyState: {
          body: 'Project activity will appear when Project Docs, project Library entries, Reader comments or excerpts, and governed project jobs change.',
          title: 'No project activity yet',
        },
        items: [],
        projectId: 'project-1',
        totalCount: 0,
      },
      actor: {
        role: 'owner',
        userId: 'user-alice',
      },
      contract: 'jixia-projects-contract',
      docs: {
        canCreate: true,
        documents: [],
        emptyState: {
          body: 'No Project Docs have been created for this project yet. Use Project Docs to maintain shared background, evidence, rationale, conclusions, and formal drafts for the team.',
          title: 'No Project Docs yet',
        },
        projectId: 'project-1',
        totalCount: 0,
      },
      generatedAt: '2026-03-23T00:35:30.000Z',
      links: {
        libraryHref: '/projects/project-1/library',
        projectHref: '/projects/project-1',
      },
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
      resources: {
        emptyState: {
          body: 'Project resources will appear when the team creates Project Docs, adopts literature into the project-scoped Library, captures Reader excerpts, or opens governed jobs.',
          title: 'No project resources yet',
        },
        items: [],
        projectId: 'project-1',
        totalCount: 0,
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
          return jsonResponse([
            {
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
            },
          ]);
        }

        if (requestUrl.endsWith('/api/projects/project-1/workspace')) {
          return jsonResponse(workspaceFixture);
        }

        throw new Error(`Unexpected fetch: ${requestUrl}`);
      }),
    );

    renderWorkbench('/projects/project-1');

    expect(await screen.findByText('Project Docs 共享知识中心')).toBeInTheDocument();
    expect(screen.getByText('No Project Docs yet')).toBeInTheDocument();
    expect(screen.getByText('No project resources yet')).toBeInTheDocument();
    expect(screen.getByText('No project activity yet')).toBeInTheDocument();
  });

  it('project page renders widened workspace kinds from the server DTO', async () => {
    const workspaceFixture = {
      activity: {
        emptyState: {
          body: 'Project activity will appear when Project Docs, project Library entries, Reader comments or excerpts, and governed project jobs change.',
          title: 'No project activity yet',
        },
        items: [
          {
            href: '/jobs?scopeType=project&scopeId=project-1&jobId=job-1',
            id: 'job:job-1',
            kind: 'job',
            occurredAt: '2026-03-23T00:34:00.000Z',
            projectId: 'project-1',
            sourceId: 'job-1',
            sourceLabel: 'Project job',
            summary: 'Job status · queued',
            title: 'ai.summary',
          },
          {
            href: '/projects/project-1/writing/doc-1',
            id: 'project-doc:doc-1',
            kind: 'project-doc',
            occurredAt: '2026-03-23T00:35:00.000Z',
            projectId: 'project-1',
            sourceId: 'doc-1',
            sourceLabel: 'Project Doc',
            summary: 'Project Doc draft · version 1',
            title: 'Tumor board literature synthesis',
          },
          {
            href: '/projects/project-1/library/entry-1/reader',
            id: 'library-entry:entry-1',
            kind: 'library-entry',
            occurredAt: '2026-03-23T00:33:00.000Z',
            projectId: 'project-1',
            sourceId: 'entry-1',
            sourceLabel: 'Project Library',
            summary: 'Project Library · doi:10.1000/project-entry',
            title: 'Project reader source',
          },
          {
            href: '/projects/project-1/library/entry-1/reader',
            id: 'reader-comment:comment-1',
            kind: 'reader-comment',
            occurredAt: '2026-03-23T00:32:00.000Z',
            projectId: 'project-1',
            sourceId: 'comment-1',
            sourceLabel: 'Reader comment',
            summary: 'Project comment · Project reader source',
            title: 'Project comment summary',
          },
          {
            href: '/projects/project-1/library/entry-1/reader',
            id: 'reader-excerpt:excerpt-1',
            kind: 'reader-excerpt',
            occurredAt: '2026-03-23T00:31:00.000Z',
            projectId: 'project-1',
            sourceId: 'excerpt-1',
            sourceLabel: 'Reader excerpt',
            summary: 'Reader excerpt · Project reader source · loc-1',
            title: 'Quoted evidence from the source',
          },
        ],
        projectId: 'project-1',
        totalCount: 5,
      },
      actor: {
        role: 'owner',
        userId: 'user-alice',
      },
      contract: 'jixia-projects-contract',
      docs: {
        canCreate: true,
        documents: [
          {
            createdAt: '2026-03-23T00:35:00.000Z',
            createdByUserId: 'user-alice',
            documentId: 'doc-1',
            latestVersion: {
              capturedAt: '2026-03-23T00:40:00.000Z',
              versionId: 'project-doc-version-1',
              versionNumber: 1,
            },
            openHref: '/projects/project-1/writing/doc-1',
            projectId: 'project-1',
            publishState: 'draft',
            title: 'Tumor board literature synthesis',
            updatedAt: '2026-03-23T00:40:00.000Z',
          },
        ],
        emptyState: {
          body: 'No Project Docs have been created for this project yet.',
          title: 'No Project Docs yet',
        },
        projectId: 'project-1',
        totalCount: 1,
      },
      generatedAt: '2026-03-23T00:41:00.000Z',
      links: {
        libraryHref: '/projects/project-1/library',
        projectHref: '/projects/project-1',
        writerHref: '/projects/project-1/writing/doc-1',
      },
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
      resources: {
        emptyState: {
          body: 'Project resources will appear when the team creates Project Docs, adopts literature into the project-scoped Library, captures Reader excerpts, or opens governed jobs.',
          title: 'No project resources yet',
        },
        items: [
          {
            href: '/jobs?scopeType=project&scopeId=project-1&jobId=job-1',
            id: 'job:job-1',
            kind: 'job',
            projectId: 'project-1',
            sourceId: 'job-1',
            subtitle: 'Project job · queued',
            title: 'ai.summary',
            updatedAt: '2026-03-23T00:34:00.000Z',
          },
          {
            href: '/projects/project-1/writing/doc-1',
            id: 'project-doc:doc-1',
            kind: 'project-doc',
            projectId: 'project-1',
            sourceId: 'doc-1',
            subtitle: 'draft · version 1',
            title: 'Tumor board literature synthesis',
            updatedAt: '2026-03-23T00:40:00.000Z',
          },
          {
            href: '/projects/project-1/library/entry-1/reader',
            id: 'library-entry:entry-1',
            kind: 'library-entry',
            projectId: 'project-1',
            sourceId: 'entry-1',
            subtitle: 'Project Library · doi:10.1000/project-entry',
            title: 'Project reader source',
            updatedAt: '2026-03-23T00:33:00.000Z',
          },
          {
            href: '/projects/project-1/library/entry-1/reader',
            id: 'reader-excerpt:excerpt-1',
            kind: 'reader-excerpt',
            projectId: 'project-1',
            sourceId: 'excerpt-1',
            subtitle: 'Reader excerpt · Project reader source · loc-1',
            title: 'Quoted evidence from the source',
            updatedAt: '2026-03-23T00:31:00.000Z',
          },
        ],
        projectId: 'project-1',
        totalCount: 4,
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
          return jsonResponse([
            {
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
            },
          ]);
        }

        if (requestUrl.endsWith('/api/projects/project-1/workspace')) {
          return jsonResponse(workspaceFixture);
        }

        throw new Error(`Unexpected fetch: ${requestUrl}`);
      }),
    );

    renderWorkbench('/projects/project-1');

    expect(await screen.findByText('Project Docs 共享知识中心')).toBeInTheDocument();
    expect(screen.getAllByText('Project job').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Project Library').length).toBeGreaterThan(0);
    expect(screen.getByText('Reader comment')).toBeInTheDocument();
    expect(screen.getAllByText('Reader excerpt').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Project reader source').length).toBeGreaterThan(0);
    expect(screen.getAllByText('Tumor board literature synthesis').length).toBeGreaterThan(0);
    expect(screen.getByText('Quoted evidence from the source')).toBeInTheDocument();
    expect(screen.getByText('Project comment summary')).toBeInTheDocument();
    expect(screen.queryByText('No Project Docs yet')).not.toBeInTheDocument();
    expect(screen.queryByText('No project resources yet')).not.toBeInTheDocument();
    expect(screen.queryByText('No project activity yet')).not.toBeInTheDocument();
  });

  it('project page renders server-indexed Project Docs without loading the legacy latest-doc preview', async () => {
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

        if (requestUrl.endsWith('/api/projects')) {
          return jsonResponse([
            {
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
                spaceId: 'space-project-1',
                status: 'active',
                updatedAt: '2026-03-23T00:35:00.000Z',
              },
            },
          ]);
        }

        if (requestUrl.endsWith('/api/projects/project-1/workspace')) {
          return jsonResponse({
          activity: {
            emptyState: {
              body: 'Project activity will appear when project-scoped records change.',
              title: 'No project activity yet',
            },
            items: [
              {
                href: '/projects/project-1/writing/doc-project-1',
                id: 'project-doc:doc-project-1',
                kind: 'project-doc',
                occurredAt: '2026-03-23T00:40:00.000Z',
                projectId: 'project-1',
                sourceId: 'doc-project-1',
                sourceLabel: 'Project Doc',
                summary: 'Project Doc draft · version 1',
                title: 'Tumor board literature synthesis',
              },
            ],
            projectId: 'project-1',
            totalCount: 1,
          },
          actor: {
            role: 'owner',
            userId: 'user-alice',
          },
          contract: 'jixia-projects-contract',
          docs: {
            canCreate: true,
            documents: [
              {
                createdAt: '2026-03-23T00:35:00.000Z',
                createdByUserId: 'user-alice',
                documentId: 'doc-project-1',
                latestVersion: {
                  capturedAt: '2026-03-23T00:40:00.000Z',
                  versionId: 'project-doc-version-1',
                  versionNumber: 1,
                },
                openHref: '/projects/project-1/writing/doc-project-1',
                projectId: 'project-1',
                publishState: 'draft',
                title: 'Tumor board literature synthesis',
                updatedAt: '2026-03-23T00:40:00.000Z',
              },
            ],
            emptyState: {
              body: 'No Project Docs have been created for this project yet.',
              title: 'No Project Docs yet',
            },
            projectId: 'project-1',
            totalCount: 1,
          },
          generatedAt: '2026-03-23T00:41:00.000Z',
          links: {
            libraryHref: '/projects/project-1/library',
            projectHref: '/projects/project-1',
            writerHref: '/projects/project-1/writing/doc-project-1',
          },
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
          resources: {
            emptyState: {
              body: 'Project resources will appear when project-scoped records are created.',
              title: 'No project resources yet',
            },
            items: [
              {
                href: '/projects/project-1/writing/doc-project-1',
                id: 'project-doc:doc-project-1',
                kind: 'project-doc',
                projectId: 'project-1',
                sourceId: 'doc-project-1',
                subtitle: 'draft · version 1',
                title: 'Tumor board literature synthesis',
                updatedAt: '2026-03-23T00:40:00.000Z',
              },
            ],
            projectId: 'project-1',
            totalCount: 1,
          },
        });
      }

      throw new Error(`Unexpected fetch: ${requestUrl}`);
    });

    vi.stubGlobal('fetch', fetchMock);

    renderWorkbench('/projects/project-1');

    expect(await screen.findAllByText('Tumor board literature synthesis')).toHaveLength(3);
    expect(screen.getByText('Document · doc-project-1')).toBeInTheDocument();
    expect(screen.getByText('Updated 2026-03-23T00:40:00.000Z · Version 1')).toBeInTheDocument();
    expect(screen.getByText('Latest version · project-doc-version-1')).toBeInTheDocument();
    expect(screen.getByText('Project Doc draft · version 1')).toBeInTheDocument();
    expect(screen.getByText('draft · version 1')).toBeInTheDocument();
    expect(screen.getByText('Occurred 2026-03-23T00:40:00.000Z')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Resume from activity' })).toHaveAttribute(
      'href',
      '/projects/project-1/writing/doc-project-1',
    );
    expect(screen.getByRole('link', { name: 'Open resource' })).toHaveAttribute(
      'href',
      '/projects/project-1/writing/doc-project-1',
    );
    expect(screen.getByRole('link', { name: 'Open Project Doc' })).toHaveAttribute(
      'href',
      '/projects/project-1/writing/doc-project-1',
    );
    expect(fetchMock).not.toHaveBeenCalledWith(
      expect.stringContaining('/api/projects/project-1/writing-document'),
      expect.anything(),
    );
  });

  it('owner creates a Project Doc from the workspace with no browser actor fields', async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
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

      if (requestUrl.endsWith('/api/projects/project-1/workspace')) {
        return jsonResponse({
          activity: {
            emptyState: {
              body: 'Project activity will appear when Project Docs, project Library resources, Reader comments or evidence, and governed project jobs change.',
              title: 'No project activity yet',
            },
            items: [],
            projectId: 'project-1',
            totalCount: 0,
          },
          actor: {
            role: 'owner',
            userId: 'user-alice',
          },
          contract: 'jixia-projects-contract',
          docs: {
            canCreate: true,
            documents: [],
            emptyState: {
              body: 'Use Project Docs to maintain shared background, evidence, rationale, conclusions, and formal drafts.',
              title: 'No Project Docs yet',
            },
            projectId: 'project-1',
            totalCount: 0,
          },
          generatedAt: '2026-03-23T00:41:00.000Z',
          links: {
            libraryHref: '/projects/project-1/library',
            projectHref: '/projects/project-1',
          },
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
            spaceId: 'space-project-1',
            status: 'active',
            updatedAt: '2026-03-23T00:35:00.000Z',
          },
          resources: {
            emptyState: {
              body: 'Project resources will appear when the team creates Project Docs or adopts literature into the project-scoped Library.',
              title: 'No project resources yet',
            },
            items: [],
            projectId: 'project-1',
            totalCount: 0,
          },
        });
      }

      if (requestUrl.endsWith('/api/project-docs') && init?.method === 'POST') {
        expect(JSON.parse(String(init.body))).toEqual({
          projectId: 'project-1',
          title: 'Shared evidence rationale',
        });

        return jsonResponse({
          createdAt: '2026-03-23T00:42:00.000Z',
          createdByUserId: 'user-alice',
          id: 'doc-created-1',
          projectId: 'project-1',
          publishState: 'draft',
          title: 'Shared evidence rationale',
          updatedAt: '2026-03-23T00:42:00.000Z',
        });
      }

      if (requestUrl.endsWith('/api/projects')) {
        return jsonResponse([
          {
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
              spaceId: 'space-project-1',
              status: 'active',
              updatedAt: '2026-03-23T00:35:00.000Z',
            },
          },
        ]);
      }

        if (requestUrl.endsWith('/api/project-docs/doc-created-1/citation-trace')) {
          return jsonResponse({
            capturedAt: '2026-03-23T00:42:00.000Z',
            citations: [],
            document: {
              createdAt: '2026-03-23T00:42:00.000Z',
              createdByUserId: 'user-alice',
              id: 'doc-created-1',
              projectId: 'project-1',
              publishState: 'draft',
              title: 'Shared evidence rationale',
              updatedAt: '2026-03-23T00:42:00.000Z',
            },
            generatedAt: '2026-03-23T00:42:30.000Z',
            versionId: 'project-doc:doc-created-1:version-0',
            versionNumber: 0,
          });
        }

        if (requestUrl.endsWith('/api/project-docs/doc-created-1')) {
          return jsonResponse({
          capturedAt: '2026-03-23T00:42:00.000Z',
          citations: [],
          content: '',
          document: {
            createdAt: '2026-03-23T00:42:00.000Z',
            createdByUserId: 'user-alice',
            id: 'doc-created-1',
            projectId: 'project-1',
            publishState: 'draft',
            title: 'Shared evidence rationale',
            updatedAt: '2026-03-23T00:42:00.000Z',
          },
          documentContent: { blocks: [], schemaVersion: 1 },
          versionId: 'project-doc:doc-created-1:version-0',
          versionNumber: 0,
        });
      }

      throw new Error(`Unexpected fetch: ${requestUrl}`);
    });

    vi.stubGlobal('fetch', fetchMock);

    renderWorkbench('/projects/project-1');

    await user.type(
      await screen.findByLabelText('New Project Doc title'),
      'Shared evidence rationale',
    );
    await user.click(screen.getByRole('button', { name: 'Create Project Doc' }));

    await waitFor(() => {
      expect(window.location.pathname).toBe('/projects/project-1/writing/doc-created-1');
    });
    expect(await screen.findByText('Project Doc editor')).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/api/project-docs'),
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('viewer sees Project Docs as readonly with no create path on the project page', async () => {
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
              displayName: 'Bob',
              email: 'bob@example.test',
              id: 'user-bob',
            },
          });
        }

        if (requestUrl.endsWith('/api/projects/project-1/workspace')) {
          return jsonResponse({
            activity: {
              emptyState: {
                body: 'Project activity will appear when project-scoped records change.',
                title: 'No project activity yet',
              },
              items: [
                {
                  href: '/projects/project-1/writing/doc-project-1',
                  id: 'project-doc:doc-project-1',
                  kind: 'project-doc',
                  occurredAt: '2026-03-23T00:35:00.000Z',
                  projectId: 'project-1',
                  sourceId: 'doc-project-1',
                  sourceLabel: 'Project Doc',
                  summary: 'Project Doc draft · no saved version yet',
                  title: 'Viewer-readable synthesis',
                },
              ],
              projectId: 'project-1',
              totalCount: 1,
            },
            actor: {
              role: 'viewer',
              userId: 'user-bob',
            },
            contract: 'jixia-projects-contract',
            docs: {
              canCreate: false,
              createDisabledReason: 'Project viewers can read visible Project Docs but cannot create shared project knowledge documents.',
              documents: [
                {
                  createdAt: '2026-03-23T00:35:00.000Z',
                  createdByUserId: 'user-alice',
                  documentId: 'doc-project-1',
                  latestVersion: null,
                  openHref: '/projects/project-1/writing/doc-project-1',
                  projectId: 'project-1',
                  publishState: 'draft',
                  title: 'Viewer-readable synthesis',
                  updatedAt: '2026-03-23T00:35:00.000Z',
                },
              ],
              emptyState: {
                body: 'No Project Docs yet.',
                title: 'No Project Docs yet',
              },
              projectId: 'project-1',
              totalCount: 1,
            },
            generatedAt: '2026-03-23T00:41:00.000Z',
            links: {
              libraryHref: '/projects/project-1/library',
              projectHref: '/projects/project-1',
            },
            membership: {
              joinedAt: '2026-03-23T00:35:00.000Z',
              projectId: 'project-1',
              role: 'viewer',
              userId: 'user-bob',
            },
            project: {
              createdAt: '2026-03-23T00:35:00.000Z',
              createdByUserId: 'user-alice',
              id: 'project-1',
              name: 'Tumor board project',
              spaceId: 'space-project-1',
              status: 'active',
              updatedAt: '2026-03-23T00:35:00.000Z',
            },
            resources: {
              emptyState: {
                body: 'Project resources will appear when project-scoped records are created.',
                title: 'No project resources yet',
              },
              items: [
                {
                  href: '/projects/project-1/writing/doc-project-1',
                  id: 'project-doc:doc-project-1',
                  kind: 'project-doc',
                  projectId: 'project-1',
                  sourceId: 'doc-project-1',
                  subtitle: 'draft · no saved version yet',
                  title: 'Viewer-readable synthesis',
                  updatedAt: '2026-03-23T00:35:00.000Z',
                },
              ],
              projectId: 'project-1',
              totalCount: 1,
            },
          });
        }

        throw new Error(`Unexpected fetch: ${requestUrl}`);
      }),
    );

    renderWorkbench('/projects/project-1');

    expect(await screen.findAllByText('Viewer-readable synthesis')).toHaveLength(3);
    expect(screen.getByText('Project viewers can read visible Project Docs but cannot create shared project knowledge documents.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Create Project Doc' })).not.toBeInTheDocument();
    expect(screen.queryByLabelText('New Project Doc title')).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Open Project Doc' })).toHaveAttribute(
      'href',
      '/projects/project-1/writing/doc-project-1',
    );
  });

  it('viewer can open a Project Doc but cannot save from the editor UI', async () => {
    const projectFixture = {
      membership: {
        joinedAt: '2026-03-23T00:35:00.000Z',
        projectId: 'project-1',
        role: 'viewer',
        userId: 'user-bob',
      },
      project: {
        createdAt: '2026-03-23T00:35:00.000Z',
        createdByUserId: 'user-alice',
        id: 'project-1',
        name: 'Tumor board project',
        spaceId: 'space-project-1',
        status: 'active',
        updatedAt: '2026-03-23T00:35:00.000Z',
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

        if (requestUrl.endsWith('/api/session/me')) {
          return jsonResponse({
            user: {
              displayName: 'Bob',
              email: 'bob@example.test',
              id: 'user-bob',
            },
          });
        }

        if (requestUrl.endsWith('/api/projects')) {
          return jsonResponse([projectFixture]);
        }

        if (requestUrl.endsWith('/api/project-docs/doc-project-1/citation-trace')) {
          return jsonResponse({
            capturedAt: '2026-03-23T00:40:00.000Z',
            citations: [],
            document: {
              createdAt: '2026-03-23T00:35:00.000Z',
              createdByUserId: 'user-alice',
              id: 'doc-project-1',
              projectId: 'project-1',
              publishState: 'draft',
              title: 'Viewer-readable synthesis',
              updatedAt: '2026-03-23T00:35:00.000Z',
            },
            generatedAt: '2026-03-23T00:40:30.000Z',
            versionId: 'project-doc-version-1',
            versionNumber: 1,
          });
        }

        if (requestUrl.endsWith('/api/project-docs/doc-project-1') && (!init?.method || init.method === 'GET')) {
          return jsonResponse({
            capturedAt: '2026-03-23T00:40:00.000Z',
            citations: [],
            content: 'Viewer readable paragraph.',
            document: {
              createdAt: '2026-03-23T00:35:00.000Z',
              createdByUserId: 'user-alice',
              id: 'doc-project-1',
              projectId: 'project-1',
              publishState: 'draft',
              title: 'Viewer-readable synthesis',
              updatedAt: '2026-03-23T00:35:00.000Z',
            },
            documentContent: {
              blocks: [{ text: 'Viewer readable paragraph.', type: 'paragraph' }],
              schemaVersion: 1,
            },
            versionId: 'project-doc-version-1',
            versionNumber: 1,
          });
        }

        if (requestUrl.endsWith('/api/project-docs/doc-project-1/versions') && init?.method === 'POST') {
          throw new Error('Viewer UI must not attempt a Project Doc save.');
        }

        throw new Error(`Unexpected fetch: ${requestUrl}`);
      }),
    );

    renderWorkbench('/projects/project-1/writing/doc-project-1');

    expect(
      await screen.findByDisplayValue('Viewer readable paragraph.'),
    ).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Save draft' })).toBeDisabled();
    expect(screen.getByText('Your project role can read this Project Doc, but only project owners and editors can save shared document versions.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Reload draft' })).toBeEnabled();
    expect(screen.getByText('No citations in the latest saved Project Doc snapshot.')).toBeInTheDocument();
  });

  it('writing page renders citation trace loading, server rows, and error states without authority labels', async () => {
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
        spaceId: 'space-project-1',
        status: 'active',
        updatedAt: '2026-03-23T00:35:00.000Z',
      },
    };
    const documentState = {
      capturedAt: '2026-03-23T00:40:00.000Z',
      citations: [
        {
          createdAt: '2026-03-23T00:40:00.000Z',
          evidenceSpan: 'Server trace quote.',
          id: 'citation-trace-ui-1',
          paperAssetId: 'asset-trace-ui-1',
          projectDocVersionId: 'project-doc-version-1',
          readerExcerptId: 'excerpt-trace-ui-1',
        },
      ],
      content: 'Server trace quote.',
      documentContent: {
        blocks: [{ text: 'Server trace quote.', type: 'paragraph' }],
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
    const initialTrace = createDeferred<Response>();
    let traceRequests = 0;

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

        if (requestUrl.endsWith('/api/project-docs/doc-project-1/citation-trace')) {
          traceRequests += 1;

          if (traceRequests === 1) {
            return initialTrace.promise;
          }

          return jsonResponse({ error: 'Trace endpoint unavailable.' }, 503);
        }

        if (requestUrl.endsWith('/api/project-docs/doc-project-1') && (!init?.method || init.method === 'GET')) {
          return jsonResponse(documentState);
        }

        throw new Error(`Unexpected fetch: ${requestUrl}`);
      }),
    );

    renderWorkbench('/projects/project-1/writing/doc-project-1');

    expect(await screen.findByText('Loading citation trace…')).toBeInTheDocument();
    initialTrace.resolve(jsonResponse({
      capturedAt: documentState.capturedAt,
      citations: [
        {
          citationId: 'citation-trace-ui-1',
          createdAt: '2026-03-23T00:40:00.000Z',
          evidenceSpan: 'Server trace quote.',
          paper: {
            canonicalId: 'doi:10.1000/trace-ui',
            createdAt: '2026-03-23T00:35:00.000Z',
            hasFile: false,
            id: 'asset-trace-ui-1',
            title: 'Trace UI paper',
          },
          paperAssetId: 'asset-trace-ui-1',
          projectDocVersionId: documentState.versionId,
          projectLibraryEntry: {
            libraryEntryId: 'entry-trace-ui-1',
            projectId: 'project-1',
          },
          readerExcerpt: {
            evidenceSpan: 'Server trace quote.',
            id: 'excerpt-trace-ui-1',
            locator: 'p. 7',
            quote: 'Server trace quote.',
            source: 'reader_source',
            sourceLibraryEntryId: 'entry-trace-ui-1',
          },
          readerExcerptId: 'excerpt-trace-ui-1',
          source: { state: 'available' },
        },
      ],
      document: documentState.document,
      generatedAt: '2026-03-23T00:47:30.000Z',
      versionId: documentState.versionId,
      versionNumber: documentState.versionNumber,
    }));

    expect(await screen.findByText('Paper · Trace UI paper')).toBeInTheDocument();
    expect(screen.getByText('Reader excerpt · excerpt-trace-ui-1')).toBeInTheDocument();
    expect(screen.getByText('Locator · p. 7')).toBeInTheDocument();
    expect(screen.queryByText(/ownerId/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/createdByUserId/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/visibility/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/scopeType/i)).not.toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Reload draft' }));

    expect(await screen.findByText('Trace endpoint unavailable.')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Server trace quote.')).toBeInTheDocument();
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

        if (requestUrl.endsWith('/api/project-docs/doc-project-1/citation-trace')) {
          return jsonResponse(buildEmptyCitationTrace(documentState));
        }

        if (requestUrl.endsWith('/api/project-docs/doc-project-1') && (!init?.method || init.method === 'GET')) {
          return jsonResponse(documentState);
        }

        if (requestUrl.endsWith('/api/project-docs/doc-project-1/versions') && init?.method === 'POST') {
          const body = JSON.parse(String(init.body)) as {
            citations: Array<{
              evidenceSpan?: string;
              paperAssetId: string;
              readerExcerptId?: string;
            }>;
            content?: string;
            documentContent: typeof documentState.documentContent;
          };
          expect(body).not.toHaveProperty('content');
          expect(body.citations).toEqual([
            {
              evidenceSpan: 'Tumor board evidence',
              paperAssetId: 'asset-1',
            },
          ]);
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

  it('writing page preserves structured reference blocks in the canonical save payload and reloads them', async () => {
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
        spaceId: 'space-project-1',
        status: 'active',
        updatedAt: '2026-03-23T00:35:00.000Z',
      },
    };
    const documentState = {
      capturedAt: '2026-03-23T00:40:00.000Z',
      citations: [],
      content: '## Evidence synthesis\n\n> Project-visible quote\n\nSource: Project-visible paper (p. 12)',
      documentContent: {
        blocks: [
          {
            level: 2,
            text: 'Evidence synthesis',
            type: 'heading',
          },
          {
            evidenceSpan: 'Project-visible quote',
            libraryEntryId: 'entry-project-visible',
            locator: 'p. 12',
            paperAssetId: 'asset-project-visible',
            quote: 'Project-visible quote',
            title: 'Project-visible paper',
            type: 'sourceExcerpt',
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
    let projectDocGetCount = 0;

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

        if (requestUrl.endsWith('/api/project-docs/doc-project-1/citation-trace')) {
          return jsonResponse(buildEmptyCitationTrace(documentState));
        }

        if (requestUrl.endsWith('/api/project-docs/doc-project-1') && (!init?.method || init.method === 'GET')) {
          projectDocGetCount += 1;
          return jsonResponse(documentState);
        }

        if (requestUrl.endsWith('/api/project-docs/doc-project-1/versions') && init?.method === 'POST') {
          const body = JSON.parse(String(init.body)) as {
            content?: string;
            documentContent: typeof documentState.documentContent;
          };
          expect(body).not.toHaveProperty('content');
          expectDocumentBlocksToOmitAuthorityFields(body.documentContent);
          expect(body.documentContent.schemaVersion).toBe(1);
          expect(body.documentContent.blocks).toHaveLength(2);
          expect(body.documentContent.blocks[0]).toMatchObject({
            level: 2,
            text: 'Evidence synthesis',
            type: 'heading',
          });
          expect(body.documentContent.blocks[1]).toMatchObject({
            evidenceSpan: 'Project-visible quote',
            libraryEntryId: 'entry-project-visible',
            locator: 'p. 12',
            paperAssetId: 'asset-project-visible',
            quote: 'Project-visible quote',
            title: 'Project-visible paper',
            type: 'sourceExcerpt',
          });
          documentState.capturedAt = '2026-03-23T00:46:00.000Z';
          documentState.versionId = 'project-doc-version-2';
          documentState.versionNumber = 2;
          documentState.document = {
            ...documentState.document,
            updatedAt: '2026-03-23T00:46:00.000Z',
          };

          return jsonResponse(documentState);
        }

        throw new Error(`Unexpected fetch: ${requestUrl}`);
      }),
    );

    renderWorkbench('/projects/project-1/writing/doc-project-1');

    expect(await screen.findByDisplayValue('Evidence synthesis')).toBeInTheDocument();
    expect(screen.getByText('Project-visible paper')).toBeInTheDocument();
    expect(screen.getByText('Project-visible quote')).toBeInTheDocument();
    expect(screen.getByText('Paper asset')).toBeInTheDocument();
    expect(screen.getByText('asset-project-visible')).toBeInTheDocument();
    expect(screen.getByText('Library entry')).toBeInTheDocument();
    expect(screen.getByText('entry-project-visible')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Save draft' }));
    expect(
      await screen.findByText('Latest snapshot · 2026-03-23T00:46:00.000Z'),
    ).toBeInTheDocument();

    const projectDocGetCountBeforeReload = projectDocGetCount;
    const reloadButton = await screen.findByRole('button', { name: 'Reload draft' });
    await user.click(reloadButton);
    await waitFor(() => expect(projectDocGetCount).toBeGreaterThan(projectDocGetCountBeforeReload));
    expect(await screen.findByText('Project-visible paper')).toBeInTheDocument();
    expect(screen.getByText('Project-visible quote')).toBeInTheDocument();
    expect(screen.getByText('asset-project-visible')).toBeInTheDocument();
    expect(screen.getByText('entry-project-visible')).toBeInTheDocument();
  });

  it('writing page preserves readerExcerpt-backed citation fields in the save payload', async () => {
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
        spaceId: 'space-project-1',
        status: 'active',
        updatedAt: '2026-03-23T00:35:00.000Z',
      },
    };
    const documentState = {
      capturedAt: '2026-03-23T00:40:00.000Z',
      citations: [
        {
          createdAt: '2026-03-23T00:40:00.000Z',
          evidenceSpan: 'Quoted reader excerpt evidence',
          id: 'citation-1',
          libraryEntryId: 'entry-project-visible',
          paperAssetId: 'asset-project-visible',
          projectDocVersionId: 'project-doc-version-1',
          readerExcerptId: 'excerpt-project-visible',
        },
      ],
      content: 'Quoted reader excerpt evidence',
      documentContent: {
        blocks: [
          {
            evidenceSpan: 'Quoted reader excerpt evidence',
            libraryEntryId: 'entry-project-visible',
            paperAssetId: 'asset-project-visible',
            quote: 'Quoted reader excerpt evidence',
            readerExcerptId: 'excerpt-project-visible',
            type: 'sourceExcerpt',
          },
          {
            evidenceSpan: 'Citation block evidence',
            label: 'Reader excerpt citation',
            libraryEntryId: 'entry-project-visible',
            paperAssetId: 'asset-project-visible',
            readerExcerptId: 'excerpt-project-visible',
            type: 'citation',
          },
          {
            attribution: 'Reader excerpt',
            evidenceSpan: 'Editable quote evidence',
            libraryEntryId: 'entry-project-visible',
            paperAssetId: 'asset-project-visible',
            readerExcerptId: 'excerpt-project-visible',
            text: 'Editable quote evidence',
            type: 'quote',
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

        if (requestUrl.endsWith('/api/project-docs/doc-project-1/citation-trace')) {
          return jsonResponse({
            capturedAt: documentState.capturedAt,
            citations: [
              {
                citationId: 'citation-1',
                createdAt: '2026-03-23T00:40:00.000Z',
                evidenceSpan: 'Quoted reader excerpt evidence',
                paper: {
                  canonicalId: 'doi:10.1000/project-visible',
                  createdAt: '2026-03-23T00:35:00.000Z',
                  hasFile: false,
                  id: 'asset-project-visible',
                  title: 'Reader excerpt citation paper',
                },
                paperAssetId: 'asset-project-visible',
                projectDocVersionId: documentState.versionId,
                projectLibraryEntry: {
                  libraryEntryId: 'entry-project-visible',
                  projectId: 'project-1',
                },
                readerExcerpt: {
                  evidenceSpan: 'Quoted reader excerpt evidence',
                  id: 'excerpt-project-visible',
                  locator: 'p. 12',
                  quote: 'Quoted reader excerpt evidence',
                  source: 'reader_source',
                  sourceLibraryEntryId: 'entry-project-visible',
                },
                readerExcerptId: 'excerpt-project-visible',
                source: { state: 'available' },
              },
            ],
            document: documentState.document,
            generatedAt: '2026-03-23T00:47:30.000Z',
            versionId: documentState.versionId,
            versionNumber: documentState.versionNumber,
          });
        }

        if (requestUrl.endsWith('/api/project-docs/doc-project-1') && (!init?.method || init.method === 'GET')) {
          return jsonResponse(documentState);
        }

        if (requestUrl.endsWith('/api/project-docs/doc-project-1/versions') && init?.method === 'POST') {
          const body = JSON.parse(String(init.body)) as {
            citations: Array<{
              evidenceSpan?: string;
              libraryEntryId?: string;
              paperAssetId: string;
              readerExcerptId?: string;
            }>;
            content?: string;
            documentContent: typeof documentState.documentContent;
          };
          expect(body).not.toHaveProperty('content');
          expect(body.citations).toEqual([
            {
              evidenceSpan: 'Quoted reader excerpt evidence',
              libraryEntryId: 'entry-project-visible',
              paperAssetId: 'asset-project-visible',
              readerExcerptId: 'excerpt-project-visible',
            },
          ]);
          expectDocumentBlocksToOmitAuthorityFields(body.documentContent);
          expect(body.documentContent.blocks[0]).toMatchObject({
            evidenceSpan: 'Quoted reader excerpt evidence',
            libraryEntryId: 'entry-project-visible',
            paperAssetId: 'asset-project-visible',
            quote: 'Quoted reader excerpt evidence',
            readerExcerptId: 'excerpt-project-visible',
            type: 'sourceExcerpt',
          });
          expect(body.documentContent.blocks[1]).toMatchObject({
            evidenceSpan: 'Citation block evidence',
            label: 'Reader excerpt citation',
            libraryEntryId: 'entry-project-visible',
            paperAssetId: 'asset-project-visible',
            readerExcerptId: 'excerpt-project-visible',
            type: 'citation',
          });
          expect(body.documentContent.blocks[2]).toMatchObject({
            attribution: 'Reader excerpt',
            evidenceSpan: 'Editable quote evidence',
            libraryEntryId: 'entry-project-visible',
            paperAssetId: 'asset-project-visible',
            readerExcerptId: 'excerpt-project-visible',
            text: 'Edited reader excerpt quote',
            type: 'quote',
          });
          documentState.capturedAt = '2026-03-23T00:47:00.000Z';
          documentState.versionId = 'project-doc-version-2';
          documentState.versionNumber = 2;

          return jsonResponse(documentState);
        }

        throw new Error(`Unexpected fetch: ${requestUrl}`);
      }),
    );

    renderWorkbench('/projects/project-1/writing/doc-project-1');

    expect(await screen.findAllByText('entry-project-visible')).toHaveLength(3);
    expect(await screen.findByText('Citation trace')).toBeInTheDocument();
    expect(screen.getByText('Read-only server-authorized citation provenance.')).toBeInTheDocument();
    expect(screen.getByText('Citation · citation-1')).toBeInTheDocument();
    expect(screen.getByText('Paper · Reader excerpt citation paper')).toBeInTheDocument();
    expect(screen.getByText('Evidence source · Reader excerpt')).toBeInTheDocument();
    expect(screen.getByText('Citation source available in this project.')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Citation trace/i })).not.toBeInTheDocument();

    const quoteEditor = await screen.findByLabelText('Quote block 3');
    await user.clear(quoteEditor);
    await user.type(quoteEditor, 'Edited reader excerpt quote');

    await user.click(screen.getByRole('button', { name: 'Save draft' }));

    expect(
      await screen.findByText('Latest snapshot · 2026-03-23T00:47:00.000Z'),
    ).toBeInTheDocument();
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

        if (requestUrl.endsWith('/api/project-docs/doc-project-1/citation-trace')) {
          return Promise.resolve(jsonResponse(buildEmptyCitationTrace(documentState)));
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

  it('writing page guides citation adoption and retries save with preserved citation identity', async () => {
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
        spaceId: 'space-project-1',
        status: 'active',
        updatedAt: '2026-03-23T00:35:00.000Z',
      },
    };
    const documentState = {
      capturedAt: '2026-03-23T00:40:00.000Z',
      citations: [
        {
          createdAt: '2026-03-23T00:40:00.000Z',
          evidenceSpan: 'Unavailable quote survives recovery.',
          id: 'citation-1',
          paperAssetId: 'asset-adoption-needed',
          projectDocVersionId: 'project-doc-version-1',
          readerExcerptId: 'excerpt-adoption-needed',
        },
      ],
      content: 'Unavailable quote survives recovery.',
      documentContent: {
        blocks: [
          {
            evidenceSpan: 'Unavailable quote survives recovery.',
            libraryEntryId: 'entry-personal-source',
            paperAssetId: 'asset-adoption-needed',
            quote: 'Unavailable quote survives recovery.',
            readerExcerptId: 'excerpt-adoption-needed',
            title: 'Adoption needed paper',
            type: 'sourceExcerpt',
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
    const saveBodies: unknown[] = [];
    let saveAttempt = 0;

    const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
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

      if (requestUrl.endsWith('/api/project-docs/doc-project-1/citation-trace')) {
        return jsonResponse({
          capturedAt: documentState.capturedAt,
          citations: [
            {
              citationId: 'citation-1',
              createdAt: '2026-03-23T00:40:00.000Z',
              evidenceSpan: 'Unavailable quote survives recovery.',
              paperAssetId: 'asset-adoption-needed',
              projectDocVersionId: documentState.versionId,
              readerExcerpt: {
                evidenceSpan: 'Unavailable quote survives recovery.',
                id: 'excerpt-adoption-needed',
                quote: 'Unavailable quote survives recovery.',
                source: 'project_doc_snapshot',
              },
              readerExcerptId: 'excerpt-adoption-needed',
              source: {
                code: 'PROJECT_DOC_CITATION_SOURCE_UNAVAILABLE',
                details: {
                  evidenceSpan: 'Unavailable quote survives recovery.',
                  paperAssetId: 'asset-adoption-needed',
                  projectId: 'project-1',
                  readerExcerptId: 'excerpt-adoption-needed',
                },
                message: 'Paper asset asset-adoption-needed is not available in project project-1.',
                state: 'adoption_needed',
              },
            },
          ],
          document: documentState.document,
          generatedAt: '2026-03-23T00:48:30.000Z',
          versionId: documentState.versionId,
          versionNumber: documentState.versionNumber,
        });
      }

      if (requestUrl.endsWith('/api/project-docs/doc-project-1') && (!init?.method || init.method === 'GET')) {
        return jsonResponse(documentState);
      }

      if (requestUrl.endsWith('/api/project-docs/doc-project-1/versions') && init?.method === 'POST') {
        const body = JSON.parse(String(init.body)) as {
          citations: Array<{
            evidenceSpan?: string;
            libraryEntryId?: string;
            paperAssetId: string;
            readerExcerptId?: string;
          }>;
          documentContent: typeof documentState.documentContent;
        };
        saveBodies.push(body);
        expect(body.citations).toEqual([
          {
            evidenceSpan: 'Unavailable quote survives recovery.',
            libraryEntryId: 'entry-personal-source',
            paperAssetId: 'asset-adoption-needed',
            readerExcerptId: 'excerpt-adoption-needed',
          },
        ]);
        expect(body.documentContent.blocks[0]).toMatchObject({
          evidenceSpan: 'Unavailable quote survives recovery.',
          libraryEntryId: 'entry-personal-source',
          paperAssetId: 'asset-adoption-needed',
          quote: 'Unavailable quote survives recovery.',
          readerExcerptId: 'excerpt-adoption-needed',
          type: 'sourceExcerpt',
        });

        saveAttempt += 1;

        if (saveAttempt === 1) {
          return jsonResponse(
            {
              code: 'PROJECT_DOC_CITATION_SOURCE_UNAVAILABLE',
              details: {
                evidenceSpan: 'Unavailable quote survives recovery.',
                paperAssetId: 'asset-adoption-needed',
                projectId: 'project-1',
                readerExcerptId: 'excerpt-adoption-needed',
                sourceLibraryEntryId: 'entry-personal-source',
              },
              error: 'Paper asset asset-adoption-needed is not available in project project-1.',
            },
            400,
          );
        }

        documentState.capturedAt = '2026-03-23T00:48:00.000Z';
        documentState.versionId = 'project-doc-version-2';
        documentState.versionNumber = 2;
        return jsonResponse(documentState);
      }

      if (requestUrl.endsWith('/api/projects/project-1/library/adoptions') && init?.method === 'POST') {
        expect(JSON.parse(String(init.body))).toEqual({
          sourceLibraryEntryId: 'entry-personal-source',
        });

        return jsonResponse({
          entry: {
            asset: {
              canonicalId: 'doi:10.1000/adoption-needed',
              createdAt: '2026-03-23T00:35:00.000Z',
              id: 'asset-adoption-needed',
              title: 'Adoption needed paper',
            },
            entry: {
              addedAt: '2026-03-23T00:48:00.000Z',
              addedByUserId: 'user-alice',
              createdAt: '2026-03-23T00:48:00.000Z',
              id: 'entry-project-adopted',
              paperAssetId: 'asset-adoption-needed',
              scope: { id: 'project-1', type: 'project' },
              scopeId: 'project-1',
              scopeType: 'project',
              spaceId: 'space-project-1',
              visibility: 'published_to_project',
            },
          },
          reused: false,
        });
      }

      throw new Error(`Unexpected fetch: ${requestUrl}`);
    });

    vi.stubGlobal('fetch', fetchMock);

    renderWorkbench('/projects/project-1/writing/doc-project-1');

    expect(await screen.findByText('Adoption needed paper')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Save draft' }));

    const adoptionHeading = await screen.findByRole('heading', {
      name: 'Citation source needs project adoption',
    });
    const adoptionPanel = adoptionHeading.closest('section');

    expect(adoptionHeading).toBeInTheDocument();
    if (!(adoptionPanel instanceof HTMLElement)) {
      throw new Error('Citation adoption panel was not rendered.');
    }
    expect(within(adoptionPanel).getByText('Paper asset · asset-adoption-needed')).toBeInTheDocument();
    expect(within(adoptionPanel).getByText('Source library entry · entry-personal-source')).toBeInTheDocument();
    expect(within(adoptionPanel).getByText('Reader excerpt · excerpt-adoption-needed')).toBeInTheDocument();

    await user.click(
      screen.getByRole('button', { name: 'Add source to project library and retry save' }),
    );

    expect(
      await screen.findByText('Citation source adopted and Project Doc saved.'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Citation source needs project adoption' })).not.toBeInTheDocument();
    expect(await screen.findByText('Latest snapshot · 2026-03-23T00:48:00.000Z')).toBeInTheDocument();
    expect(saveBodies).toHaveLength(2);
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringContaining('/api/projects/project-1/library/adoptions'),
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('project page treats an empty Project Docs index as an empty state instead of a runtime failure', async () => {
    const workspaceFixture = {
      activity: {
        emptyState: {
          body: 'Project activity appears when project-scoped records change.',
          title: 'No project activity yet',
        },
        items: [],
        projectId: 'project-alpha',
        totalCount: 0,
      },
      actor: {
        role: 'owner',
        userId: 'user-alice',
      },
      contract: 'jixia-projects-contract',
      docs: {
        canCreate: true,
        documents: [],
        emptyState: {
          body: 'Create a shared Project Doc from governed Reader evidence.',
          title: 'No Project Docs yet',
        },
        projectId: 'project-alpha',
        totalCount: 0,
      },
      generatedAt: '2026-05-08T00:01:00.000Z',
      links: {
        libraryHref: '/projects/project-alpha/library',
        projectHref: '/projects/project-alpha',
      },
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
      resources: {
        emptyState: {
          body: 'Project resources will appear when the team creates Project Docs or adopts literature into the project-scoped Library.',
          title: 'No project resources yet',
        },
        items: [],
        projectId: 'project-alpha',
        totalCount: 0,
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

        if (requestUrl.endsWith('/api/projects/project-alpha/workspace')) {
          return jsonResponse(workspaceFixture);
        }

        throw new Error(`Unexpected fetch: ${requestUrl}`);
      }),
    );

    renderWorkbench('/projects/project-alpha');

    expect(await screen.findByText('No Project Docs yet')).toBeInTheDocument();
    expect(screen.getByText('Create a shared Project Doc from governed Reader evidence.')).toBeInTheDocument();
    expect(screen.queryByText('Writer preview unavailable')).not.toBeInTheDocument();
  });
});
