import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

import type { DocumentBlockDocument } from '../../src/shared/contracts/document-content';

import { App } from '../../src/web/app';

import { expectDocumentBlocksToOmitAuthorityFields } from './document-block-assertions';

const projectFixture = {
  membership: {
    joinedAt: '2026-05-03T00:00:00.000Z',
    projectId: 'project-recovery',
    role: 'owner',
    userId: 'user-alice',
  },
  project: {
    createdAt: '2026-05-03T00:00:00.000Z',
    createdByUserId: 'user-alice',
    id: 'project-recovery',
    name: 'Project-first Recovery',
    spaceId: 'space-recovery',
    status: 'active',
    updatedAt: '2026-05-03T00:00:00.000Z',
  },
};

const importedEntryFixture = {
  asset: {
    abstractText: 'A server-owned project recovery paper.',
    canonicalId: 'doi:10.1000/project-recovery',
    createdAt: '2026-05-03T00:00:00.000Z',
    id: 'asset-recovery',
    title: 'Project-first recovery paper',
  },
  entry: {
    addedAt: '2026-05-03T00:00:00.000Z',
    addedByUserId: 'user-alice',
    createdAt: '2026-05-03T00:00:00.000Z',
    id: 'entry-recovery',
    paperAssetId: 'asset-recovery',
    scope: { type: 'project', id: 'project-recovery' },
    scopeId: 'project-recovery',
    scopeType: 'project',
    spaceId: 'space-recovery',
    visibility: 'space_shared',
  },
};

const projectDocRecordFixture = {
  createdAt: '2026-05-03T00:30:00.000Z',
  createdByUserId: 'user-alice',
  id: 'doc-project-recovery',
  projectId: 'project-recovery',
  publishState: 'draft',
  title: 'Tumor board literature synthesis',
  updatedAt: '2026-05-03T00:30:00.000Z',
} as const;

function installFetchMock() {
  const readingInsights: Array<{
    conversationId: string;
    createdAt: string;
    evidenceSpans: Array<{ endOffset: number; paperAssetId: string; quote: string; startOffset: number }>;
    id: string;
    libraryEntryId: string;
    summary: string;
  }> = [];
  let projectDocSnapshot: {
    capturedAt: string;
    citations: Array<{
      createdAt: string;
      evidenceSpan?: string;
      id: string;
      paperAssetId: string;
      projectDocVersionId: string;
    }>;
    content: string;
    documentContent?: DocumentBlockDocument;
    document: typeof projectDocRecordFixture;
    versionId: string;
    versionNumber: number;
  } | null = null;

  const fetchMock = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const requestUrl = new URL(String(input), window.location.origin);
    const bodyText = typeof init?.body === 'string' ? init.body : undefined;
    const body = bodyText ? JSON.parse(bodyText) as Record<string, unknown> : null;

    if (requestUrl.pathname === '/api/session/me') {
      return Response.json({
        user: {
          displayName: 'Alice',
          email: 'alice@example.test',
          id: 'user-alice',
        },
      });
    }

    if (
      requestUrl.searchParams.has('actorUserId') ||
      requestUrl.searchParams.has('actorSpaceId') ||
      requestUrl.searchParams.has('userId')
    ) {
      return Response.json(
        { error: 'Actor authority must travel by session cookie only.' },
        { status: 400 },
      );
    }

    if (
      body &&
      ('actorUserId' in body || 'createdByUserId' in body || 'startedByUserId' in body)
    ) {
      return Response.json(
        { error: 'Actor authority must travel by session cookie only.' },
        { status: 400 },
      );
    }

    if (requestUrl.pathname.startsWith('/api/writing/')) {
      return Response.json(
        { error: 'Legacy writing route is not available in the project-doc workflow.' },
        { status: 410 },
      );
    }

    if (requestUrl.pathname === '/api/projects' && init?.method === 'POST') {
      return Response.json(projectFixture);
    }

    if (requestUrl.pathname === '/api/projects') {
      return Response.json([projectFixture]);
    }

    if (requestUrl.pathname === '/api/projects/project-recovery/members') {
      return Response.json([projectFixture.membership]);
    }

    if (requestUrl.pathname === '/api/spaces') {
      return Response.json([
        {
          createdAt: '2026-05-03T00:00:00.000Z',
          id: 'space-recovery',
          kind: 'shared',
          name: 'Recovery Governance Space',
        },
      ]);
    }

    if (requestUrl.pathname === '/api/spaces/space-recovery/memberships') {
      return Response.json([
        {
          joinedAt: '2026-05-03T00:00:00.000Z',
          role: 'owner',
          spaceId: 'space-recovery',
          userId: 'user-alice',
        },
      ]);
    }

    if (requestUrl.pathname === '/api/library') {
      return Response.json([importedEntryFixture]);
    }

    if (requestUrl.pathname === '/api/reading/entry-recovery') {
      return Response.json({
        ...importedEntryFixture,
        insights: readingInsights,
        notes: [],
        projectComments: [],
      });
    }

    if (requestUrl.pathname === '/api/reading/insights' && init?.method === 'POST') {
      const insight = {
        conversationId: 'conversation-recovery',
        createdAt: '2026-05-03T00:20:00.000Z',
        evidenceSpans: [
          {
            endOffset: 18,
            paperAssetId: importedEntryFixture.asset.id,
            quote: 'shared review data',
            startOffset: 0,
          },
        ],
        id: `insight-${readingInsights.length + 1}`,
        libraryEntryId: importedEntryFixture.entry.id,
        summary: 'The imported paper supports the shared review workflow.',
      };
      readingInsights.push(insight);

      return Response.json({ insight });
    }

    if (requestUrl.pathname === '/api/project-docs' && init?.method === 'POST') {
      return Response.json(projectDocRecordFixture);
    }

    if (requestUrl.pathname === '/api/project-docs/doc-project-recovery/versions' && init?.method === 'POST') {
      const documentContent = body?.documentContent as DocumentBlockDocument | undefined;
      expectDocumentBlocksToOmitAuthorityFields(documentContent);
      projectDocSnapshot = {
        capturedAt: '2026-05-03T00:31:00.000Z',
        citations: ((body?.citations as Array<{ evidenceSpan?: string; paperAssetId: string }> | undefined) ?? []).map(
          (citation, index) => ({
            createdAt: '2026-05-03T00:31:00.000Z',
            evidenceSpan: citation.evidenceSpan,
            id: `citation-${index + 1}`,
            paperAssetId: citation.paperAssetId,
            projectDocVersionId: 'project-doc-version-1',
          }),
        ),
        content: documentContent
          ? documentContent.blocks
            .map((block) => ('text' in block ? block.text : ''))
            .filter(Boolean)
            .join('\n\n')
          : String(body?.content ?? ''),
        documentContent,
        document: projectDocRecordFixture,
        versionId: 'project-doc-version-1',
        versionNumber: 1,
      };

      return Response.json(projectDocSnapshot);
    }

    if (requestUrl.pathname === '/api/project-docs/doc-project-recovery') {
      return Response.json(projectDocSnapshot ?? {
        capturedAt: '2026-05-03T00:31:00.000Z',
        citations: [],
        content: '',
        documentContent: { blocks: [], schemaVersion: 1 },
        document: projectDocRecordFixture,
        versionId: 'project-doc-version-0',
        versionNumber: 0,
      });
    }

    if (requestUrl.pathname === '/api/projects/project-recovery/writing-document') {
      return Response.json(projectDocSnapshot?.document ?? null);
    }

    return Response.json({ error: 'Unhandled mock route' }, { status: 404 });
  });

  vi.stubGlobal('fetch', fetchMock);
  return fetchMock;
}

function renderLegacyWorkflow() {
  window.history.replaceState({}, '', '/projects');
  render(<App />);
}

beforeEach(() => {
  installFetchMock();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('mvp workflow shell', () => {
  it('navigates from spaces to library, reader, and writing', async () => {
    const user = userEvent.setup();

    renderLegacyWorkflow();

    expect(
      await screen.findByRole('heading', { name: 'Projects' }),
    ).toBeInTheDocument();
    expect(
      screen.getByText('Space is governance · Project is collaboration'),
    ).toBeInTheDocument();

    await waitFor(() =>
      expect(
        screen.getByRole('link', { name: 'Open project library' }),
      ).toBeInTheDocument(),
    );
    await user.click(screen.getByRole('link', { name: 'Open project library' }));

    expect(
      screen.getByRole('heading', { name: 'Library' }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText('context bar')).toHaveTextContent(
      'Context · space-recovery / project-recovery',
    );
    expect(screen.getByLabelText('context bar')).toHaveTextContent(
      'pmid import',
    );
    await waitFor(() =>
      expect(screen.getByText('Project · Project-first Recovery')).toBeInTheDocument(),
    );
    expect(
      screen.getByText('Project library · server-owned collaboration context'),
    ).toBeInTheDocument();
    expect(
      screen.getByText(/Review imported literature entries, metadata, and reading readiness/),
    ).toBeInTheDocument();

    await user.click(screen.getByRole('link', { name: 'Open reader' }));

    expect(screen.getByRole('heading', { name: 'Reader' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Workbench' })).toBeInTheDocument();
    expect(screen.getByLabelText('context bar')).toHaveTextContent(
      'Space context · space-recovery',
    );
    expect(screen.getByText('Project context · Project-first Recovery')).toBeInTheDocument();
    expect(screen.getByText('Entry · entry-recovery')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Generate insight' }));
    await waitFor(() =>
      expect(
        screen.getByText('The imported paper supports the shared review workflow.'),
      ).toBeInTheDocument(),
    );
    await user.click(screen.getByRole('button', { name: 'Promote latest insight to Writer' }));
    await waitFor(() =>
      expect(
        screen.getByText('Promoted latest insight into Writer as doc-project-recovery.'),
      ).toBeInTheDocument(),
    );
    await user.click(screen.getByRole('link', { name: 'Open writing' }));

    expect(screen.getByRole('heading', { name: 'Project Doc editor' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Versions and references' })).toBeInTheDocument();
    expect(
      screen.getByLabelText('context bar'),
    ).toHaveTextContent('Space context · space-recovery');
    expect(
      screen.getByLabelText('context bar'),
    ).toHaveTextContent('Project context · Project-first Recovery · doc-project-recovery');
  });

  it('shares scholarly shell primitives across pages', async () => {
    const user = userEvent.setup();

    renderLegacyWorkflow();

    expect(await screen.findByTestId('app-shell')).toHaveClass('app-shell');
    expect(await screen.findByRole('heading', { name: 'Projects' })).toHaveClass('page-title');

    await waitFor(() =>
      expect(
        screen.getByRole('link', { name: 'Open project library' }),
      ).toBeInTheDocument(),
    );
    await user.click(screen.getByRole('link', { name: 'Open project library' }));

    expect(screen.getByLabelText('context bar')).toHaveClass('context-bar');
    await waitFor(() =>
      expect(
        screen.getByRole('heading', { name: 'Project-first recovery paper' }),
      ).toHaveClass('panel-title'),
    );
    expect(screen.getAllByText('space_shared')[0]).toHaveClass('status-badge');
  });

  it('surfaces governance cues across library, reader, and writing', async () => {
    const user = userEvent.setup();

    renderLegacyWorkflow();

    await waitFor(() =>
      expect(
        screen.getByRole('link', { name: 'Open project library' }),
      ).toBeInTheDocument(),
    );
    await user.click(screen.getByRole('link', { name: 'Open project library' }));

    await waitFor(() =>
      expect(screen.getByText('Shared context · space-recovery')).toBeInTheDocument(),
    );
    expect(screen.getByText('Visibility · space_shared')).toBeInTheDocument();

    await user.click(screen.getByRole('link', { name: 'Open reader' }));

    expect(
      screen.getByText('Governed action source · queued → running → succeeded'),
    ).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Generate insight' }));
    await waitFor(() =>
      expect(
        screen.getByText('The imported paper supports the shared review workflow.'),
      ).toBeInTheDocument(),
    );
    await user.click(screen.getByRole('button', { name: 'Promote latest insight to Writer' }));
    await waitFor(() =>
      expect(
        screen.getByText('Promoted latest insight into Writer as doc-project-recovery.'),
      ).toBeInTheDocument(),
    );
    await user.click(screen.getByRole('link', { name: 'Open writing' }));

    expect(screen.getByText('Publish state path')).toBeInTheDocument();
    expect(screen.getByText('draft · review · published')).toBeInTheDocument();
  });

  it('supports direct reader deep links with project and entry context', async () => {
    window.history.replaceState(
      {},
      '',
      '/projects/project-recovery/library/entry-recovery/reader',
    );

    render(<App />);

    expect(await screen.findByRole('heading', { name: 'Reader' })).toBeInTheDocument();
    expect(screen.getByText('Entry · entry-recovery')).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByLabelText('context bar')).toHaveTextContent(
        'Space context · space-recovery',
      ),
    );
  });

  it('supports direct library deep links with space and project context', async () => {
    window.history.replaceState(
      {},
      '',
      '/projects/project-recovery/library',
    );

    render(<App />);

    expect(await screen.findByRole('heading', { name: 'Library' })).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByLabelText('context bar')).toHaveTextContent(
        'Context · space-recovery / project-recovery',
      ),
    );
  });

  it('supports direct writing deep links with project and doc context', async () => {
    window.history.replaceState(
      {},
      '',
      '/projects/project-recovery/writing/doc-project-recovery',
    );

    render(<App />);

    expect(await screen.findByRole('heading', { name: 'Project Doc editor' })).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByLabelText('context bar')).toHaveTextContent(
        'Space context · space-recovery',
      ),
    );
  });
});
