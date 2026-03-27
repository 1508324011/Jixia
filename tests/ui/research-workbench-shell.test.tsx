import { cleanup, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it } from 'vitest';

import { App } from '../../src/web/app';

function renderWorkbench(pathname = '/home') {
  window.history.replaceState({}, '', pathname);
  render(<App />);
}

afterEach(() => {
  cleanup();
});

describe('research workbench shell', () => {
  it('renders the IDE Classic Lite shell with activity rail, compact sidebar, and open-view strip', () => {
    renderWorkbench();

    expect(screen.getByTestId('workbench-activity-rail')).toBeInTheDocument();
    expect(screen.getByTestId('workbench-compact-sidebar')).toBeInTheDocument();
    expect(screen.getByTestId('workbench-open-view-strip')).toBeInTheDocument();
    expect(screen.getByTestId('workbench-left-rail')).toBeInTheDocument();
    expect(screen.getByTestId('workbench-main-surface')).toBeInTheDocument();
    expect(screen.queryByTestId('workbench-context-rail')).not.toBeInTheDocument();
    expect(screen.getByRole('main')).toHaveClass('workbench-route');
    expect(screen.getByRole('main')).not.toHaveClass('page-shell');
  });

  it('activity rail provides primary navigation actions', () => {
    renderWorkbench('/home');

    const activityRail = screen.getByTestId('workbench-activity-rail');
    expect(activityRail).toBeInTheDocument();
    expect(activityRail).toHaveAttribute('data-rail-variant', 'activity');
  });

  it('compact sidebar displays contextual mode content instead of duplicate global navigation', () => {
    renderWorkbench('/projects');

    expect(screen.getByTestId('workbench-compact-sidebar')).toBeInTheDocument();
    expect(screen.getByTestId('workbench-contextual-sidebar')).toBeInTheDocument();
    expect(screen.getByText('Project workspaces')).toBeInTheDocument();
    expect(screen.queryByRole('link', { name: 'Home' })).not.toBeInTheDocument();
  });

  it('open-view strip shows currently open views for quick switching', () => {
    renderWorkbench('/home');

    const openViewStrip = screen.getByTestId('workbench-open-view-strip');
    expect(openViewStrip).toBeInTheDocument();
    expect(openViewStrip).toHaveAttribute('data-strip-variant', 'open-views');
  });

  it('renders a stable compact shell without default recent-opened filler', () => {
    renderWorkbench();

    expect(screen.getByTestId('workbench-left-rail')).toBeInTheDocument();
    expect(screen.getByTestId('workbench-main-surface')).toBeInTheDocument();
    expect(screen.queryByTestId('workbench-context-rail')).not.toBeInTheDocument();
    expect(screen.queryByText('最近打开')).not.toBeInTheDocument();
  });

  it('renders a desktop workbench shell without page-width constraining the main surface', () => {
    renderWorkbench('/home');

    expect(screen.getByTestId('workbench-main-surface')).toHaveAttribute(
      'data-layout-mode',
      'editor-canvas',
    );
  });

  it('keeps the context rail as a minimal inspector on project routes only', () => {
    renderWorkbench('/projects/tumor-board');

    const contextRail = screen.getByTestId('workbench-context-rail');
    expect(contextRail).toHaveAttribute('data-rail-variant', 'inspector');
  });

  it('does not render a redundant personal lane panel in personal workbench routes', () => {
    renderWorkbench('/library');

    expect(screen.queryByText(/personal lane/i)).not.toBeInTheDocument();
  });
});
