import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { ReaderExcerptRecord } from '../../src/shared/contracts/reading';
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
        hasFile: false,
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
      excerpts: [
        {
          createdAt: '2026-03-23T00:05:00.000Z',
          createdByUserId: 'user-alice',
          endOffset: 24,
          id: 'excerpt-1',
          libraryEntryId: 'entry-1',
          locator: 'p. 1',
          note: 'Existing excerpt note.',
          paperAssetId: 'asset-1',
          quote: 'Existing reader excerpt',
          startOffset: 0,
          updatedAt: '2026-03-23T00:05:00.000Z',
        },
      ] as ReaderExcerptRecord[],
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
        kind: 'private_note';
        libraryEntryId: string;
      }>,
      projectComments: [] as Array<{
        authorUserId: string;
        body: string;
        createdAt: string;
        id: string;
        kind: 'project_comment';
        libraryEntryId: string;
        projectId: string;
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
          };
          expect(body).toEqual({ body: expect.any(String) });
          const note = {
            authorUserId: 'user-alice',
            body: body.body,
            createdAt: '2026-03-23T00:10:00.000Z',
            id: `note-${readingDetail.notes.length + 1}`,
            kind: 'private_note' as const,
            libraryEntryId: 'entry-1',
          };
          readingDetail.notes.push(note);

          return jsonResponse({ note }, 201);
        }

        if (requestUrl.endsWith('/api/reading/entry-1/excerpts') && init?.method === 'POST') {
          const body = JSON.parse(String(init.body)) as {
            actorUserId?: string;
            endOffset: number;
            locator?: string;
            note?: string;
            projectId?: string;
            quote: string;
            scope?: unknown;
            startOffset: number;
            visibility?: string;
          };
          expect(body).toEqual({
            endOffset: 44,
            locator: 'p. 7',
            note: 'Durable note',
            quote: 'Durable reader excerpt',
            startOffset: 7,
          });
          expect(body).not.toHaveProperty('actorUserId');
          expect(body).not.toHaveProperty('scope');
          expect(body).not.toHaveProperty('projectId');
          expect(body).not.toHaveProperty('visibility');

          const excerpt = {
            createdAt: '2026-03-23T00:08:00.000Z',
            createdByUserId: 'user-alice',
            endOffset: body.endOffset,
            id: `excerpt-${readingDetail.excerpts.length + 1}`,
            libraryEntryId: 'entry-1',
            locator: body.locator,
            note: body.note,
            paperAssetId: 'asset-1',
            quote: body.quote,
            startOffset: body.startOffset,
            updatedAt: '2026-03-23T00:08:00.000Z',
          };
          readingDetail.excerpts.push(excerpt);

          return jsonResponse({ excerpt }, 201);
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

        if (requestUrl.endsWith('/api/notebooks/capture') && init?.method === 'POST') {
          const body = JSON.parse(String(init.body)) as {
            notebookTitle: string;
            source: {
              generatedInsightId: string;
              libraryEntryId: string;
              type: 'generatedInsight';
            };
          };
          expect(body).toMatchObject({
            notebookTitle: 'Reader evidence notebook',
            source: {
              generatedInsightId: 'insight-1',
              libraryEntryId: 'entry-1',
              type: 'generatedInsight',
            },
          });

          return jsonResponse({
            document: {
              createdAt: '2026-03-23T00:30:00.000Z',
              id: 'notebook-1',
              ownerId: 'user-alice',
              title: 'Reader evidence notebook',
              updatedAt: '2026-03-23T00:30:00.000Z',
            },
            snapshot: {
              capturedAt: '2026-03-23T00:30:00.000Z',
              citations: [
                {
                  createdAt: '2026-03-23T00:30:00.000Z',
                  evidenceSpan: 'Tumor board evidence',
                  id: 'citation-1',
                  notebookDocumentVersionId: 'notebook-version-1',
                  paperAssetId: 'asset-1',
                },
              ],
              content: 'Personal insight summary\n\n> Tumor board evidence',
              document: {
                createdAt: '2026-03-23T00:30:00.000Z',
                id: 'notebook-1',
                ownerId: 'user-alice',
                title: 'Reader evidence notebook',
                updatedAt: '2026-03-23T00:30:00.000Z',
              },
              versionId: 'notebook-version-1',
              versionNumber: 1,
            },
          });
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
    expect(
      screen.getByText('Metadata-only asset · no server-owned file is available yet.'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Open server-owned paper file' })).not.toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Open writing' })).not.toBeInTheDocument();
    expect(screen.getByText('Existing reader excerpt')).toBeInTheDocument();
    expect(screen.getByText('p. 1')).toBeInTheDocument();

    await user.clear(screen.getByLabelText('Reader excerpt quote'));
    await user.type(screen.getByLabelText('Reader excerpt quote'), 'Durable reader excerpt');
    await user.clear(screen.getByLabelText('Start offset'));
    await user.type(screen.getByLabelText('Start offset'), '7');
    await user.clear(screen.getByLabelText('End offset'));
    await user.type(screen.getByLabelText('End offset'), '44');
    await user.type(screen.getByLabelText('Excerpt locator'), 'p. 7');
    await user.type(screen.getByLabelText('Excerpt note'), 'Durable note');
    await user.click(screen.getByRole('button', { name: 'Save reader excerpt' }));

    expect(await screen.findByText('Saved reader excerpt.')).toBeInTheDocument();
    expect(screen.getByText('Durable reader excerpt')).toBeInTheDocument();
    expect(screen.getByText('Offsets · 7-44')).toBeInTheDocument();

    const excerptRequest = vi.mocked(fetch).mock.calls.find(([input, init]) =>
      String(input).endsWith('/api/reading/entry-1/excerpts') && init?.method === 'POST',
    );
    expect(excerptRequest).toBeDefined();
    expect(JSON.parse(String(excerptRequest?.[1]?.body))).toEqual({
      endOffset: 44,
      locator: 'p. 7',
      note: 'Durable note',
      quote: 'Durable reader excerpt',
      startOffset: 7,
    });

    await user.click(screen.getByRole('button', { name: 'Save project comment' }));
    expect(
      await screen.findByText('Open a real project workspace before saving project comments.'),
    ).toBeInTheDocument();

    await user.type(screen.getByRole('textbox', { name: 'Insight summary' }), 'Personal insight summary');
    await user.click(screen.getByRole('button', { name: 'Save insight' }));
    await user.click(screen.getByRole('button', { name: 'Send latest insight to Notebook' }));

    expect(
      await screen.findByText('Sent latest insight to private Notebook Reader evidence notebook.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Open Notebook' })).toHaveAttribute('href', '/notebook');

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

    await user.type(screen.getByRole('textbox', { name: 'Project comment' }), 'Should not post');
    await user.click(screen.getByRole('button', { name: 'Save project comment' }));

    expect(
      await screen.findByText('Open a real project workspace before saving project comments.'),
    ).toBeInTheDocument();
  });
});
