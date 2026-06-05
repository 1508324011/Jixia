import { render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { ProjectWorkspaceResponse } from '../../src/shared/contracts/projects';
import { projectsContract } from '../../src/shared/contracts/projects';
import { App } from '../../src/web/app';

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
    },
    status,
  });
}

function createProjectWorkspaceFixture(
  overrides: Partial<ProjectWorkspaceResponse> = {},
): ProjectWorkspaceResponse {
  const project = {
    createdAt: '2026-05-18T00:00:00.000Z',
    createdByUserId: 'user-alice',
    id: 'project-alpha',
    name: 'Project Alpha',
    spaceId: 'space-alpha',
    status: 'active' as const,
    updatedAt: '2026-05-18T00:10:00.000Z',
  };
  const membership = {
    joinedAt: '2026-05-18T00:00:00.000Z',
    projectId: project.id,
    role: 'editor' as const,
    userId: 'user-alice',
  };

  return {
    activity: {
      emptyState: {
        body: 'Project activity will appear when Project Docs, project Library entries, Reader comments or excerpts, and governed project jobs change.',
        title: 'No project activity yet',
      },
      items: [],
      projectId: project.id,
      totalCount: 0,
    },
    actor: {
      role: 'editor',
      userId: 'user-alice',
    },
    contract: projectsContract,
    docs: {
      canCreate: true,
      documents: [
        {
          createdAt: '2026-05-18T00:01:00.000Z',
          createdByUserId: 'user-alice',
          documentId: 'project-doc-alpha',
          latestVersion: {
            capturedAt: '2026-05-18T00:10:00.000Z',
            versionId: 'project-doc-version-alpha',
            versionNumber: 2,
          },
          openHref: '/projects/project-alpha/writing/project-doc-alpha',
          projectId: project.id,
          publishState: 'review',
          title: 'Alpha review draft',
          updatedAt: '2026-05-18T00:10:00.000Z',
        },
      ],
      emptyState: {
        body: 'No Project Docs have been created for this project yet.',
        title: 'No Project Docs yet',
      },
      projectId: project.id,
      totalCount: 1,
    },
    generatedAt: '2026-05-18T00:12:00.000Z',
    links: {
      libraryHref: '/projects/project-alpha/library',
      projectHref: '/projects/project-alpha',
      writerHref: '/projects/project-alpha/writing/project-doc-alpha',
    },
    membership,
    project,
    review: {
      emptyState: {
        body: 'Project review and attention items will appear when shared Project Docs enter review, project jobs need monitoring, or project Reader collaboration creates comments and excerpts.',
        title: 'No project review items yet',
      },
      items: [
        {
          href: '/projects/project-alpha/writing/project-doc-alpha',
          id: 'project-doc-review:project-doc-alpha',
          kind: 'project-doc-review',
          occurredAt: '2026-05-18T00:10:00.000Z',
          priority: 'review',
          projectId: project.id,
          sourceId: 'project-doc-alpha',
          sourceLabel: 'Project Doc',
          summary: 'Project Doc is in review · version 2',
          title: 'Alpha review draft',
        },
      ],
      projectId: project.id,
      summary: {
        collaborationSignals: 0,
        documentsInReview: 1,
        jobsNeedingAttention: 0,
        newestReviewTimestamp: '2026-05-18T00:10:00.000Z',
        totalReviewItems: 1,
      },
      totalCount: 1,
    },
    resources: {
      emptyState: {
        body: 'Project resources will appear when the team creates Project Docs, explicitly adopts literature from Personal Library into the project-scoped Library, captures Reader excerpts, or opens governed jobs.',
        title: 'No project resources yet',
      },
      items: [],
      projectId: project.id,
      totalCount: 0,
    },
    ...overrides,
  };
}

function renderProjectPage(workspace: ProjectWorkspaceResponse) {
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
        return jsonResponse([{ membership: workspace.membership, project: workspace.project }]);
      }

      if (requestUrl.endsWith('/api/projects/project-alpha/workspace')) {
        return jsonResponse(workspace);
      }

      throw new Error(`Unexpected fetch: ${requestUrl}`);
    }),
  );

  window.history.replaceState({}, '', '/projects/project-alpha');
  render(<App />);
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('project page', () => {
  it('renders the server-derived project review and attention queue', async () => {
    renderProjectPage(createProjectWorkspaceFixture());

    expect(
      await screen.findByRole('heading', { name: 'Project review and attention' }),
    ).toBeInTheDocument();
    expect(screen.getAllByText('Alpha review draft').length).toBeGreaterThan(0);
    expect(screen.getByText('Project Doc is in review · version 2')).toBeInTheDocument();
    expect(screen.getByText('Documents in review')).toBeInTheDocument();
    expect(screen.getByText('Source · project-doc-alpha')).toBeInTheDocument();
    expect(
      screen.getByText(/引用来自项目可见的 LibraryEntry、Reader evidence、citation\/reference 和显式 Project Library source adoption/),
    ).toBeInTheDocument();
    expect(screen.getByText(/私有 Notebook 草稿保持 owner-only/)).toBeInTheDocument();
    expect(screen.queryByText(/显式采用的 Notebook 内容/)).not.toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Open review item' })).toHaveAttribute(
      'href',
      '/projects/project-alpha/writing/project-doc-alpha',
    );
  });

  it('renders the project review empty state from the server response', async () => {
    const workspace = createProjectWorkspaceFixture({
      review: {
        emptyState: {
          body: 'Project review and attention items will appear when shared Project Docs enter review, project jobs need monitoring, or project Reader collaboration creates comments and excerpts.',
          title: 'No project review items yet',
        },
        items: [],
        projectId: 'project-alpha',
        summary: {
          collaborationSignals: 0,
          documentsInReview: 0,
          jobsNeedingAttention: 0,
          totalReviewItems: 0,
        },
        totalCount: 0,
      },
    });

    renderProjectPage(workspace);

    expect(
      await screen.findByRole('heading', { name: 'No project review items yet' }),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Project review and attention items will appear when shared Project Docs enter review/),
    ).toBeInTheDocument();
  });
});
