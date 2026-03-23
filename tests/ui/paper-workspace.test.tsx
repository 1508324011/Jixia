import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { App } from '../../src/web/app';

function renderWorkbench(pathname: string) {
  window.history.replaceState({}, '', pathname);
  render(<App />);
}

describe('paper workspace', () => {
  it('paper page exposes separate panels for AI, private notes, shared comments, and metadata', () => {
    renderWorkbench('/projects/project-1/library/entry-1/reader');

    expect(screen.getByRole('tab', { name: 'AI 对话' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: '私人笔记' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: '共享评论' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: '关键信息' })).toBeInTheDocument();
  });
});
