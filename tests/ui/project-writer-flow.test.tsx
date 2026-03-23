import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { App } from '../../src/web/app';

function renderWorkbench(pathname: string) {
  window.history.replaceState({}, '', pathname);
  render(<App />);
}

describe('project writer flow', () => {
  it('project page links shared paper work into writer documents', () => {
    renderWorkbench('/projects/project-1');

    expect(screen.getByText('Writer 文档区')).toBeInTheDocument();
    expect(screen.getByText('将成熟内容整理进入 Writer')).toBeInTheDocument();
  });
});
