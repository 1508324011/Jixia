import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { CommandPalette } from '../../src/web/components/command-palette';

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

describe('command palette', () => {
  it('searches server-owned objects without actor fields and navigates to the selected route', async () => {
    const navigate = vi.fn();
    const commandSearchCalls: Array<{ credentials?: RequestCredentials; url: URL }> = [];
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
        const requestUrl = new URL(
          typeof input === 'string'
            ? input
            : input instanceof URL
              ? input.toString()
              : input.url,
        );

        if (requestUrl.pathname === '/api/command-search') {
          commandSearchCalls.push({
            credentials: init?.credentials,
            url: requestUrl,
          });

          return jsonResponse({
            contract: 'jixia-command-search-contract',
            generatedAt: '2026-05-18T00:00:00.000Z',
            projectId: requestUrl.searchParams.get('projectId') ?? undefined,
            query: requestUrl.searchParams.get('query') ?? '',
            results: [
              {
                id: 'project-doc:doc-command',
                kind: 'project-doc',
                route: '/projects/project-1/writing/doc-command',
                scope: {
                  id: 'project-1',
                  projectId: 'project-1',
                  type: 'project',
                },
                subtitle: 'Project Doc · draft',
                title: 'Shared command synthesis',
                updatedAt: '2026-05-18T00:00:00.000Z',
              },
            ],
            totalCount: 1,
          });
        }

        throw new Error(`Unexpected fetch: ${requestUrl.toString()}`);
      }),
    );

    render(<CommandPalette projectId="project-1" onNavigate={navigate} />);

    await userEvent.click(screen.getByRole('button', { name: /search workspace objects/i }));
    await userEvent.type(
      screen.getByRole('textbox', { name: /search server-visible jixia objects/i }),
      'synthesis',
    );

    await waitFor(() => {
      expect(commandSearchCalls.some((call) => call.url.searchParams.get('query') === 'synthesis')).toBe(true);
    });

    const latestCall = commandSearchCalls[commandSearchCalls.length - 1];
    expect(latestCall?.credentials).toBe('same-origin');
    expect(latestCall?.url.searchParams.get('projectId')).toBe('project-1');
    for (const forbiddenField of [
      'actorUserId',
      'requestedByUserId',
      'userId',
      'authorUserId',
      'startedByUserId',
      'actorSpaceId',
    ]) {
      expect(latestCall?.url.searchParams.has(forbiddenField)).toBe(false);
    }

    await userEvent.click(await screen.findByRole('option', { name: /shared command synthesis/i }));
    expect(navigate).toHaveBeenCalledWith('/projects/project-1/writing/doc-command');
  });

  it('opens from Ctrl+K or Cmd+K and renders loading then empty state from the server index', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string | URL | Request) => {
        const requestUrl = new URL(
          typeof input === 'string'
            ? input
            : input instanceof URL
              ? input.toString()
              : input.url,
        );

        if (requestUrl.pathname !== '/api/command-search') {
          throw new Error(`Unexpected fetch: ${requestUrl.toString()}`);
        }

        return jsonResponse({
          contract: 'jixia-command-search-contract',
          generatedAt: '2026-05-18T00:00:00.000Z',
          query: requestUrl.searchParams.get('query') ?? '',
          results: [],
          totalCount: 0,
        });
      }),
    );

    render(<CommandPalette onNavigate={vi.fn()} />);

    expect(screen.getByText('Ctrl/Cmd K')).toBeInTheDocument();

    fireEvent.keyDown(window, { ctrlKey: true, key: 'k' });

    expect(await screen.findByRole('dialog', { name: /command palette/i })).toBeInTheDocument();
    expect(screen.getByText(/searching server-visible objects/i)).toBeInTheDocument();

    expect(
      await screen.findByText(/no visible objects matched this query/i),
    ).toBeInTheDocument();
    expect(screen.getByText('0 results')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /close/i }));
    expect(screen.queryByRole('dialog', { name: /command palette/i })).not.toBeInTheDocument();

    fireEvent.keyDown(window, { metaKey: true, key: 'k' });
    expect(await screen.findByRole('dialog', { name: /command palette/i })).toBeInTheDocument();
  });

  it('renders server errors without falling back to local fixture authority', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string | URL | Request) => {
        const requestUrl = new URL(
          typeof input === 'string'
            ? input
            : input instanceof URL
              ? input.toString()
              : input.url,
        );

        if (requestUrl.pathname !== '/api/command-search') {
          throw new Error(`Unexpected fetch: ${requestUrl.toString()}`);
        }

        return jsonResponse({ error: 'Command index unavailable.' }, 503);
      }),
    );

    render(<CommandPalette onNavigate={vi.fn()} />);

    await userEvent.click(screen.getByRole('button', { name: /search workspace objects/i }));

    expect(await screen.findByText('Command index unavailable.')).toBeInTheDocument();
    expect(screen.queryByRole('option')).not.toBeInTheDocument();
  });

  it('clears stale scoped results when the palette closes before another project search', async () => {
    const navigate = vi.fn();
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string | URL | Request) => {
        const requestUrl = new URL(
          typeof input === 'string'
            ? input
            : input instanceof URL
              ? input.toString()
              : input.url,
        );

        if (requestUrl.pathname !== '/api/command-search') {
          throw new Error(`Unexpected fetch: ${requestUrl.toString()}`);
        }

        return jsonResponse({
          contract: 'jixia-command-search-contract',
          generatedAt: '2026-05-18T00:00:00.000Z',
          projectId: requestUrl.searchParams.get('projectId') ?? undefined,
          query: requestUrl.searchParams.get('query') ?? '',
          results: [
            {
              id: 'project-doc:doc-stale',
              kind: 'project-doc',
              route: '/projects/project-1/writing/doc-stale',
              scope: {
                id: 'project-1',
                projectId: 'project-1',
                type: 'project',
              },
              title: 'Project one stale result',
            },
          ],
          totalCount: 1,
        });
      }),
    );

    const { rerender } = render(
      <CommandPalette projectId="project-1" onNavigate={navigate} />,
    );

    await userEvent.click(screen.getByRole('button', { name: /search workspace objects/i }));
    expect(await screen.findByRole('option', { name: /project one stale result/i })).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: /close/i }));
    rerender(<CommandPalette projectId="project-2" onNavigate={navigate} />);
    await userEvent.click(screen.getByRole('button', { name: /search workspace objects/i }));

    expect(screen.queryByRole('option', { name: /project one stale result/i })).not.toBeInTheDocument();
    expect(screen.getByText(/searching server-visible objects/i)).toBeInTheDocument();
  });
});
