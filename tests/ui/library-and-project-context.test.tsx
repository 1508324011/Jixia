import { cleanup, render, screen } from '@testing-library/react';
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
                  canonicalId: 'pmid:111111',
                  entryId: 'entry-personal',
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
                  canonicalId: 'pmid:222222',
                  entryId: 'entry-project',
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
    expect(screen.getByText('Personal')).toBeInTheDocument();
    expect(await screen.findByRole('heading', { name: 'Library inventory' })).toBeInTheDocument();
    expect(screen.getByText('Inventory view')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'All records' })).toBeInTheDocument();
    expect(await screen.findByRole('link', { name: 'Open reader' })).toHaveAttribute(
      'href',
      '/library/entry-personal/reader',
    );

    cleanup();

    renderWorkbench('/projects/project-1/library?spaceId=shared-space');
    expect(screen.getByText('Project / 肿瘤标志物项目')).toBeInTheDocument();
    expect(await screen.findByRole('heading', { name: 'Library inventory' })).toBeInTheDocument();
    expect(screen.getByText('Shared evidence shelf')).toBeInTheDocument();
    expect(await screen.findByRole('link', { name: 'Open reader' })).toHaveAttribute(
      'href',
      '/projects/project-1/library/entry-project/reader?spaceId=shared-space',
    );
  });
});
