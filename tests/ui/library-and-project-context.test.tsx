import { cleanup, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { App } from '../../src/web/app';

function renderWorkbench(pathname: string) {
  window.history.replaceState({}, '', pathname);
  render(<App />);
}

describe('library and project context', () => {
  it('library and project workspace expose different context labels', () => {
    renderWorkbench('/library');
    expect(screen.getByText('Personal')).toBeInTheDocument();

    cleanup();

    renderWorkbench('/projects/project-1');
    expect(screen.getByText('Project / 肿瘤标志物项目')).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: '共享 Library' })).toBeInTheDocument();
    expect(screen.getByRole('tab', { name: 'Writer' })).toBeInTheDocument();
  });
});
