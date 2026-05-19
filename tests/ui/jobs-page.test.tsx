import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { App } from '../../src/web/app';
import { apiClient } from '../../src/web/lib/http-client';

function renderWorkbench(pathname = '/jobs') {
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

function createDeferred<T>() {
  let resolve: (value: T) => void = () => {
    throw new Error('Deferred resolver was called before initialization.');
  };
  let reject: (error?: unknown) => void = () => {
    throw new Error('Deferred rejecter was called before initialization.');
  };

  const promise = new Promise<T>((nextResolve, nextReject) => {
    resolve = nextResolve;
    reject = nextReject;
  });

  return { promise, reject, resolve };
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('jobs page', () => {
  it('lists and creates personal jobs with user scope after the user explicitly selects a governance space', async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
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

      if (requestUrl.endsWith('/api/spaces')) {
        return jsonResponse([
          {
            createdAt: '2026-05-11T00:00:00.000Z',
            id: 'space-personal-alice',
            kind: 'personal',
            name: 'Alice Personal Space',
          },
          {
            createdAt: '2026-05-11T00:00:00.000Z',
            id: 'space-shared-alpha',
            kind: 'shared',
            name: 'Alpha Governance Space',
          },
        ]);
      }

      if (requestUrl.endsWith('/api/projects')) {
        return jsonResponse([]);
      }

      if (requestUrl.endsWith('/api/credentials')) {
        return jsonResponse([
          {
            createdAt: '2026-05-11T00:00:00.000Z',
            credentialRef: 'cred-alice',
            provider: 'openai',
            userId: 'user-alice',
          },
        ]);
      }

      if (requestUrl.includes('/api/jobs?')) {
        const url = new URL(requestUrl);
        expect(url.searchParams.get('scopeType')).toBe('user');
        expect(url.searchParams.get('scopeId')).toBe('user-alice');
        expect(url.searchParams.get('spaceId')).toBeNull();
        return jsonResponse([]);
      }

      if (requestUrl.endsWith('/api/jobs') && init?.method === 'POST') {
        const body = JSON.parse(String(init.body)) as {
          credentialRef: string;
          kind: string;
          payload: { prompt: string };
          scope: { id: string; type: 'user' | 'project' };
          spaceId: string;
        };

        expect(body).toMatchObject({
          credentialRef: 'cred-alice',
          kind: 'ai.summary',
          scope: { id: 'user-alice', type: 'user' },
          spaceId: 'space-shared-alpha',
        });
        expect(body.payload.prompt).toMatch(/personal lane/i);

        return jsonResponse({
          createdAt: '2026-05-11T00:01:00.000Z',
          credentialRef: 'cred-alice',
          id: 'job-personal-1',
          kind: 'ai.summary',
          scope: { id: 'user-alice', type: 'user' },
          scopeId: 'user-alice',
          scopeType: 'user',
          spaceId: 'space-shared-alpha',
          status: 'queued',
        });
      }

      if (requestUrl.endsWith('/api/jobs/job-personal-1/run') && init?.method === 'POST') {
        return jsonResponse({
          createdAt: '2026-05-11T00:01:00.000Z',
          credentialRef: 'cred-alice',
          id: 'job-personal-1',
          kind: 'ai.summary',
          scope: { id: 'user-alice', type: 'user' },
          scopeId: 'user-alice',
          scopeType: 'user',
          spaceId: 'space-shared-alpha',
          status: 'succeeded',
        });
      }

      if (requestUrl.endsWith('/api/jobs/job-personal-1/events')) {
        return jsonResponse([
          {
            id: 'job-event-1',
            jobId: 'job-personal-1',
            message: 'Queued personal job.',
            recordedAt: '2026-05-11T00:01:00.000Z',
            status: 'queued',
          },
        ]);
      }

      if (requestUrl.endsWith('/api/jobs/job-personal-1/audit')) {
        return jsonResponse([
          {
            action: 'job.created',
            actorUserId: 'user-alice',
            detail: 'Created ai.summary with credential cred-alice.',
            id: 'audit-1',
            jobId: 'job-personal-1',
            recordedAt: '2026-05-11T00:01:00.000Z',
            spaceId: 'space-shared-alpha',
          },
        ]);
      }

      if (requestUrl.endsWith('/api/jobs/job-personal-1/stream')) {
        return new Response('', {
          headers: {
            'Content-Type': 'text/event-stream; charset=utf-8',
          },
          status: 200,
        });
      }

      throw new Error(`Unexpected fetch: ${requestUrl}`);
    });

    vi.stubGlobal('fetch', fetchMock);

    renderWorkbench('/jobs');

    expect(await screen.findByRole('heading', { name: 'Jobs' })).toBeInTheDocument();
    await waitFor(() => {
      expect(screen.getByRole('heading', { name: 'Governance space required' })).toBeInTheDocument();
      expect(screen.getByLabelText('Jobs governance space')).toHaveValue('');
    });

    await user.selectOptions(
      screen.getByLabelText('Jobs governance space'),
      'space-personal-alice',
    );

    await user.selectOptions(
      screen.getByLabelText('Jobs governance space'),
      'space-shared-alpha',
    );

    await user.click(screen.getByRole('button', { name: 'Create and run scoped job' }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringMatching(/\/api\/jobs$/),
        expect.objectContaining({ method: 'POST' }),
      );
    });

    expect(
      fetchMock.mock.calls.some(([input, init]) => {
        const requestUrl =
          typeof input === 'string'
            ? input
            : input instanceof URL
              ? input.toString()
              : input.url;

        return requestUrl.endsWith('/api/credentials') && init?.method === 'POST';
      }),
    ).toBe(false);
    expect(
      fetchMock.mock.calls.some(([input, init]) => {
        const requestUrl =
          typeof input === 'string'
            ? input
            : input instanceof URL
              ? input.toString()
              : input.url;

        return requestUrl.endsWith('/api/spaces') && init?.method === 'POST';
      }),
    ).toBe(false);
  });

  it('lists and creates project jobs with project scope and the real project governance space', async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
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

      if (requestUrl.endsWith('/api/spaces')) {
        return jsonResponse([
          {
            createdAt: '2026-05-11T00:00:00.000Z',
            id: 'space-personal-alice',
            kind: 'personal',
            name: 'Alice Personal Space',
          },
        ]);
      }

      if (requestUrl.endsWith('/api/projects')) {
        return jsonResponse([
          {
            membership: {
              joinedAt: '2026-05-11T00:00:00.000Z',
              projectId: 'project-alpha',
              role: 'editor',
              userId: 'user-alice',
            },
            project: {
              createdAt: '2026-05-11T00:00:00.000Z',
              createdByUserId: 'user-alice',
              id: 'project-alpha',
              name: 'Project Alpha',
              spaceId: 'space-project-alpha',
              status: 'active',
              updatedAt: '2026-05-11T00:00:00.000Z',
            },
          },
        ]);
      }

      if (requestUrl.endsWith('/api/credentials')) {
        return jsonResponse([
          {
            createdAt: '2026-05-11T00:00:00.000Z',
            credentialRef: 'cred-alice',
            provider: 'openai',
            userId: 'user-alice',
          },
        ]);
      }

      if (requestUrl.includes('/api/jobs?')) {
        const url = new URL(requestUrl);

        if (url.searchParams.get('scopeType') === 'project') {
          expect(url.searchParams.get('scopeId')).toBe('project-alpha');
          expect(url.searchParams.get('spaceId')).toBe('space-project-alpha');
        }

        return jsonResponse([]);
      }

      if (requestUrl.endsWith('/api/jobs') && init?.method === 'POST') {
        const body = JSON.parse(String(init.body)) as {
          credentialRef: string;
          scope: { id: string; type: 'user' | 'project' };
          spaceId: string;
        };

        expect(body).toMatchObject({
          credentialRef: 'cred-alice',
          scope: { id: 'project-alpha', type: 'project' },
          spaceId: 'space-project-alpha',
        });

        return jsonResponse({
          createdAt: '2026-05-11T00:02:00.000Z',
          credentialRef: 'cred-alice',
          id: 'job-project-1',
          kind: 'ai.summary',
          scope: { id: 'project-alpha', type: 'project' },
          scopeId: 'project-alpha',
          scopeType: 'project',
          spaceId: 'space-project-alpha',
          status: 'queued',
        });
      }

      if (requestUrl.endsWith('/api/jobs/job-project-1/run') && init?.method === 'POST') {
        return jsonResponse({
          createdAt: '2026-05-11T00:02:00.000Z',
          credentialRef: 'cred-alice',
          id: 'job-project-1',
          kind: 'ai.summary',
          scope: { id: 'project-alpha', type: 'project' },
          scopeId: 'project-alpha',
          scopeType: 'project',
          spaceId: 'space-project-alpha',
          status: 'succeeded',
        });
      }

      if (requestUrl.endsWith('/api/jobs/job-project-1/events')) {
        return jsonResponse([]);
      }

      if (requestUrl.endsWith('/api/jobs/job-project-1/audit')) {
        return jsonResponse([]);
      }

      if (requestUrl.endsWith('/api/jobs/job-project-1/stream')) {
        return new Response('', {
          headers: {
            'Content-Type': 'text/event-stream; charset=utf-8',
          },
          status: 200,
        });
      }

      throw new Error(`Unexpected fetch: ${requestUrl}`);
    });

    vi.stubGlobal('fetch', fetchMock);

    renderWorkbench('/jobs');

    expect(await screen.findByRole('heading', { name: 'Jobs' })).toBeInTheDocument();
    await screen.findByRole('option', { name: 'Project · Project Alpha' });

    await user.selectOptions(screen.getByLabelText('Jobs scope'), 'project:project-alpha');

    await waitFor(() => {
      expect(screen.queryByLabelText('Jobs governance space')).not.toBeInTheDocument();
    });

    await user.click(screen.getByRole('button', { name: 'Create and run scoped job' }));

    await waitFor(() => {
      expect(fetchMock).toHaveBeenCalledWith(
        expect.stringMatching(/\/api\/jobs$/),
        expect.objectContaining({ method: 'POST' }),
      );
    });
  });

  it('shows an explicit runtime error when the server denies the selected scoped job action', async () => {
    const user = userEvent.setup();
    const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
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

      if (requestUrl.endsWith('/api/spaces')) {
        return jsonResponse([
          {
            createdAt: '2026-05-11T00:00:00.000Z',
            id: 'space-personal-alice',
            kind: 'personal',
            name: 'Alice Personal Space',
          },
        ]);
      }

      if (requestUrl.endsWith('/api/projects')) {
        return jsonResponse([
          {
            membership: {
              joinedAt: '2026-05-11T00:00:00.000Z',
              projectId: 'project-alpha',
              role: 'viewer',
              userId: 'user-alice',
            },
            project: {
              createdAt: '2026-05-11T00:00:00.000Z',
              createdByUserId: 'user-alice',
              id: 'project-alpha',
              name: 'Project Alpha',
              spaceId: 'space-project-alpha',
              status: 'active',
              updatedAt: '2026-05-11T00:00:00.000Z',
            },
          },
        ]);
      }

      if (requestUrl.endsWith('/api/credentials')) {
        return jsonResponse([
          {
            createdAt: '2026-05-11T00:00:00.000Z',
            credentialRef: 'cred-alice',
            provider: 'openai',
            userId: 'user-alice',
          },
        ]);
      }

      if (requestUrl.includes('/api/jobs?')) {
        return jsonResponse([]);
      }

      if (requestUrl.endsWith('/api/jobs') && init?.method === 'POST') {
        const body = JSON.parse(String(init.body)) as {
          credentialRef: string;
          scope: { id: string; type: 'user' | 'project' };
          spaceId: string;
        };

        expect(body).toMatchObject({
          credentialRef: 'cred-alice',
          scope: { id: 'project-alpha', type: 'project' },
          spaceId: 'space-project-alpha',
        });

        return jsonResponse(
          { error: 'Access denied for the requested project job.' },
          403,
        );
      }

      throw new Error(`Unexpected fetch: ${requestUrl}`);
    });

    vi.stubGlobal('fetch', fetchMock);

    renderWorkbench('/jobs');

    expect(await screen.findByRole('heading', { name: 'Jobs' })).toBeInTheDocument();
    await screen.findByRole('option', { name: 'Project · Project Alpha' });

    await user.selectOptions(screen.getByLabelText('Jobs scope'), 'project:project-alpha');
    await user.click(screen.getByRole('button', { name: 'Create and run scoped job' }));

    expect(
      await screen.findByRole('heading', { name: 'Runtime error' }),
    ).toBeInTheDocument();
    expect(
      screen.getByText('Access denied for the requested project job.'),
    ).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: 'Project scope unavailable' })).not.toBeInTheDocument();
  });

  it('shows governance setup instead of fabricating a space when no visible governance space exists', async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
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

      if (requestUrl.endsWith('/api/spaces')) {
        return jsonResponse([]);
      }

      if (requestUrl.endsWith('/api/projects')) {
        return jsonResponse([]);
      }

      if (requestUrl.endsWith('/api/credentials')) {
        return jsonResponse([
          {
            createdAt: '2026-05-11T00:00:00.000Z',
            credentialRef: 'cred-alice',
            provider: 'openai',
            userId: 'user-alice',
          },
        ]);
      }

      if (requestUrl.includes('/api/jobs?')) {
        return jsonResponse([]);
      }

      throw new Error(`Unexpected fetch: ${requestUrl}`);
    });

    vi.stubGlobal('fetch', fetchMock);

    renderWorkbench('/jobs');

    expect(await screen.findByRole('heading', { name: 'Governance space required' })).toBeInTheDocument();
    expect(
      screen.getByText(/no longer chooses one implicitly or falls back to a fabricated lane/i),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Create and run scoped job' })).toBeDisabled();
  });

  it('shows credential setup instead of creating a placeholder credential', async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
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

      if (requestUrl.endsWith('/api/spaces')) {
        return jsonResponse([
          {
            createdAt: '2026-05-11T00:00:00.000Z',
            id: 'space-personal-alice',
            kind: 'personal',
            name: 'Alice Personal Space',
          },
        ]);
      }

      if (requestUrl.endsWith('/api/projects')) {
        return jsonResponse([]);
      }

      if (requestUrl.endsWith('/api/credentials')) {
        return jsonResponse([]);
      }

      if (requestUrl.includes('/api/jobs?')) {
        return jsonResponse([]);
      }

      throw new Error(`Unexpected fetch: ${requestUrl}`);
    });

    vi.stubGlobal('fetch', fetchMock);

    renderWorkbench('/jobs');

    expect(await screen.findByRole('heading', { name: 'Credential setup required' })).toBeInTheDocument();
    expect(
      screen.getByText(/no longer creates placeholder credentials in the browser/i),
    ).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Create and run scoped job' })).toBeDisabled();
  });

  it('cancels an active queued job without browser-supplied actor or status fields', async () => {
    const user = userEvent.setup();
    let cancelRequested = false;
    const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
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

      if (requestUrl.endsWith('/api/spaces')) {
        return jsonResponse([
          {
            createdAt: '2026-05-11T00:00:00.000Z',
            id: 'space-personal-alice',
            kind: 'personal',
            name: 'Alice Personal Space',
          },
        ]);
      }

      if (requestUrl.endsWith('/api/projects')) {
        return jsonResponse([]);
      }

      if (requestUrl.endsWith('/api/credentials')) {
        return jsonResponse([
          {
            createdAt: '2026-05-11T00:00:00.000Z',
            credentialRef: 'cred-alice',
            provider: 'openai',
            userId: 'user-alice',
          },
        ]);
      }

      if (requestUrl.includes('/api/jobs?')) {
        return jsonResponse([
          {
            createdAt: '2026-05-11T00:01:00.000Z',
            credentialRef: 'cred-alice',
            id: 'job-personal-1',
            kind: 'ai.summary',
            scope: { id: 'user-alice', type: 'user' },
            scopeId: 'user-alice',
            scopeType: 'user',
            spaceId: 'space-personal-alice',
            status: cancelRequested ? 'cancelled' : 'queued',
          },
        ]);
      }

      if (requestUrl.endsWith('/api/jobs/job-personal-1/cancel') && init?.method === 'POST') {
        const headers = new Headers(init.headers);
        const url = new URL(requestUrl);
        cancelRequested = true;

        expect(init.credentials).toBe('same-origin');
        expect(init.body).toBeUndefined();
        expect(headers.has('Authorization')).toBe(false);
        expect(headers.has('x-jixia-actor')).toBe(false);
        expect(url.searchParams.get('actorUserId')).toBeNull();
        expect(url.searchParams.get('requestedByUserId')).toBeNull();
        expect(url.searchParams.get('actorSpaceId')).toBeNull();
        expect(url.searchParams.get('status')).toBeNull();

        return jsonResponse({
          createdAt: '2026-05-11T00:01:00.000Z',
          credentialRef: 'cred-alice',
          id: 'job-personal-1',
          kind: 'ai.summary',
          scope: { id: 'user-alice', type: 'user' },
          scopeId: 'user-alice',
          scopeType: 'user',
          spaceId: 'space-personal-alice',
          status: 'cancelled',
        });
      }

      if (requestUrl.endsWith('/api/jobs/job-personal-1/events')) {
        return jsonResponse(
          cancelRequested
            ? [
                {
                  id: 'job-event-1',
                  jobId: 'job-personal-1',
                  message: 'Queued personal job.',
                  recordedAt: '2026-05-11T00:01:00.000Z',
                  status: 'queued',
                },
                {
                  id: 'job-event-2',
                  jobId: 'job-personal-1',
                  message: 'ai.summary cancelled before completion.',
                  recordedAt: '2026-05-11T00:02:00.000Z',
                  status: 'cancelled',
                },
              ]
            : [
                {
                  id: 'job-event-1',
                  jobId: 'job-personal-1',
                  message: 'Queued personal job.',
                  recordedAt: '2026-05-11T00:01:00.000Z',
                  status: 'queued',
                },
              ],
        );
      }

      if (requestUrl.endsWith('/api/jobs/job-personal-1/audit')) {
        return jsonResponse(
          cancelRequested
            ? [
                {
                  action: 'job.created',
                  actorUserId: 'user-alice',
                  detail: 'Created ai.summary with credential cred-alice.',
                  id: 'audit-1',
                  jobId: 'job-personal-1',
                  recordedAt: '2026-05-11T00:01:00.000Z',
                  spaceId: 'space-personal-alice',
                },
                {
                  action: 'job.cancelled',
                  actorUserId: 'user-alice',
                  detail: 'Cancelled ai.summary with credential cred-alice.',
                  id: 'audit-2',
                  jobId: 'job-personal-1',
                  recordedAt: '2026-05-11T00:02:00.000Z',
                  spaceId: 'space-personal-alice',
                },
              ]
            : [
                {
                  action: 'job.created',
                  actorUserId: 'user-alice',
                  detail: 'Created ai.summary with credential cred-alice.',
                  id: 'audit-1',
                  jobId: 'job-personal-1',
                  recordedAt: '2026-05-11T00:01:00.000Z',
                  spaceId: 'space-personal-alice',
                },
              ],
        );
      }

      if (requestUrl.endsWith('/api/jobs/job-personal-1/stream')) {
        return new Response('', {
          headers: {
            'Content-Type': 'text/event-stream; charset=utf-8',
          },
          status: 200,
        });
      }

      throw new Error(`Unexpected fetch: ${requestUrl}`);
    });

    vi.stubGlobal('fetch', fetchMock);

    renderWorkbench('/jobs');

    expect(await screen.findByRole('heading', { name: 'Jobs' })).toBeInTheDocument();
    expect(await screen.findByText(/Job id · job-personal-1/)).toBeInTheDocument();

    const cancelButton = screen.getByRole('button', { name: 'Cancel active job' });
    await waitFor(() => expect(cancelButton).toBeEnabled());

    await user.click(cancelButton);

    expect(await screen.findByText('ai.summary cancelled before completion.')).toBeInTheDocument();
    expect(await screen.findByRole('heading', { name: 'job.cancelled' })).toBeInTheDocument();
    await waitFor(() => expect(cancelButton).toBeDisabled());
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringMatching(/\/api\/jobs\/job-personal-1\/cancel$/),
      expect.objectContaining({ method: 'POST' }),
    );
  });

  it('does not offer browser cancellation for terminal jobs', async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
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

      if (requestUrl.endsWith('/api/spaces')) {
        return jsonResponse([
          {
            createdAt: '2026-05-11T00:00:00.000Z',
            id: 'space-personal-alice',
            kind: 'personal',
            name: 'Alice Personal Space',
          },
        ]);
      }

      if (requestUrl.endsWith('/api/projects')) {
        return jsonResponse([]);
      }

      if (requestUrl.endsWith('/api/credentials')) {
        return jsonResponse([
          {
            createdAt: '2026-05-11T00:00:00.000Z',
            credentialRef: 'cred-alice',
            provider: 'openai',
            userId: 'user-alice',
          },
        ]);
      }

      if (requestUrl.includes('/api/jobs?')) {
        return jsonResponse([
          {
            createdAt: '2026-05-11T00:01:00.000Z',
            credentialRef: 'cred-alice',
            id: 'job-personal-1',
            kind: 'ai.summary',
            scope: { id: 'user-alice', type: 'user' },
            scopeId: 'user-alice',
            scopeType: 'user',
            spaceId: 'space-personal-alice',
            status: 'succeeded',
          },
        ]);
      }

      if (requestUrl.endsWith('/api/jobs/job-personal-1/events')) {
        return jsonResponse([
          {
            id: 'job-event-1',
            jobId: 'job-personal-1',
            message: 'ai.summary completed successfully.',
            recordedAt: '2026-05-11T00:02:00.000Z',
            status: 'succeeded',
          },
        ]);
      }

      if (requestUrl.endsWith('/api/jobs/job-personal-1/audit')) {
        return jsonResponse([
          {
            action: 'job.completed',
            actorUserId: 'user-alice',
            detail: 'Completed ai.summary with credential cred-alice.',
            id: 'audit-1',
            jobId: 'job-personal-1',
            recordedAt: '2026-05-11T00:02:00.000Z',
            spaceId: 'space-personal-alice',
          },
        ]);
      }

      if (requestUrl.endsWith('/api/jobs/job-personal-1/stream')) {
        return new Response('', {
          headers: {
            'Content-Type': 'text/event-stream; charset=utf-8',
          },
          status: 200,
        });
      }

      throw new Error(`Unexpected fetch: ${requestUrl}`);
    });

    vi.stubGlobal('fetch', fetchMock);

    renderWorkbench('/jobs');

    expect(await screen.findByRole('heading', { name: 'Jobs' })).toBeInTheDocument();
    expect(await screen.findByText(/Job id · job-personal-1/)).toBeInTheDocument();

    await waitFor(() => {
      expect(screen.getByRole('button', { name: 'Cancel active job' })).toBeDisabled();
    });
    expect(
      fetchMock.mock.calls.some(([input]) => {
        const requestUrl =
          typeof input === 'string'
            ? input
            : input instanceof URL
              ? input.toString()
              : input.url;

        return requestUrl.endsWith('/api/jobs/job-personal-1/cancel');
      }),
    ).toBe(false);
  });

  it('keeps a single active job stream subscription when a live event updates the selected job status', async () => {
    let streamRequestCount = 0;
    const subscribeSpy = vi.spyOn(apiClient, 'subscribeToJobEvents').mockImplementation(
      (_input, onEvent) => {
        streamRequestCount += 1;
        setTimeout(() => {
          onEvent({
            id: 'job-event-live-1',
            jobId: 'job-personal-1',
            message: 'Live update received',
            recordedAt: '2026-05-11T00:02:00.000Z',
            status: 'running',
          });
        }, 0);

        return {
          close() {},
        };
      },
    );

    const fetchMock = vi.fn(async (input: string | URL | Request) => {
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

      if (requestUrl.endsWith('/api/spaces')) {
        return jsonResponse([
          {
            createdAt: '2026-05-11T00:00:00.000Z',
            id: 'space-personal-alice',
            kind: 'personal',
            name: 'Alice Personal Space',
          },
        ]);
      }

      if (requestUrl.endsWith('/api/projects')) {
        return jsonResponse([]);
      }

      if (requestUrl.endsWith('/api/credentials')) {
        return jsonResponse([
          {
            createdAt: '2026-05-11T00:00:00.000Z',
            credentialRef: 'cred-alice',
            provider: 'openai',
            userId: 'user-alice',
          },
        ]);
      }

      if (requestUrl.includes('/api/jobs?')) {
        return jsonResponse([
          {
            createdAt: '2026-05-11T00:01:00.000Z',
            credentialRef: 'cred-alice',
            id: 'job-personal-1',
            kind: 'ai.summary',
            scope: { id: 'user-alice', type: 'user' },
            scopeId: 'user-alice',
            scopeType: 'user',
            spaceId: 'space-personal-alice',
            status: 'queued',
          },
        ]);
      }

      if (requestUrl.endsWith('/api/jobs/job-personal-1/events')) {
        return jsonResponse([]);
      }

      if (requestUrl.endsWith('/api/jobs/job-personal-1/audit')) {
        return jsonResponse([]);
      }

      throw new Error(`Unexpected fetch: ${requestUrl}`);
    });

    vi.stubGlobal('fetch', fetchMock);

    renderWorkbench('/jobs');

    expect(await screen.findByRole('heading', { name: 'Jobs' })).toBeInTheDocument();
    expect(await screen.findByText('Live update received')).toBeInTheDocument();

    await waitFor(() => {
      expect(streamRequestCount).toBe(1);
      expect(subscribeSpy).toHaveBeenCalledTimes(1);
    });

    expect(screen.queryByRole('heading', { name: 'Runtime error' })).not.toBeInTheDocument();
    expect(screen.getAllByText('running').length).toBeGreaterThan(0);
  });

  it('preserves a live event when replay activity resolves after the SSE update', async () => {
    let streamRequestCount = 0;
    const pendingEventsResponse = createDeferred<Response>();

    const subscribeSpy = vi.spyOn(apiClient, 'subscribeToJobEvents').mockImplementation(
      (_input, onEvent) => {
        streamRequestCount += 1;
        setTimeout(() => {
          onEvent({
            id: 'job-event-live-1',
            jobId: 'job-personal-1',
            message: 'Live update received',
            recordedAt: '2026-05-11T00:02:00.000Z',
            status: 'running',
          });
        }, 0);

        return {
          close() {},
        };
      },
    );

    const fetchMock = vi.fn((input: string | URL | Request) => {
      const requestUrl =
        typeof input === 'string'
          ? input
          : input instanceof URL
            ? input.toString()
            : input.url;

      if (requestUrl.endsWith('/api/session/me')) {
        return Promise.resolve(jsonResponse({
          user: {
            displayName: 'Alice',
            email: 'alice@example.test',
            id: 'user-alice',
          },
        }));
      }

      if (requestUrl.endsWith('/api/spaces')) {
        return Promise.resolve(jsonResponse([
          {
            createdAt: '2026-05-11T00:00:00.000Z',
            id: 'space-personal-alice',
            kind: 'personal',
            name: 'Alice Personal Space',
          },
        ]));
      }

      if (requestUrl.endsWith('/api/projects')) {
        return Promise.resolve(jsonResponse([]));
      }

      if (requestUrl.endsWith('/api/credentials')) {
        return Promise.resolve(jsonResponse([
          {
            createdAt: '2026-05-11T00:00:00.000Z',
            credentialRef: 'cred-alice',
            provider: 'openai',
            userId: 'user-alice',
          },
        ]));
      }

      if (requestUrl.includes('/api/jobs?')) {
        return Promise.resolve(jsonResponse([
          {
            createdAt: '2026-05-11T00:01:00.000Z',
            credentialRef: 'cred-alice',
            id: 'job-personal-1',
            kind: 'ai.summary',
            scope: { id: 'user-alice', type: 'user' },
            scopeId: 'user-alice',
            scopeType: 'user',
            spaceId: 'space-personal-alice',
            status: 'queued',
          },
        ]));
      }

      if (requestUrl.endsWith('/api/jobs/job-personal-1/events')) {
        return pendingEventsResponse.promise;
      }

      if (requestUrl.endsWith('/api/jobs/job-personal-1/audit')) {
        return Promise.resolve(jsonResponse([]));
      }

      throw new Error(`Unexpected fetch: ${requestUrl}`);
    });

    vi.stubGlobal('fetch', fetchMock);

    renderWorkbench('/jobs');

    expect(await screen.findByRole('heading', { name: 'Jobs' })).toBeInTheDocument();
    expect(await screen.findByText('Live update received')).toBeInTheDocument();

    pendingEventsResponse.resolve(jsonResponse([]));

    await waitFor(() => {
      expect(streamRequestCount).toBe(1);
      expect(subscribeSpy).toHaveBeenCalledTimes(1);
    });

    expect(await screen.findByText('Live update received')).toBeInTheDocument();
    expect(screen.getAllByText('running').length).toBeGreaterThan(0);
  });

  it('keeps the newer selected scope when an earlier scoped job run finishes later', async () => {
    const user = userEvent.setup();
    const pendingCreateResponse = createDeferred<Response>();
    const pendingRunResponse = createDeferred<Response>();

    const fetchMock = vi.fn((input: string | URL | Request, init?: RequestInit) => {
      const requestUrl =
        typeof input === 'string'
          ? input
          : input instanceof URL
            ? input.toString()
            : input.url;

      if (requestUrl.endsWith('/api/session/me')) {
        return Promise.resolve(jsonResponse({
          user: {
            displayName: 'Alice',
            email: 'alice@example.test',
            id: 'user-alice',
          },
        }));
      }

      if (requestUrl.endsWith('/api/spaces')) {
        return Promise.resolve(jsonResponse([
          {
            createdAt: '2026-05-11T00:00:00.000Z',
            id: 'space-personal-alice',
            kind: 'personal',
            name: 'Alice Personal Space',
          },
        ]));
      }

      if (requestUrl.endsWith('/api/projects')) {
        return Promise.resolve(jsonResponse([
          {
            membership: {
              joinedAt: '2026-05-11T00:00:00.000Z',
              projectId: 'project-alpha',
              role: 'editor',
              userId: 'user-alice',
            },
            project: {
              createdAt: '2026-05-11T00:00:00.000Z',
              createdByUserId: 'user-alice',
              id: 'project-alpha',
              name: 'Project Alpha',
              spaceId: 'space-project-alpha',
              status: 'active',
              updatedAt: '2026-05-11T00:00:00.000Z',
            },
          },
        ]));
      }

      if (requestUrl.endsWith('/api/credentials')) {
        return Promise.resolve(jsonResponse([
          {
            createdAt: '2026-05-11T00:00:00.000Z',
            credentialRef: 'cred-alice',
            provider: 'openai',
            userId: 'user-alice',
          },
        ]));
      }

      if (requestUrl.includes('/api/jobs?')) {
        const url = new URL(requestUrl);
        const scopeType = url.searchParams.get('scopeType');

        if (scopeType === 'project') {
          return Promise.resolve(jsonResponse([]));
        }

        return Promise.resolve(jsonResponse([]));
      }

      if (requestUrl.endsWith('/api/jobs') && init?.method === 'POST') {
        return pendingCreateResponse.promise;
      }

      if (requestUrl.endsWith('/api/jobs/job-project-1/run') && init?.method === 'POST') {
        return pendingRunResponse.promise;
      }

      if (requestUrl.endsWith('/api/jobs/job-project-1/events')) {
        return Promise.resolve(jsonResponse([]));
      }

      if (requestUrl.endsWith('/api/jobs/job-project-1/audit')) {
        return Promise.resolve(jsonResponse([]));
      }

      throw new Error(`Unexpected fetch: ${requestUrl}`);
    });

    vi.stubGlobal('fetch', fetchMock);

    renderWorkbench('/jobs');

    expect(await screen.findByRole('heading', { name: 'Jobs' })).toBeInTheDocument();
    await screen.findByRole('option', { name: 'Project · Project Alpha' });

    await user.selectOptions(screen.getByLabelText('Jobs scope'), 'project:project-alpha');
    await user.click(screen.getByRole('button', { name: 'Create and run scoped job' }));

    await user.selectOptions(screen.getByLabelText('Jobs scope'), 'user:user-alice');
    expect(screen.getByLabelText('Jobs scope')).toHaveValue('user:user-alice');

    pendingCreateResponse.resolve(jsonResponse({
      createdAt: '2026-05-11T00:02:00.000Z',
      credentialRef: 'cred-alice',
      id: 'job-project-1',
      kind: 'ai.summary',
      scope: { id: 'project-alpha', type: 'project' },
      scopeId: 'project-alpha',
      scopeType: 'project',
      spaceId: 'space-project-alpha',
      status: 'queued',
    }));
    pendingRunResponse.resolve(jsonResponse({
      createdAt: '2026-05-11T00:02:00.000Z',
      credentialRef: 'cred-alice',
      id: 'job-project-1',
      kind: 'ai.summary',
      scope: { id: 'project-alpha', type: 'project' },
      scopeId: 'project-alpha',
      scopeType: 'project',
      spaceId: 'space-project-alpha',
      status: 'succeeded',
    }));

    await waitFor(() => {
      expect(screen.getByLabelText('Jobs scope')).toHaveValue('user:user-alice');
    });

    expect(screen.queryByText('job-project-1')).not.toBeInTheDocument();
  });

  it('uses a visible project jobId URL hint to select the target job and load its events and audit', async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
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

      if (requestUrl.endsWith('/api/spaces')) {
        return jsonResponse([
          {
            createdAt: '2026-05-11T00:00:00.000Z',
            id: 'space-project-alpha',
            kind: 'shared',
            name: 'Alpha Governance Space',
          },
        ]);
      }

      if (requestUrl.endsWith('/api/projects')) {
        return jsonResponse([
          {
            membership: {
              joinedAt: '2026-05-11T00:00:00.000Z',
              projectId: 'project-alpha',
              role: 'editor',
              userId: 'user-alice',
            },
            project: {
              createdAt: '2026-05-11T00:00:00.000Z',
              createdByUserId: 'user-alice',
              id: 'project-alpha',
              name: 'Project Alpha',
              spaceId: 'space-project-alpha',
              status: 'active',
              updatedAt: '2026-05-11T00:00:00.000Z',
            },
          },
        ]);
      }

      if (requestUrl.endsWith('/api/credentials')) {
        return jsonResponse([
          {
            createdAt: '2026-05-11T00:00:00.000Z',
            credentialRef: 'cred-alice',
            provider: 'openai',
            userId: 'user-alice',
          },
        ]);
      }

      if (requestUrl.includes('/api/jobs?')) {
        const url = new URL(requestUrl);
        expect(url.searchParams.get('scopeType')).toBe('project');
        expect(url.searchParams.get('scopeId')).toBe('project-alpha');
        expect(url.searchParams.get('spaceId')).toBe('space-project-alpha');
        expect(url.searchParams.get('jobId')).toBeNull();
        expect(url.searchParams.get('actorUserId')).toBeNull();

        return jsonResponse([
          {
            createdAt: '2026-05-11T00:03:00.000Z',
            credentialRef: 'cred-alice',
            id: 'job-project-newer',
            kind: 'ai.summary',
            scope: { id: 'project-alpha', type: 'project' },
            scopeId: 'project-alpha',
            scopeType: 'project',
            spaceId: 'space-project-alpha',
            status: 'queued',
          },
          {
            createdAt: '2026-05-11T00:02:00.000Z',
            credentialRef: 'cred-alice',
            id: 'job-project-target',
            kind: 'ai.summary',
            scope: { id: 'project-alpha', type: 'project' },
            scopeId: 'project-alpha',
            scopeType: 'project',
            spaceId: 'space-project-alpha',
            status: 'succeeded',
          },
        ]);
      }

      if (requestUrl.endsWith('/api/jobs/job-project-target/events')) {
        return jsonResponse([
          {
            id: 'event-target-1',
            jobId: 'job-project-target',
            message: 'Target job event replayed.',
            recordedAt: '2026-05-11T00:04:00.000Z',
            status: 'succeeded',
          },
        ]);
      }

      if (requestUrl.endsWith('/api/jobs/job-project-target/audit')) {
        return jsonResponse([
          {
            action: 'job.completed',
            actorUserId: 'user-alice',
            detail: 'Target job audit loaded.',
            id: 'audit-target-1',
            jobId: 'job-project-target',
            recordedAt: '2026-05-11T00:04:00.000Z',
            spaceId: 'space-project-alpha',
          },
        ]);
      }

      if (requestUrl.endsWith('/api/jobs/job-project-target/stream')) {
        return new Response('', {
          headers: {
            'Content-Type': 'text/event-stream; charset=utf-8',
          },
          status: 200,
        });
      }

      if (
        requestUrl.endsWith('/api/jobs/job-project-newer/events') ||
        requestUrl.endsWith('/api/jobs/job-project-newer/audit') ||
        requestUrl.endsWith('/api/jobs/job-project-newer/stream')
      ) {
        throw new Error('The newer job must not become active when jobId targets another visible job.');
      }

      throw new Error(`Unexpected fetch: ${requestUrl}`);
    });

    vi.stubGlobal('fetch', fetchMock);

    renderWorkbench('/jobs?scopeType=project&scopeId=project-alpha&jobId=job-project-target');

    expect(await screen.findByRole('heading', { name: 'Jobs' })).toBeInTheDocument();
    expect(await screen.findByText('Focused job · job-project-target')).toBeInTheDocument();
    expect(await screen.findByText('Target job event replayed.')).toBeInTheDocument();
    expect(await screen.findByRole('heading', { name: 'job.completed' })).toBeInTheDocument();
    expect(screen.getByText('Target job audit loaded.')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /Job id · job-project-target/i })).toHaveAttribute('aria-pressed', 'true');
    expect(window.location.search).toContain('scopeType=project');
    expect(window.location.search).toContain('scopeId=project-alpha');
    expect(window.location.search).toContain('jobId=job-project-target');
  });

  it('ignores a stale scoped job run failure after the user switches scope', async () => {
    const user = userEvent.setup();
    const pendingCreateResponse = createDeferred<Response>();

    const fetchMock = vi.fn((input: string | URL | Request, init?: RequestInit) => {
      const requestUrl =
        typeof input === 'string'
          ? input
          : input instanceof URL
            ? input.toString()
            : input.url;

      if (requestUrl.endsWith('/api/session/me')) {
        return Promise.resolve(jsonResponse({
          user: {
            displayName: 'Alice',
            email: 'alice@example.test',
            id: 'user-alice',
          },
        }));
      }

      if (requestUrl.endsWith('/api/spaces')) {
        return Promise.resolve(jsonResponse([
          {
            createdAt: '2026-05-11T00:00:00.000Z',
            id: 'space-personal-alice',
            kind: 'personal',
            name: 'Alice Personal Space',
          },
        ]));
      }

      if (requestUrl.endsWith('/api/projects')) {
        return Promise.resolve(jsonResponse([
          {
            membership: {
              joinedAt: '2026-05-11T00:00:00.000Z',
              projectId: 'project-alpha',
              role: 'editor',
              userId: 'user-alice',
            },
            project: {
              createdAt: '2026-05-11T00:00:00.000Z',
              createdByUserId: 'user-alice',
              id: 'project-alpha',
              name: 'Project Alpha',
              spaceId: 'space-project-alpha',
              status: 'active',
              updatedAt: '2026-05-11T00:00:00.000Z',
            },
          },
        ]));
      }

      if (requestUrl.endsWith('/api/credentials')) {
        return Promise.resolve(jsonResponse([
          {
            createdAt: '2026-05-11T00:00:00.000Z',
            credentialRef: 'cred-alice',
            provider: 'openai',
            userId: 'user-alice',
          },
        ]));
      }

      if (requestUrl.includes('/api/jobs?')) {
        return Promise.resolve(jsonResponse([]));
      }

      if (requestUrl.endsWith('/api/jobs') && init?.method === 'POST') {
        return pendingCreateResponse.promise;
      }

      throw new Error(`Unexpected fetch: ${requestUrl}`);
    });

    vi.stubGlobal('fetch', fetchMock);

    renderWorkbench('/jobs');

    expect(await screen.findByRole('heading', { name: 'Jobs' })).toBeInTheDocument();
    await screen.findByRole('option', { name: 'Project · Project Alpha' });

    await user.selectOptions(screen.getByLabelText('Jobs scope'), 'project:project-alpha');
    await user.click(screen.getByRole('button', { name: 'Create and run scoped job' }));
    await user.selectOptions(screen.getByLabelText('Jobs scope'), 'user:user-alice');

    pendingCreateResponse.resolve(jsonResponse(
      { error: 'Project scope mutation was denied.' },
      403,
    ));

    await waitFor(() => {
      expect(screen.getByLabelText('Jobs scope')).toHaveValue('user:user-alice');
    });

    expect(screen.queryByRole('heading', { name: 'Runtime error' })).not.toBeInTheDocument();
    expect(screen.queryByText('Project scope mutation was denied.')).not.toBeInTheDocument();
  });

  it('shows an explicit unavailable project state when the requested project scope is not visible', async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
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

      if (requestUrl.endsWith('/api/spaces')) {
        return jsonResponse([
          {
            createdAt: '2026-05-11T00:00:00.000Z',
            id: 'space-personal-alice',
            kind: 'personal',
            name: 'Alice Personal Space',
          },
        ]);
      }

      if (requestUrl.endsWith('/api/projects')) {
        return jsonResponse([]);
      }

      if (requestUrl.endsWith('/api/credentials')) {
        return jsonResponse([
          {
            createdAt: '2026-05-11T00:00:00.000Z',
            credentialRef: 'cred-alice',
            provider: 'openai',
            userId: 'user-alice',
          },
        ]);
      }

      if (requestUrl.includes('/api/jobs?')) {
        return jsonResponse([]);
      }

      throw new Error(`Unexpected fetch: ${requestUrl}`);
    });

    vi.stubGlobal('fetch', fetchMock);

    renderWorkbench('/jobs?scopeType=project&scopeId=project-gone');

    expect(await screen.findByRole('heading', { name: 'Project scope unavailable' })).toBeInTheDocument();
    expect(
      screen.getByText(/selected project scope is no longer visible/i),
    ).toBeInTheDocument();
    expect(screen.getByDisplayValue('Unavailable project scope')).toBeInTheDocument();
  });
});
