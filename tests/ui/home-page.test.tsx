import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { App } from '../../src/web/app';

function renderHomePage() {
  window.history.replaceState({}, '', '/home');
  render(<App />);
}

describe('home page', () => {
  it('shows the intake desk instead of the old dashboard summary cards', () => {
    renderHomePage();

    expect(screen.getByRole('heading', { name: 'Research workbench' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Intake desk' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Unified inventory' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Project docs' })).toBeInTheDocument();
    expect(screen.queryByRole('heading', { name: '最近项目' })).not.toBeInTheDocument();
  });

  it('renders actionable recent-opened links in the context rail', () => {
    renderHomePage();

    expect(
      screen.getByRole('link', { name: /signal pathways in shared tumor boards/i }),
    ).toBeInTheDocument();
  });
});
