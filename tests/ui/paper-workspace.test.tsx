import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { App } from '../../src/web/app';

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

describe('paper workspace', () => {
  it('paper page persists shared notes, governed insights, and project-first writer promotion actions', async () => {
    const user = userEvent.setup();
    const readingDetail = {
      asset: {
        abstractText: 'Imported PMID metadata for 654321',
        canonicalId: 'pmid:654321',
        createdAt: '2026-03-23T00:00:00.000Z',
        id: 'asset-1',
        title: 'Tumor board biomarkers for rapid review',
      },
      entry: {
        addedAt: '2026-03-23T00:00:00.000Z',
        createdAt: '2026-03-23T00:00:00.000Z',
        id: 'entry-1',
        paperAssetId: 'asset-1',
        scope: { id: 'project-alpha', type: 'project' },
        scopeId: 'project-alpha',
        scopeType: 'project',
        spaceId: 'space-alpha',
        visibility: 'space_shared',
      },
      insights: [] as Array<{
        conversationId: string;
        createdAt: string;
        evidenceSpans: Array<{ endOffset: number; paperAssetId: string; quote: string; startOffset: number }>;
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
        visibility: 'private' | 'space_shared';
      }>,
    };
    let promotedDraft = '';

    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
        const requestUrl =
          typeof input === 'string'
            ? input
            : input instanceof URL
              ? input.toString()
              : input.url;

        if (requestUrl.endsWith('/api/projects')) {
          return jsonResponse([projectFixture]);
        }

        if (
          requestUrl.endsWith('/api/projects/project-alpha/writing/document') &&
          (!init?.method || init.method === 'GET')
        ) {
          return jsonResponse(
            { error: 'No Writer document exists for project project-alpha.' },
            404,
          );
        }

        if (requestUrl.endsWith('/api/reading/entry-1') && (!init?.method || init.method === 'GET')) {
          return jsonResponse(readingDetail);
        }

        if (requestUrl.endsWith('/api/reading/notes') && init?.method === 'POST') {
          const body = JSON.parse(String(init.body)) as {
            body: string;
            visibility: 'private' | 'space_shared';
          };
          const note = {
            authorUserId: 'user-alice',
            body: body.body,
            createdAt: '2026-03-23T00:10:00.000Z',
            id: `note-${readingDetail.notes.length + 1}`,
            libraryEntryId: 'entry-1',
            visibility: body.visibility,
          };
          readingDetail.notes.push(note);

          return jsonResponse(note, 200);
        }

        if (requestUrl.endsWith('/api/reading/insights') && init?.method === 'POST') {
          const body = JSON.parse(String(init.body)) as { summary: string };
          const insight = {
            conversationId: 'conversation-1',
            createdAt: '2026-03-23T00:20:00.000Z',
            evidenceSpans: [
              {
                endOffset: 24,
                paperAssetId: 'asset-1',
                quote: 'Tumor board evidence',
                startOffset: 0,
              },
            ],
            id: `insight-${readingDetail.insights.length + 1}`,
            libraryEntryId: 'entry-1',
            summary: body.summary,
          };
          readingDetail.insights.push(insight);

          return jsonResponse(insight, 200);
        }

        if (
          requestUrl.endsWith('/api/projects/project-alpha/writing/document') &&
          init?.method === 'POST'
        ) {
          const body = JSON.parse(String(init.body)) as { content: string };
          promotedDraft = body.content;

          return jsonResponse({
            document: {
              documentId: 'doc-alpha',
              latestSnapshot: {
                capturedAt: '2026-03-23T00:30:00.000Z',
                citations: [],
                content: promotedDraft,
                doc: {
                  createdAt: '2026-03-23T00:30:00.000Z',
                  id: 'doc-alpha',
                  projectId: 'project-alpha',
                  publishState: 'draft',
                  spaceId: 'space-alpha',
                  title: 'Tumor board literature synthesis',
                  updatedAt: '2026-03-23T00:30:00.000Z',
                },
                docVersionId: 'doc-version-1',
                versionNumber: 1,
              },
              projectId: 'project-alpha',
              publishState: 'draft',
              spaceId: 'space-alpha',
              title: 'Tumor board literature synthesis',
            },
          });
        }

        throw new Error(`Unexpected fetch: ${requestUrl}`);
      }),
    );

    renderWorkbench('/projects/project-alpha/library/entry-1/reader');

    expect(await screen.findByText('Tumor board biomarkers for rapid review')).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'AI 对话' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: '私人笔记' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: '共享评论' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: '关键信息' })).toBeInTheDocument();

    await user.clear(screen.getByRole('textbox', { name: 'Shared note draft' }));
    await user.type(screen.getByRole('textbox', { name: 'Shared note draft' }), 'Shared note for later synthesis.');
    await user.click(screen.getByRole('button', { name: 'Save note' }));
    expect(
      await screen.findByText('Shared note for later synthesis.', { selector: 'p' }),
    ).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Generate insight' }));

        await user.click(screen.getByRole('button', { name: 'Promote latest insight to Writer' }));

    expect(await screen.findByText('Promoted latest insight into Writer.')).toBeInTheDocument();
    expect(promotedDraft).toContain('shared review workflow');
    expect(screen.getByRole('link', { name: 'Open writing' })).toHaveAttribute(
      'href',
      '/projects/project-alpha/writing/doc-alpha',
    );
  });
});
