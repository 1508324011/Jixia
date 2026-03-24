import { render, screen, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { App } from '../../src/web/app';

function jsonResponse(payload: unknown): Response {
  return new Response(JSON.stringify(payload), {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
    },
    status: 200,
  });
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('search intake layout', () => {
  it('renders source sections with stable result density instead of equal-height sparse boards', async () => {
    const user = userEvent.setup();

    window.history.replaceState({}, '', '/search');

    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string | URL | Request) => {
        const requestUrl =
          typeof input === 'string'
            ? input
            : input instanceof URL
              ? input.toString()
              : input.url;

        if (requestUrl.includes('/api/discovery/search')) {
          return jsonResponse({
            boards: [
              {
                id: 'pubmed-board',
                items: [
                  {
                    abstractText: 'Curated abstract snippet for rapid triage.',
                    canonicalId: 'pmid:654321',
                    id: 'pubmed-result',
                    imported: false,
                    objectType: 'external-candidate',
                    reason: 'PubMed result matched the tumor board intake query.',
                    sourceLabel: 'PubMed',
                    sourceLocator: '654321',
                    sourceType: 'pmid',
                    state: 'new',
                    title: 'Tumor board biomarkers for rapid review',
                  },
                ],
                title: 'PubMed',
              },
              {
                id: 'arxiv-board',
                items: [
                  {
                    abstractText: 'Preprint abstract focused on multimodal intake signals.',
                    canonicalId: 'arxiv:2403.12345',
                    id: 'arxiv-result',
                    imported: false,
                    objectType: 'external-candidate',
                    reason: 'arXiv preprint extends the project’s intake horizon.',
                    sourceLabel: 'arXiv',
                    sourceLocator: '2403.12345',
                    sourceType: 'arxiv',
                    state: 'new',
                    title: 'Multimodal evidence triage for tumor boards',
                  },
                ],
                title: 'arXiv',
              },
            ],
            items: [],
            query: 'tumor board',
          });
        }

        throw new Error(`Unexpected fetch: ${requestUrl}`);
      }),
    );

    render(<App />);

    await user.click(screen.getByRole('button', { name: 'Search intake boards' }));

    const pubmedLane = await screen.findByRole('region', { name: 'PubMed intake lane' });
    expect(screen.getByRole('region', { name: 'arXiv intake lane' })).toBeInTheDocument();
    expect(screen.queryByTestId('equal-height-search-board')).not.toBeInTheDocument();
    expect(within(pubmedLane).getByText('Curated abstract snippet for rapid triage.')).toBeInTheDocument();
  });
});
