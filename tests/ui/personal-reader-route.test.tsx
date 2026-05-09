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

describe('personal reader route', () => {
  it('does not invent project Writer route and shows truthful guidance', async () => {
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
        scope: { id: 'user-alice', type: 'user' },
        scopeId: 'user-alice',
        scopeType: 'user',
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
          const body = JSON.parse(String(init.body)) as { summary: string; title: string };
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

        if (requestUrl.endsWith('/api/projects')) {
          return jsonResponse([]);
        }

        throw new Error(`Unexpected fetch: ${requestUrl}`);
      }),
    );

    renderWorkbench('/library/entry-1/reader');

    expect(await screen.findByText('Tumor board biomarkers for rapid review')).toBeInTheDocument();
    expect(screen.getByText('Personal context')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Open writing' })).not.toBeInTheDocument();

    await user.type(screen.getByRole('textbox', { name: 'Insight summary' }), 'Personal insight summary');
    await user.click(screen.getByRole('button', { name: 'Save insight' }));
    await user.click(screen.getByRole('button', { name: 'Promote latest insight to Writer' }));

    expect(
      await screen.findByText(
        'Open a real project workspace before promoting personal reading insights into Writer.',
      ),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        'Personal reader does not invent a project. Open a real project workspace before Writer promotion.',
      ),
    ).toBeInTheDocument();
  });
});
