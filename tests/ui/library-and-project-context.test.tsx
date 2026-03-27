import { cleanup, render, screen, within } from '@testing-library/react';
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

describe('library and project context', () => {
  it('library surfaces expose the unified inventory views in personal and project contexts', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string | URL) => {
        const url = input.toString();

        if (url.endsWith('/api/library/personal')) {
          return new Response(
            JSON.stringify({
              entries: [
                {
                  abstractText: 'Personal evidence summary for notebook-first triage.',
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

        if (url.endsWith('/api/spaces')) {
          return new Response(
            JSON.stringify({
              spaces: [
                {
                  importLocator: 'pmid:123456',
                  kind: 'shared',
                  name: 'Tumor Board Shared Space',
                  projectId: 'project-1',
                  spaceId: 'shared-space',
                  visibility: 'space_shared',
                },
              ],
            }),
            {
              headers: { 'Content-Type': 'application/json' },
              status: 200,
            },
          );
        }

        if (url.endsWith('/api/spaces/shared-space/projects/project-1/library')) {
          return new Response(
            JSON.stringify({
              entries: [
                {
                  abstractText: 'Shared-space evidence summary for tumor board project triage.',
                  addedAt: '2026-03-24T09:30:00.000Z',
                  canonicalId: 'pmid:222222',
                  createdAt: '2026-03-24T08:15:00.000Z',
                  entryId: 'entry-project',
                  paperAssetId: 'asset-project',
                  sourceLabel: 'PubMed',
                  sourceType: 'pmid',
                  spaceId: 'shared-space',
                  title: 'Tumor board evidence record',
                  visibility: 'space_shared',
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
    expect(await screen.findByRole('heading', { name: 'Library inventory' })).toBeInTheDocument();
    expect(screen.getByTestId('library-inventory-surface')).toHaveAttribute('data-density', 'dense');
    expect(screen.getByText('Inventory view')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'All records' })).toBeInTheDocument();
    const personalEntryHeading = await screen.findByRole('heading', { name: 'Personal evidence note' });
    const personalEntry = personalEntryHeading.closest('article');
    expect(personalEntry).not.toBeNull();
    if (!personalEntry) {
      throw new Error('Expected personal entry article to be rendered.');
    }
    expect(within(personalEntry).getByText('Source')).toBeInTheDocument();
    expect(within(personalEntry).getByRole('link', { name: 'Open notebook' })).toHaveAttribute(
      'href',
      '/library/entry-personal/notes',
    );
    expect(await screen.findByRole('link', { name: 'Open reader' })).toHaveAttribute(
      'href',
      '/library/entry-personal/reader',
    );

    cleanup();

    renderWorkbench('/projects/project-1/library?spaceId=shared-space');
    expect(await screen.findByRole('heading', { name: 'Library inventory' })).toBeInTheDocument();
    expect(screen.getByTestId('library-inventory-surface')).toHaveAttribute('data-density', 'dense');
    expect(screen.getByRole('main')).toHaveClass('workbench-route');
    expect(screen.queryByText('Shared evidence shelf')).not.toBeInTheDocument();
    const projectEntryHeading = await screen.findByRole('heading', {
      name: 'Tumor board evidence record',
    });
    const projectEntry = projectEntryHeading.closest('article');
    expect(projectEntry).not.toBeNull();
    if (!projectEntry) {
      throw new Error('Expected project entry article to be rendered.');
    }
    expect(within(projectEntry).getByText('Source')).toBeInTheDocument();
    expect(within(projectEntry).getByRole('link', { name: 'Open notebook' })).toHaveAttribute(
      'href',
      '/projects/project-1/library/entry-project/notes?spaceId=shared-space',
    );
    expect(await screen.findByRole('link', { name: 'Open reader' })).toHaveAttribute(
      'href',
      '/projects/project-1/library/entry-project/reader?spaceId=shared-space',
    );
  });
});
