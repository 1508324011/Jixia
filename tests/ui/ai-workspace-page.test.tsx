import { render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { App } from '../../src/web/app';

function renderWorkbench(pathname = '/ai') {
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

describe('ai workspace page', () => {
  it('renders independent ai sessions with multi-paper context attachments', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
        const requestUrl =
          typeof input === 'string'
            ? input
            : input instanceof URL
              ? input.toString()
              : input.url;

        if (requestUrl.endsWith('/api/ai/workspace') && (!init?.method || init.method === 'GET')) {
          return jsonResponse({
            workspace: {
              activeSessionId: 'session-1',
              sessions: [
                {
                  attachedEntries: [
                    {
                      canonicalId: 'pmid:654321',
                      entryId: 'entry-1',
                      paperAssetId: 'asset-1',
                      title: 'Tumor board biomarkers for rapid review',
                    },
                    {
                      canonicalId: 'pmid:222222',
                      entryId: 'entry-2',
                      paperAssetId: 'asset-2',
                      title: 'Signal pathway evidence for review escalation',
                    },
                  ],
                  createdAt: '2026-03-25T09:00:00.000Z',
                  id: 'session-1',
                  summary: 'Hold one governed conversation across multiple imported papers.',
                  title: 'Cross-paper biomarker synthesis',
                  updatedAt: '2026-03-25T09:20:00.000Z',
                },
                {
                  attachedEntries: [],
                  createdAt: '2026-03-25T08:00:00.000Z',
                  id: 'session-2',
                  summary: 'Keep a separate drafting conversation outside the reader route.',
                  title: 'Draft introduction notes',
                  updatedAt: '2026-03-25T08:40:00.000Z',
                },
              ],
            },
          });
        }

        throw new Error(`Unexpected fetch: ${requestUrl}`);
      }),
    );

    renderWorkbench('/ai');

    expect(await screen.findByRole('heading', { name: 'AI Workspace' })).toBeInTheDocument();
    const aiShell = screen.getByLabelText('AI workspace shell');
    expect(within(aiShell).getByRole('heading', { name: 'AI sessions' })).toBeInTheDocument();
    expect(within(aiShell).getByText('Cross-paper biomarker synthesis')).toBeInTheDocument();
    expect(within(aiShell).getByText('Draft introduction notes')).toBeInTheDocument();

    const attachments = screen.getByLabelText('AI context attachments');
    expect(within(attachments).getByText('Tumor board biomarkers for rapid review')).toBeInTheDocument();
    expect(within(attachments).getByText('Signal pathway evidence for review escalation')).toBeInTheDocument();
  });
});
