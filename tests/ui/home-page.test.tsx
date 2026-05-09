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

function renderHomePage() {
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

  window.history.replaceState({}, '', '/home');
  render(<App />);
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe('home page', () => {
  it('shows dashboard summary cards and recent-opened panel', async () => {
    renderHomePage();

    expect(
      await screen.findByRole('heading', { name: '个人工作台' }),
    ).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '今日推荐' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '最近阅读' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '最近项目' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '最近文档' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '最近打开' })).toBeInTheDocument();
  });
});
