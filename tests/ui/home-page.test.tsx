import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { App } from '../../src/web/app';

function renderHomePage() {
  window.history.replaceState({}, '', '/home');
  render(<App />);
}

describe('home page', () => {
  it('shows dashboard summary cards and recent-opened panel', () => {
    renderHomePage();

    expect(screen.getByRole('heading', { name: '个人工作台' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '今日推荐' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '最近阅读' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '最近项目' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '最近文档' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '最近打开' })).toBeInTheDocument();
  });
});
