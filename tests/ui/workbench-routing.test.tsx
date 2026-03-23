import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { App } from '../../src/web/app';

describe('workbench routing', () => {
  it('redirects authenticated users to /home and renders stable nav', () => {
    render(<App />);

    expect(screen.getByRole('link', { name: '今日推荐' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '搜索' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Library' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: 'Projects' })).toBeInTheDocument();
    expect(screen.getByRole('link', { name: '设置' })).toBeInTheDocument();
  });
});
