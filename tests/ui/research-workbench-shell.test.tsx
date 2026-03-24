import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { App } from '../../src/web/app';

function renderWorkbench(pathname = '/home') {
  window.history.replaceState({}, '', pathname);
  render(<App />);
}

describe('research workbench shell', () => {
  it('renders a stable three-pane workbench shell with persistent context surfaces', () => {
    renderWorkbench();

    expect(screen.getByTestId('workbench-left-rail')).toBeInTheDocument();
    expect(screen.getByTestId('workbench-main-surface')).toBeInTheDocument();
    expect(screen.getByTestId('workbench-context-rail')).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: '最近打开' })).toBeInTheDocument();
  });
});
