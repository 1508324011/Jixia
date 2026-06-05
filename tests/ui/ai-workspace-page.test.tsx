import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { App } from '../../src/web/app';

function renderWorkbench(pathname = '/ai-workspace') {
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

function requestUrlFrom(input: string | URL | Request): string {
  return typeof input === 'string'
    ? input
    : input instanceof URL
      ? input.toString()
      : input.url;
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('AI Workspace page', () => {
  it('renders governed job setup without standalone chat or raw credential input', async () => {
    const fetchMock = vi.fn(async (input: string | URL | Request) => {
      const requestUrl = requestUrlFrom(input);

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
            createdAt: '2026-05-24T00:00:00.000Z',
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
        const url = new URL(requestUrl);
        expect(url.searchParams.get('scopeType')).toBe('user');
        expect(url.searchParams.get('scopeId')).toBe('user-alice');
        expect(url.searchParams.get('actorUserId')).toBeNull();
        expect(url.searchParams.get('requestedByUserId')).toBeNull();
        return jsonResponse([]);
      }

      if (requestUrl.endsWith('/api/ai-workspace/sessions')) {
        return jsonResponse({
          contract: 'jixia-ai-workspace-context-packs-v1',
          sessions: [],
        });
      }

      throw new Error(`Unexpected fetch: ${requestUrl}`);
    });

    vi.stubGlobal('fetch', fetchMock);

    renderWorkbench();

    expect(await screen.findByRole('heading', { name: 'AI Workspace' })).toBeInTheDocument();
    expect(screen.getByText(/server-authorized jobs/i)).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Credential setup required' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'No visible project scopes' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Configure credentials in Settings' })).toHaveAttribute('href', '/settings');
    expect(screen.getByRole('button', { name: 'Launch context-pack AI run' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Launch context-pack AI job' })).toBeDisabled();
    expect(screen.getByRole('heading', { name: 'Server-owned AI sessions' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Context packs inherit session scope' })).toBeInTheDocument();
    expect(screen.getByText(/authorized source references only/i)).toBeInTheDocument();
    expect(screen.queryByText(/Chat history/i)).not.toBeInTheDocument();
    expect(screen.queryByRole('button', { name: /Send message/i })).not.toBeInTheDocument();
    expect(screen.queryByPlaceholderText(/Ask anything/i)).not.toBeInTheDocument();
    expect(screen.queryByLabelText(/API Key/i)).not.toBeInTheDocument();
  });

  it('launches a governed project AI run through context-pack refs only', async () => {
    const user = userEvent.setup();
    let createdProjectJob = false;
    const aiSession = {
      createdAt: '2026-05-24T00:00:00.000Z',
      id: 'session-project-1',
      scope: { id: 'project-alpha', type: 'project' as const },
      title: 'Project synthesis session',
      updatedAt: '2026-05-24T00:00:00.000Z',
    };
    const aiPack = {
      createdAt: '2026-05-24T00:00:00.000Z',
      id: 'pack-project-1',
      itemCount: 1,
      sessionId: aiSession.id,
      title: 'Selected project evidence',
      updatedAt: '2026-05-24T00:00:00.000Z',
    };
    const contextItem = {
      contextPackId: aiPack.id,
      createdAt: '2026-05-24T00:00:00.000Z',
      id: 'item-project-1',
      source: { libraryEntryId: 'entry-project-1', sourceType: 'projectLibraryEntry' as const },
    };
    const projectJob = {
      createdAt: '2026-05-24T00:01:00.000Z',
      credentialRef: 'cred-alice',
      id: 'job-project-1',
      kind: 'ai-workspace.context-pack',
      scope: { id: 'project-alpha', type: 'project' as const },
      scopeId: 'project-alpha',
      scopeType: 'project',
      spaceId: 'space-project-alpha',
      status: 'succeeded',
    };
    const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const requestUrl = requestUrlFrom(input);

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
            createdAt: '2026-05-24T00:00:00.000Z',
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
              joinedAt: '2026-05-24T00:00:00.000Z',
              projectId: 'project-alpha',
              role: 'editor',
              userId: 'user-alice',
            },
            project: {
              createdAt: '2026-05-24T00:00:00.000Z',
              createdByUserId: 'user-alice',
              id: 'project-alpha',
              name: 'Project Alpha',
              spaceId: 'space-project-alpha',
              status: 'active',
              updatedAt: '2026-05-24T00:00:00.000Z',
            },
          },
        ]);
      }

      if (requestUrl.endsWith('/api/credentials')) {
        return jsonResponse([
          {
            createdAt: '2026-05-24T00:00:00.000Z',
            credentialRef: 'cred-alice',
            provider: 'openai',
            userId: 'user-alice',
          },
        ]);
      }

      if (requestUrl.endsWith('/api/ai-workspace/sessions')) {
        return jsonResponse({
          contract: 'jixia-ai-workspace-context-packs-v1',
          sessions: [],
        });
      }

      if (requestUrl.endsWith('/api/ai-workspace/projects/project-alpha/sessions')) {
        return jsonResponse({
          contract: 'jixia-ai-workspace-context-packs-v1',
          sessions: [aiSession],
        });
      }

      if (requestUrl.endsWith('/api/ai-workspace/sessions/session-project-1/context-packs')) {
        return jsonResponse({
          contract: 'jixia-ai-workspace-context-packs-v1',
          packs: [aiPack],
          session: aiSession,
        });
      }

      if (requestUrl.endsWith('/api/ai-workspace/context-packs/pack-project-1')) {
        return jsonResponse({
          contract: 'jixia-ai-workspace-context-packs-v1',
          items: [contextItem],
          pack: aiPack,
          session: aiSession,
        });
      }

      if (requestUrl.includes('/api/jobs?')) {
        const url = new URL(requestUrl);
        expect(url.searchParams.get('actorUserId')).toBeNull();
        if (url.searchParams.get('scopeType') === 'project') {
          expect(url.searchParams.get('scopeId')).toBe('project-alpha');
          expect(url.searchParams.get('spaceId')).toBe('space-project-alpha');
          return jsonResponse(createdProjectJob ? [projectJob] : []);
        }

        return jsonResponse([]);
      }

      if (requestUrl.endsWith('/api/ai-workspace/jobs') && init?.method === 'POST') {
        const headers = new Headers(init.headers);
        const body = JSON.parse(String(init.body)) as Record<string, unknown>;

        expect(init.credentials).toBe('same-origin');
        expect(headers.has('Authorization')).toBe(false);
        expect(headers.has('x-jixia-actor')).toBe(false);
        expect(body).toMatchObject({
          contextPackId: 'pack-project-1',
          credentialRef: 'cred-alice',
        });
        expect(JSON.stringify(body)).not.toMatch(
          /actorUserId|requestedByUserId|authorUserId|startedByUserId|actorSpaceId|ownerId|createdByUserId|scope|spaceId|projectId|visibility|rawContext|notebookDocumentVersion|storageKey|checksum|rawSecret|apiKey|password|token|secret/i,
        );

        createdProjectJob = true;

        return jsonResponse({
          contextPack: aiPack,
          itemRefs: [contextItem.source],
          job: {
            ...projectJob,
            status: 'queued',
          },
          session: aiSession,
        });
      }

      if (requestUrl.endsWith('/api/jobs/job-project-1/run') && init?.method === 'POST') {
        return jsonResponse(projectJob);
      }

      if (requestUrl.endsWith('/api/jobs/job-project-1/events')) {
        return jsonResponse([
          {
            id: 'event-1',
            jobId: 'job-project-1',
            message: 'Project AI run completed.',
            recordedAt: '2026-05-24T00:02:00.000Z',
            status: 'succeeded',
          },
        ]);
      }

      if (requestUrl.endsWith('/api/jobs/job-project-1/audit')) {
        return jsonResponse([
          {
            action: 'job.completed',
            actorUserId: 'user-alice',
            detail: 'Completed ai.summary with credential cred-alice.',
            id: 'audit-1',
            jobId: 'job-project-1',
            recordedAt: '2026-05-24T00:02:00.000Z',
            spaceId: 'space-project-alpha',
          },
        ]);
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

    renderWorkbench();

    expect(await screen.findByRole('heading', { name: 'AI Workspace' })).toBeInTheDocument();
    await screen.findByRole('option', { name: 'Project · Project Alpha' });

    await user.selectOptions(screen.getByLabelText('AI Workspace scope'), 'project:project-alpha');
    expect(await screen.findByText('Project Library entry · entry-project-1')).toBeInTheDocument();
    await waitFor(() =>
      expect(screen.getByRole('link', { name: 'Open Jobs runtime' })).toHaveAttribute(
        'href',
        '/jobs?scopeId=project-alpha&scopeType=project',
      ),
    );
    await user.click(screen.getByRole('button', { name: 'Launch context-pack AI job' }));

    expect(await screen.findByText('Project AI run completed.')).toBeInTheDocument();
    expect(await screen.findByRole('heading', { name: 'job.completed' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Open this run in Jobs' })).toHaveAttribute(
      'href',
      '/jobs?jobId=job-project-1&scopeId=project-alpha&scopeType=project',
    );

    const forbiddenMutationPatterns = [
      /^\/api\/notebooks(?:\/|$)/,
      /^\/api\/project-docs(?:\/|$)/,
      /^\/api\/library\/personal\/import$/,
      /^\/api\/projects\/[^/]+\/library\/adoptions$/,
      /^\/api\/projects(?:\/|$)/,
      /^\/api\/settings\/me$/,
      /^\/api\/credentials$/,
      /^\/api\/spaces(?:\/|$)/,
    ];

    const forbiddenMutations = fetchMock.mock.calls.filter(([input, init]) => {
      const method = init?.method ?? 'GET';
      if (method === 'GET') {
        return false;
      }

      const url = new URL(requestUrlFrom(input));
      return forbiddenMutationPatterns.some((pattern) => pattern.test(url.pathname));
    });

    expect(forbiddenMutations).toEqual([]);
  });

  it('cancels an active governed AI run without actor, status, or durable-write payloads', async () => {
    const user = userEvent.setup();
    let cancelRequested = false;
    const fetchMock = vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
      const requestUrl = requestUrlFrom(input);

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
            createdAt: '2026-05-24T00:00:00.000Z',
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
            createdAt: '2026-05-24T00:00:00.000Z',
            credentialRef: 'cred-alice',
            provider: 'openai',
            userId: 'user-alice',
          },
        ]);
      }

      if (requestUrl.includes('/api/jobs?')) {
        return jsonResponse([
          {
            createdAt: '2026-05-24T00:01:00.000Z',
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

      if (requestUrl.endsWith('/api/ai-workspace/sessions')) {
        return jsonResponse({
          contract: 'jixia-ai-workspace-context-packs-v1',
          sessions: [],
        });
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
          createdAt: '2026-05-24T00:01:00.000Z',
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
                  id: 'event-1',
                  jobId: 'job-personal-1',
                  message: 'Queued AI Workspace run.',
                  recordedAt: '2026-05-24T00:01:00.000Z',
                  status: 'queued',
                },
                {
                  id: 'event-2',
                  jobId: 'job-personal-1',
                  message: 'AI Workspace run cancelled.',
                  recordedAt: '2026-05-24T00:02:00.000Z',
                  status: 'cancelled',
                },
              ]
            : [
                {
                  id: 'event-1',
                  jobId: 'job-personal-1',
                  message: 'Queued AI Workspace run.',
                  recordedAt: '2026-05-24T00:01:00.000Z',
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
                  recordedAt: '2026-05-24T00:01:00.000Z',
                  spaceId: 'space-personal-alice',
                },
                {
                  action: 'job.cancelled',
                  actorUserId: 'user-alice',
                  detail: 'Cancelled ai.summary with credential cred-alice.',
                  id: 'audit-2',
                  jobId: 'job-personal-1',
                  recordedAt: '2026-05-24T00:02:00.000Z',
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
                  recordedAt: '2026-05-24T00:01:00.000Z',
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

    renderWorkbench();

    expect(await screen.findByRole('heading', { name: 'AI Workspace' })).toBeInTheDocument();
    expect(await screen.findByText(/Run id · job-personal-1/)).toBeInTheDocument();

    const cancelButton = screen.getByRole('button', { name: 'Cancel active run' });
    await waitFor(() => expect(cancelButton).toBeEnabled());

    await user.click(cancelButton);

    expect(await screen.findByText('AI Workspace run cancelled.')).toBeInTheDocument();
    expect(await screen.findByRole('heading', { name: 'job.cancelled' })).toBeInTheDocument();
    expect(fetchMock).toHaveBeenCalledWith(
      expect.stringMatching(/\/api\/jobs\/job-personal-1\/cancel$/),
      expect.objectContaining({ method: 'POST' }),
    );
  });
});
