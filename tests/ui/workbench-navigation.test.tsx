import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { App } from '../../src/web/app';

function renderWorkbench(pathname = '/home') {
  window.history.replaceState({}, '', pathname);
  render(<App />);
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('workbench navigation', () => {
  it('sidebar switches among approved top-level surfaces', async () => {
    const user = userEvent.setup();
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: string | URL, init?: RequestInit) => {
        const url = input.toString();

        if (url.endsWith('/api/settings/me') && init?.method === 'POST') {
          return new Response(
            JSON.stringify({
              apiKeyConfigured: true,
              defaultImportTarget: 'project-workspace',
            }),
            {
              headers: { 'Content-Type': 'application/json' },
              status: 200,
            },
          );
        }

        if (url.endsWith('/api/settings/me')) {
          return new Response(
            JSON.stringify({
              apiKeyConfigured: false,
              defaultImportTarget: 'personal-library',
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

    renderWorkbench('/home');

    await user.click(screen.getByRole('link', { name: '搜索' }));
    expect(screen.getByRole('heading', { name: '外部搜索' })).toBeInTheDocument();

    await user.click(screen.getByRole('link', { name: 'Projects' }));
    expect(screen.getByRole('heading', { name: '项目工作台' })).toBeInTheDocument();

    await user.click(screen.getByRole('link', { name: '设置' }));
    expect(screen.getByLabelText('API Key')).toBeInTheDocument();
    expect(await screen.findByText('API key not configured')).toBeInTheDocument();
    expect(screen.getByDisplayValue('Personal Library')).toBeInTheDocument();

    await user.type(screen.getByLabelText('API Key'), 'sk-browser-secret');
    await user.selectOptions(
      screen.getByRole('combobox', { name: '默认导入目标' }),
      'project-workspace',
    );
    await user.click(screen.getByRole('button', { name: '保存设置' }));

    expect(await screen.findByText('Settings saved')).toBeInTheDocument();

    const fetchMock = vi.mocked(fetch);
    expect(fetchMock).toHaveBeenCalledWith(
      '/api/settings/me',
      expect.objectContaining({
        body: JSON.stringify({
          apiKey: 'sk-browser-secret',
          defaultImportTarget: 'project-workspace',
        }),
        method: 'POST',
      }),
    );

    await user.click(screen.getByRole('link', { name: '今日推荐' }));
    expect(screen.getByRole('heading', { name: '今日推荐' })).toBeInTheDocument();
  });
});
