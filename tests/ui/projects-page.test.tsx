import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { App } from '../../src/web/app';

function jsonResponse(payload: unknown, status = 200): Response {
  return new Response(JSON.stringify(payload), {
    headers: {
      'Content-Type': 'application/json; charset=utf-8',
    },
    status,
  });
}

function renderWorkbench(pathname: string) {
  window.history.replaceState({}, '', pathname);
  render(<App />);
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('projects page', () => {
  it('creates a project only from an explicit name and server-visible governance space', async () => {
    const user = userEvent.setup();
    const createdProjects: Array<{
      membership: {
        joinedAt: string;
        projectId: string;
        role: string;
        userId: string;
      };
      project: {
        createdAt: string;
        createdByUserId: string;
        id: string;
        name: string;
        spaceId: string;
        status: string;
        updatedAt: string;
      };
    }> = [];
    const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const requestUrl =
        typeof input === 'string'
          ? input
          : input instanceof URL
            ? input.toString()
            : input.url;
      const url = new URL(requestUrl, window.location.origin);

      if (url.pathname === '/api/session/me') {
        return jsonResponse({
          user: {
            displayName: 'Alice',
            email: 'alice@example.test',
            id: 'user-alice',
          },
        });
      }

      if (url.pathname === '/api/spaces' && init?.method === 'POST') {
        throw new Error('Projects page must not create a fallback governance space.');
      }

      if (url.pathname === '/api/spaces') {
        return jsonResponse([
          {
            createdAt: '2026-05-03T00:00:00.000Z',
            id: 'space-alpha',
            kind: 'shared',
            name: 'Alpha Governance Space',
          },
        ]);
      }

      if (url.pathname === '/api/projects' && init?.method === 'POST') {
        const body = JSON.parse(String(init.body)) as Record<string, unknown>;
        expect(body).toEqual({
          name: 'Server-owned collaboration lane',
          spaceId: 'space-alpha',
        });
        expect(body).not.toHaveProperty('actorUserId');
        expect(body).not.toHaveProperty('userId');

        const createdProject = {
          membership: {
            joinedAt: '2026-05-03T00:05:00.000Z',
            projectId: 'project-created',
            role: 'owner',
            userId: 'user-alice',
          },
          project: {
            createdAt: '2026-05-03T00:05:00.000Z',
            createdByUserId: 'user-alice',
            id: 'project-created',
            name: 'Server-owned collaboration lane',
            spaceId: 'space-alpha',
            status: 'active',
            updatedAt: '2026-05-03T00:05:00.000Z',
          },
        };
        createdProjects.push(createdProject);

        return jsonResponse(createdProject, 201);
      }

      if (url.pathname === '/api/projects') {
        return jsonResponse(createdProjects);
      }

      if (url.pathname === '/api/projects/project-created/members') {
        return jsonResponse([createdProjects[0]?.membership]);
      }

      throw new Error(`Unexpected fetch: ${requestUrl}`);
    });

    vi.stubGlobal('fetch', fetchMock);

    renderWorkbench('/projects');

    expect(await screen.findByRole('heading', { name: 'Projects' })).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByLabelText('Governance space')).toHaveValue('space-alpha');
    });
    expect(screen.getByRole('button', { name: 'Create project' })).toBeDisabled();

    await user.type(
      screen.getByLabelText('Project name'),
      'Server-owned collaboration lane',
    );
    await user.click(screen.getByRole('button', { name: 'Create project' }));

    expect(
      await screen.findByRole('heading', { name: 'Server-owned collaboration lane' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Governed by space · space-alpha')).toBeInTheDocument();
    await waitFor(() => {
      expect(
        fetchMock.mock.calls.some(([input, init]) => {
          const requestUrl =
            typeof input === 'string'
              ? input
              : input instanceof URL
                ? input.toString()
                : input.url;
          return new URL(requestUrl, window.location.origin).pathname === '/api/spaces' &&
            init?.method === 'POST';
        }),
      ).toBe(false);
    });
  });

  it('refreshes shell context after creating and opening a project', async () => {
    const user = userEvent.setup();
    const createdProjects: Array<{
      membership: {
        joinedAt: string;
        projectId: string;
        role: string;
        userId: string;
      };
      project: {
        createdAt: string;
        createdByUserId: string;
        id: string;
        name: string;
        spaceId: string;
        status: string;
        updatedAt: string;
      };
    }> = [];
    const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const requestUrl =
        typeof input === 'string'
          ? input
          : input instanceof URL
            ? input.toString()
            : input.url;
      const url = new URL(requestUrl, window.location.origin);

      if (url.pathname === '/api/session/me') {
        return jsonResponse({
          user: {
            displayName: 'Alice',
            email: 'alice@example.test',
            id: 'user-alice',
          },
        });
      }

      if (url.pathname === '/api/spaces' && init?.method === 'POST') {
        throw new Error('Projects page must not create a fallback governance space.');
      }

      if (url.pathname === '/api/spaces') {
        return jsonResponse([
          {
            createdAt: '2026-05-03T00:00:00.000Z',
            id: 'space-alpha',
            kind: 'shared',
            name: 'Alpha Governance Space',
          },
        ]);
      }

      if (url.pathname === '/api/projects' && init?.method === 'POST') {
        const body = JSON.parse(String(init.body)) as Record<string, unknown>;
        expect(body).toEqual({
          name: 'Server-owned collaboration lane',
          spaceId: 'space-alpha',
        });
        expect(body).not.toHaveProperty('actorUserId');
        expect(body).not.toHaveProperty('userId');

        const createdProject = {
          membership: {
            joinedAt: '2026-05-03T00:05:00.000Z',
            projectId: 'project-created',
            role: 'owner',
            userId: 'user-alice',
          },
          project: {
            createdAt: '2026-05-03T00:05:00.000Z',
            createdByUserId: 'user-alice',
            id: 'project-created',
            name: 'Server-owned collaboration lane',
            spaceId: 'space-alpha',
            status: 'active',
            updatedAt: '2026-05-03T00:05:00.000Z',
          },
        };
        createdProjects.push(createdProject);

        return jsonResponse(createdProject, 201);
      }

      if (url.pathname === '/api/projects') {
        return jsonResponse(createdProjects);
      }

      if (url.pathname === '/api/library') {
        return jsonResponse([]);
      }

      if (url.pathname === '/api/projects/project-created/members') {
        return jsonResponse([createdProjects[0]?.membership]);
      }

      throw new Error(`Unexpected fetch: ${requestUrl}`);
    });

    vi.stubGlobal('fetch', fetchMock);

    renderWorkbench('/projects');

    expect(await screen.findByRole('heading', { name: 'Projects' })).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByLabelText('Governance space')).toHaveValue('space-alpha');
    });

    await user.type(
      screen.getByLabelText('Project name'),
      'Server-owned collaboration lane',
    );
    await user.click(screen.getByRole('button', { name: 'Create project' }));

    expect(
      await screen.findByRole('heading', { name: 'Server-owned collaboration lane' }),
    ).toBeInTheDocument();

    await user.click(screen.getByRole('link', { name: 'Open project library' }));

    expect(await screen.findByRole('heading', { name: 'Library' })).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByRole('region', { name: 'current context' })).toHaveTextContent(
        'Project / Server-owned collaboration lane',
      );
    });
  });
});
