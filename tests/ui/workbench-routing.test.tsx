import { render, screen } from '@testing-library/react';
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

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('workbench routing', () => {
  it('redirects authenticated users to /home and renders stable nav', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string | URL | Request) => {
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
          return jsonResponse([]);
        }

        throw new Error(`Unexpected fetch: ${requestUrl}`);
      }),
    );

    render(<App />);

    expect(await screen.findByRole('link', { name: '今日推荐' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '搜索' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Library' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Projects' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '设置' })).toBeInTheDocument();
  });
});
