import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { ReaderExcerptRecord } from '../../src/shared/contracts/reading';
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

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('paper workspace', () => {
  it('paper page persists private notes, project comments, governed insights, and project-first writer promotion actions', async () => {
    const user = userEvent.setup();
    const projectFixture = {
      membership: {
        joinedAt: '2026-03-23T00:00:00.000Z',
        projectId: 'project-alpha',
        role: 'owner',
        userId: 'user-alice',
      },
      project: {
        createdAt: '2026-03-23T00:00:00.000Z',
        createdByUserId: 'user-alice',
        id: 'project-alpha',
        name: 'Tumor board project',
        spaceId: 'space-alpha',
        status: 'active',
        updatedAt: '2026-03-23T00:00:00.000Z',
      },
    };
    const projectDocRecord = {
      createdAt: '2026-03-23T00:30:00.000Z',
      createdByUserId: 'user-alice',
      id: 'doc-alpha',
      projectId: 'project-alpha',
      publishState: 'draft',
      title: 'Tumor board literature synthesis',
      updatedAt: '2026-03-23T00:30:00.000Z',
    } as const;
    const readingDetail = {
      asset: {
        abstractText: 'Imported PMID metadata for 654321',
        canonicalId: 'pmid:654321',
        createdAt: '2026-03-23T00:00:00.000Z',
        hasFile: true,
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
      excerpts: [
        {
          createdAt: '2026-03-23T00:05:00.000Z',
          createdByUserId: 'user-alice',
          endOffset: 24,
          id: 'excerpt-1',
          libraryEntryId: 'entry-1',
          locator: 'figure 1',
          note: 'Existing project excerpt note.',
          paperAssetId: 'asset-1',
          quote: 'Existing project reader excerpt',
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
          return jsonResponse(null);
        }

        if (requestUrl.endsWith('/api/reading/entry-1') && (!init?.method || init.method === 'GET')) {
          return jsonResponse(readingDetail);
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
            endOffset: 49,
            locator: 'figure 2',
            note: 'Project durable note',
            quote: 'Project durable reader excerpt',
            startOffset: 9,
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

        if (requestUrl.endsWith('/api/reading/notes') && init?.method === 'POST') {
          const body = JSON.parse(String(init.body)) as {
            body: string;
            libraryEntryId: string;
          };
          expect(body).toEqual({
            body: expect.any(String),
            libraryEntryId: 'entry-1',
          });
          const note = {
            authorUserId: 'user-alice',
            body: body.body,
            createdAt: '2026-03-23T00:10:00.000Z',
            id: `note-${readingDetail.notes.length + 1}`,
            kind: 'private_note' as const,
            libraryEntryId: 'entry-1',
          };
          readingDetail.notes.push(note);

          return jsonResponse(note, 200);
        }

        if (requestUrl.endsWith('/api/reading/entry-1/project-comments') && init?.method === 'POST') {
          const body = JSON.parse(String(init.body)) as {
            body: string;
            projectId?: string;
          };
          expect(body).toEqual({
            body: expect.any(String),
          });
          expect(body).not.toHaveProperty('projectId');
          const comment = {
            authorUserId: 'user-alice',
            body: body.body,
            createdAt: '2026-03-23T00:12:00.000Z',
            id: `comment-${readingDetail.projectComments.length + 1}`,
            kind: 'project_comment' as const,
            libraryEntryId: 'entry-1',
            projectId: 'project-alpha',
          };
          readingDetail.projectComments.push(comment);

          return jsonResponse({ comment }, 201);
        }

        if (requestUrl.endsWith('/api/reading/project-comments') && init?.method === 'POST') {
          const body = JSON.parse(String(init.body)) as {
            body: string;
            libraryEntryId: string;
            projectId?: string;
          };
          expect(body).toEqual({
            body: expect.any(String),
            libraryEntryId: 'entry-1',
          });
          expect(body).not.toHaveProperty('projectId');
          const comment = {
            authorUserId: 'user-alice',
            body: body.body,
            createdAt: '2026-03-23T00:10:00.000Z',
            id: `comment-${readingDetail.projectComments.length + 1}`,
            kind: 'project_comment' as const,
            libraryEntryId: 'entry-1',
            projectId: 'project-alpha',
          };
          readingDetail.projectComments.push(comment);

          return jsonResponse({ comment }, 200);
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

          return jsonResponse({ insight }, 200);
        }

        if (requestUrl.endsWith('/api/notebooks/capture') && init?.method === 'POST') {
          const body = JSON.parse(String(init.body)) as {
            notebookTitle: string;
            source: {
              generatedInsightId?: string;
              libraryEntryId?: string;
              readerExcerptId?: string;
              type: 'generatedInsight' | 'readerExcerpt';
            };
          };
          expect(body.notebookTitle).toBe('Reader evidence notebook');
          expect(body).not.toHaveProperty('ownerId');
          expect(body).not.toHaveProperty('projectId');
          expect(body).not.toHaveProperty('scope');
          expect(body).not.toHaveProperty('visibility');

          if (body.source.type === 'readerExcerpt') {
            expect(body.source).toMatchObject({
              libraryEntryId: 'entry-1',
              readerExcerptId: 'excerpt-2',
              type: 'readerExcerpt',
            });
            expect(body.source).not.toHaveProperty('ownerId');
            expect(body.source).not.toHaveProperty('projectId');
            expect(body.source).not.toHaveProperty('visibility');

            return jsonResponse({
              document: {
                createdAt: '2026-03-23T00:25:00.000Z',
                id: 'notebook-alpha',
                ownerId: 'user-alice',
                title: 'Reader evidence notebook',
                updatedAt: '2026-03-23T00:25:00.000Z',
              },
              snapshot: {
                capturedAt: '2026-03-23T00:25:00.000Z',
                citations: [
                  {
                    createdAt: '2026-03-23T00:25:00.000Z',
                    evidenceSpan: 'Project durable reader excerpt',
                    id: 'citation-excerpt-alpha',
                    notebookDocumentVersionId: 'notebook-version-excerpt-alpha',
                    paperAssetId: 'asset-1',
                    readerExcerptId: 'excerpt-2',
                  },
                ],
                content: 'Captured reader excerpt\n\n> Project durable reader excerpt',
                document: {
                  createdAt: '2026-03-23T00:25:00.000Z',
                  id: 'notebook-alpha',
                  ownerId: 'user-alice',
                  title: 'Reader evidence notebook',
                  updatedAt: '2026-03-23T00:25:00.000Z',
                },
                versionId: 'notebook-version-excerpt-alpha',
                versionNumber: 1,
              },
            });
          }

          expect(body.source).toMatchObject({
            generatedInsightId: 'insight-1',
            libraryEntryId: 'entry-1',
            type: 'generatedInsight',
          });

          return jsonResponse({
            document: {
              createdAt: '2026-03-23T00:25:00.000Z',
              id: 'notebook-alpha',
              ownerId: 'user-alice',
              title: 'Reader evidence notebook',
              updatedAt: '2026-03-23T00:25:00.000Z',
            },
            snapshot: {
              capturedAt: '2026-03-23T00:25:00.000Z',
              citations: [
                {
                  createdAt: '2026-03-23T00:25:00.000Z',
                  evidenceSpan: 'Tumor board evidence',
                  id: 'citation-alpha',
                  notebookDocumentVersionId: 'notebook-version-alpha',
                  paperAssetId: 'asset-1',
                },
              ],
              content: 'The imported paper supports the shared review workflow.\n\n> Tumor board evidence',
              document: {
                createdAt: '2026-03-23T00:25:00.000Z',
                id: 'notebook-alpha',
                ownerId: 'user-alice',
                title: 'Reader evidence notebook',
                updatedAt: '2026-03-23T00:25:00.000Z',
              },
              versionId: 'notebook-version-alpha',
              versionNumber: 1,
            },
          });
        }

        if (requestUrl.endsWith('/api/project-docs') && init?.method === 'POST') {
          return jsonResponse(projectDocRecord);
        }

        if (requestUrl.endsWith('/api/project-docs/doc-alpha/versions') && init?.method === 'POST') {
          const body = JSON.parse(String(init.body)) as {
            content?: string;
            documentContent?: {
              blocks: Array<{
                libraryEntryId?: string;
                paperAssetId?: string;
                quote?: string;
                text?: string;
                type: string;
              }>;
              schemaVersion: 1;
            };
          };
          expect(body).not.toHaveProperty('content');
          expectDocumentBlocksToOmitAuthorityFields(body.documentContent);
          expect(body.documentContent).toMatchObject({
            blocks: [
              {
                level: 2,
                text: 'Promoted Reader insight',
                type: 'heading',
              },
              {
                text: 'The imported paper supports the shared review workflow.',
                type: 'paragraph',
              },
              {
                libraryEntryId: 'entry-1',
                paperAssetId: 'asset-1',
                quote: 'Tumor board evidence',
                type: 'sourceExcerpt',
              },
            ],
            schemaVersion: 1,
          });
          const promotedParagraphBlock = body.documentContent?.blocks[1];
          promotedDraft = promotedParagraphBlock && 'text' in promotedParagraphBlock
            ? promotedParagraphBlock.text ?? ''
            : '';

          return jsonResponse({
            capturedAt: '2026-03-23T00:30:00.000Z',
            citations: [],
            content: promotedDraft,
            documentContent: body.documentContent,
            document: projectDocRecord,
            versionId: 'project-doc-version-1',
            versionNumber: 1,
          });
        }

        throw new Error(`Unexpected fetch: ${requestUrl}`);
      }),
    );

    renderWorkbench('/projects/project-alpha/library/entry-1/reader');

    expect(await screen.findByText('Tumor board biomarkers for rapid review')).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Open server-owned paper file' })).toHaveAttribute(
      'href',
      '/api/library/entry-1/file',
    );
    expect(screen.queryByText(/storageKey|papers\/asset-1|JIXIA_STORAGE_ROOT/i)).not.toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'AI 对话' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: '私人笔记' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: '共享评论' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: '关键信息' })).toBeInTheDocument();
    expect(screen.getByText('Existing project reader excerpt')).toBeInTheDocument();
    expect(screen.getByText('figure 1')).toBeInTheDocument();

    await user.clear(screen.getByLabelText('Reader excerpt quote'));
    await user.type(screen.getByLabelText('Reader excerpt quote'), 'Project durable reader excerpt');
    await user.clear(screen.getByLabelText('Start offset'));
    await user.type(screen.getByLabelText('Start offset'), '9');
    await user.clear(screen.getByLabelText('End offset'));
    await user.type(screen.getByLabelText('End offset'), '49');
    await user.type(screen.getByLabelText('Excerpt locator'), 'figure 2');
    await user.type(screen.getByLabelText('Excerpt note'), 'Project durable note');
    await user.click(screen.getByRole('button', { name: 'Save reader excerpt' }));

    expect(await screen.findByText('Saved reader excerpt.')).toBeInTheDocument();
    expect(screen.getByText('Project durable reader excerpt')).toBeInTheDocument();
    expect(screen.getByText('Offsets · 9-49')).toBeInTheDocument();

    const excerptRequest = vi.mocked(fetch).mock.calls.find(([input, init]) =>
      String(input).endsWith('/api/reading/entry-1/excerpts') && init?.method === 'POST',
    );
    expect(excerptRequest).toBeDefined();
    expect(JSON.parse(String(excerptRequest?.[1]?.body))).toEqual({
      endOffset: 49,
      locator: 'figure 2',
      note: 'Project durable note',
      quote: 'Project durable reader excerpt',
      startOffset: 9,
    });

    await user.click(screen.getByRole('button', { name: 'Send latest excerpt to Notebook' }));

    expect(
      await screen.findByText('Sent latest reader excerpt to private Notebook Reader evidence notebook.'),
    ).toBeInTheDocument();
    const excerptCaptureRequest = vi.mocked(fetch).mock.calls.find(([input, init]) => {
      if (!String(input).endsWith('/api/notebooks/capture') || init?.method !== 'POST') {
        return false;
      }

      const body = JSON.parse(String(init.body)) as {
        source?: { type?: string };
      };

      return body.source?.type === 'readerExcerpt';
    });
    expect(excerptCaptureRequest).toBeDefined();
    expect(JSON.parse(String(excerptCaptureRequest?.[1]?.body))).toEqual({
      notebookTitle: 'Reader evidence notebook',
      source: {
        libraryEntryId: 'entry-1',
        note: 'Captured from project Reader Tumor board project excerpt.',
        readerExcerptId: 'excerpt-2',
        type: 'readerExcerpt',
      },
    });

    await user.type(screen.getByRole('textbox', { name: 'Private note draft' }), 'Private note for later synthesis.');
    await user.click(screen.getByRole('button', { name: 'Save private note' }));
    expect(
      await screen.findByText('Private note for later synthesis.', { selector: 'p' }),
    ).toBeInTheDocument();

    await user.clear(screen.getByRole('textbox', { name: 'Project comment draft' }));
    await user.type(screen.getByRole('textbox', { name: 'Project comment draft' }), 'Project comment for later synthesis.');
    await user.click(screen.getByRole('button', { name: 'Save project comment' }));
    expect(
      await screen.findByText('Project comment for later synthesis.', { selector: 'p' }),
    ).toBeInTheDocument();

    const noteRequest = vi.mocked(fetch).mock.calls.find(([input, init]) =>
      String(input).endsWith('/api/reading/notes') && init?.method === 'POST',
    );
    const commentRequest = vi.mocked(fetch).mock.calls.find(([input, init]) =>
      String(input).endsWith('/api/reading/entry-1/project-comments') && init?.method === 'POST',
    );
    expect(noteRequest).toBeDefined();
    expect(commentRequest).toBeDefined();
    expect(JSON.parse(String(noteRequest?.[1]?.body))).not.toHaveProperty('visibility');
    expect(JSON.parse(String(commentRequest?.[1]?.body))).toMatchObject({
      body: 'Project comment for later synthesis.',
    });
    expect(JSON.parse(String(commentRequest?.[1]?.body))).not.toHaveProperty('projectId');

    await user.click(screen.getByRole('button', { name: 'Generate insight' }));
    await user.click(screen.getByRole('button', { name: 'Send latest insight to Notebook' }));

    expect(
      await screen.findByText('Sent latest insight to private Notebook Reader evidence notebook.'),
    ).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Open Notebook' })).toHaveAttribute('href', '/notebook');

    await user.click(screen.getByRole('button', { name: 'Promote latest insight to Writer' }));

    expect(await screen.findByText('Promoted latest insight into Writer as doc-alpha.')).toBeInTheDocument();
    expect(promotedDraft).toContain('shared review workflow');
    expect(screen.getByRole('link', { name: 'Open writing' })).toHaveAttribute(
      'href',
      '/projects/project-alpha/writing/doc-alpha',
    );
  });
});
