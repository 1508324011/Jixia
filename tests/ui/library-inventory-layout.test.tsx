import { render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { App } from '../../src/web/app';

function renderWorkbench(pathname: string) {
  window.history.replaceState({}, '', pathname);
  render(<App />);
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('library inventory layout', () => {
  it('renders the library as a full-width inventory surface with list density suited for desktop work', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string | URL) => {
        const url = input.toString();

        if (url.endsWith('/api/library/personal')) {
          return new Response(
            JSON.stringify({
              entries: [
                {
                  abstractText: 'Personal inventory abstract for wide desktop triage.',
                  addedAt: '2026-03-24T09:00:00.000Z',
                  canonicalId: 'pmid:111111',
                  createdAt: '2026-03-24T08:45:00.000Z',
                  entryId: 'entry-personal',
                  paperAssetId: 'asset-personal',
                  sourceLabel: 'PubMed',
                  sourceType: 'pmid',
                  spaceId: 'personal-space-user-alice',
                  title: 'Personal evidence note',
                  visibility: 'private',
                },
              ],
            }),
            {
              headers: { 'Content-Type': 'application/json' },
              status: 200,
            },
          );
        }

        throw new Error(`Unexpected fetch request: ${url}`);
      }),
    );

    renderWorkbench('/library');

    const inventorySurface = await screen.findByTestId('library-inventory-surface');
    expect(inventorySurface).toHaveAttribute('data-density', 'dense');
    expect(inventorySurface).toHaveAttribute('data-layout-mode', 'inventory');
    expect(within(inventorySurface).getByText('Source')).toBeInTheDocument();
    expect(within(inventorySurface).getByText('Imported')).toBeInTheDocument();
    expect(within(inventorySurface).getByText('PubMed')).toBeInTheDocument();
  });
});
