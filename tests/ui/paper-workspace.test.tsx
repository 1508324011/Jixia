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

describe('paper workspace', () => {
  it('paper page persists private notes, shared comments, and writer promotion actions', async () => {
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
        id: 'entry-1',
        paperAssetId: 'asset-1',
        spaceId: 'personal-space-user-alice',
        visibility: 'private',
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

        if (requestUrl.endsWith('/api/reading/entry-1') && (!init?.method || init.method === 'GET')) {
          return jsonResponse(readingDetail);
        }

        if (requestUrl.endsWith('/api/reading/entry-1/notes') && init?.method === 'POST') {
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

          return jsonResponse({ note }, 201);
        }

        if (requestUrl.endsWith('/api/reading/entry-1/insights') && init?.method === 'POST') {
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

          return jsonResponse({ insight }, 201);
        }

        if (
          requestUrl.endsWith('/api/writing/personal-space-user-alice/projects/project-1/document') &&
          init?.method === 'POST'
        ) {
          const body = JSON.parse(String(init.body)) as { content: string };
          promotedDraft = body.content;

          return jsonResponse({
            document: {
              documentId: 'doc-1',
              latestSnapshot: {
                capturedAt: '2026-03-23T00:30:00.000Z',
                citations: [],
                content: promotedDraft,
                doc: {
                  createdAt: '2026-03-23T00:30:00.000Z',
                  id: 'doc-1',
                  publishState: 'draft',
                  spaceId: 'personal-space-user-alice',
                  title: 'Tumor board literature synthesis',
                },
                docVersionId: 'doc-version-1',
              },
              projectId: 'project-1',
              publishState: 'draft',
              spaceId: 'personal-space-user-alice',
              title: 'Tumor board literature synthesis',
            },
          });
        }

        throw new Error(`Unexpected fetch: ${requestUrl}`);
      }),
    );

    renderWorkbench('/projects/project-1/library/entry-1/reader');

    expect(await screen.findByText('Tumor board biomarkers for rapid review')).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'AI 对话' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: '私人笔记' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: '共享评论' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: '关键信息' })).toBeInTheDocument();

    await user.type(screen.getByRole('textbox', { name: 'Private note' }), 'Private note for later synthesis.');
    await user.click(screen.getByRole('button', { name: 'Save private note' }));

    await user.type(screen.getByRole('textbox', { name: 'Project comment' }), 'Project-visible comment for the tumor board.');
    await user.click(screen.getByRole('button', { name: 'Save project comment' }));

    await user.type(screen.getByRole('textbox', { name: 'Insight summary' }), 'Governed insight ready for Writer promotion.');
    await user.click(screen.getByRole('button', { name: 'Save insight' }));

    expect(await screen.findByText('Private note for later synthesis.')).toBeInTheDocument();
    expect(screen.getByText('Project-visible comment for the tumor board.')).toBeInTheDocument();
    expect(screen.getByText('Governed insight ready for Writer promotion.')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: 'Promote latest insight to Writer' }));

    expect(await screen.findByText('Promoted latest insight into Writer.')).toBeInTheDocument();
    expect(promotedDraft).toContain('Governed insight ready for Writer promotion.');
  });
});
