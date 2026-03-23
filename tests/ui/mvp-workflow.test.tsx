import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it } from 'vitest';

import { App } from '../../src/web/app';

function renderLegacyWorkflow() {
  window.history.replaceState({}, '', '/spaces');
  render(<App />);
}

describe('mvp workflow shell', () => {
  it('navigates from spaces to library, reader, and writing', async () => {
    const user = userEvent.setup();

    renderLegacyWorkflow();

    expect(
      screen.getByRole('heading', { name: 'Spaces' }),
    ).toBeInTheDocument();
    expect(screen.getByText('Space → Project → Entry → Doc')).toBeInTheDocument();

    await user.click(
      screen.getByRole('link', { name: 'Enter shared space' }),
    );

    expect(
      screen.getByRole('heading', { name: 'Library' }),
    ).toBeInTheDocument();
    expect(screen.getByLabelText('context bar')).toHaveTextContent(
      'Context · shared-space / tumor-board',
    );
    expect(screen.getByLabelText('context bar')).toHaveTextContent(
      'space_shared',
    );
    expect(screen.getByLabelText('context bar')).toHaveTextContent(
      'pmid import',
    );
    expect(screen.getByText('Project · tumor-board')).toBeInTheDocument();
    expect(screen.getByText('Loading state placeholder')).toBeInTheDocument();
    expect(screen.getByText('Empty shelf placeholder')).toBeInTheDocument();

    await user.click(screen.getByRole('link', { name: 'Open reader' }));

    expect(screen.getByRole('heading', { name: 'Reader' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Workbench' })).toBeInTheDocument();
    expect(screen.getByLabelText('context bar')).toHaveTextContent(
      'Space context · shared-space',
    );
    expect(screen.getByText('Project context · tumor-board')).toBeInTheDocument();
    expect(screen.getByText('Entry · entry-1')).toBeInTheDocument();

    await user.click(screen.getByRole('link', { name: 'Open writing' }));

    expect(screen.getByRole('heading', { name: 'Writing' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { name: 'Versions and references' })).toBeInTheDocument();
    expect(
      screen.getByLabelText('context bar'),
    ).toHaveTextContent('Space context · shared-space');
    expect(
      screen.getByLabelText('context bar'),
    ).toHaveTextContent('Project context · tumor-board · doc-1');
  });

  it('shares scholarly shell primitives across pages', async () => {
    const user = userEvent.setup();

    renderLegacyWorkflow();

    expect(screen.getByTestId('app-shell')).toHaveClass('app-shell');
    expect(screen.getByRole('heading', { name: 'Spaces' })).toHaveClass('page-title');

    await user.click(
      screen.getByRole('link', { name: 'Enter shared space' }),
    );

    expect(screen.getByLabelText('context bar')).toHaveClass('context-bar');
    expect(
      screen.getByRole('heading', { name: 'Signal pathways in shared tumor boards' }),
    ).toHaveClass('panel-title');
    expect(screen.getAllByText('space_shared')[0]).toHaveClass('status-badge');
  });

  it('surfaces governance cues across library, reader, and writing', async () => {
    const user = userEvent.setup();

    renderLegacyWorkflow();

    await user.click(
      screen.getByRole('link', { name: 'Enter shared space' }),
    );

    expect(screen.getByText('Shared context · shared-space')).toBeInTheDocument();
    expect(screen.getByText('Visibility · space_shared')).toBeInTheDocument();

    await user.click(screen.getByRole('link', { name: 'Open reader' }));

    expect(
      screen.getByText('Governed action source · queued → running → succeeded'),
    ).toBeInTheDocument();

    await user.click(screen.getByRole('link', { name: 'Open writing' }));

    expect(screen.getByText('Publish state path')).toBeInTheDocument();
    expect(screen.getByText('draft · review · published')).toBeInTheDocument();
  });

  it('supports direct reader deep links with project and entry context', () => {
    window.history.replaceState(
      {},
      '',
      '/spaces/shared-space/projects/tumor-board/library/entry-1/reader',
    );

    render(<App />);

    expect(screen.getByRole('heading', { name: 'Reader' })).toBeInTheDocument();
    expect(screen.getByLabelText('context bar')).toHaveTextContent(
      'Space context · shared-space',
    );
    expect(screen.getByText('Project context · tumor-board')).toBeInTheDocument();
    expect(screen.getByText('Entry · entry-1')).toBeInTheDocument();
  });

  it('supports direct library deep links with space and project context', () => {
    window.history.replaceState(
      {},
      '',
      '/spaces/shared-space/projects/tumor-board/library',
    );

    render(<App />);

    expect(screen.getByRole('heading', { name: 'Library' })).toBeInTheDocument();
    expect(screen.getByLabelText('context bar')).toHaveTextContent(
      'Context · shared-space / tumor-board',
    );
    expect(screen.getByText('Project · tumor-board')).toBeInTheDocument();
  });

  it('supports direct writing deep links with project and doc context', () => {
    window.history.replaceState(
      {},
      '',
      '/spaces/shared-space/projects/tumor-board/writing/doc-1',
    );

    render(<App />);

    expect(screen.getByRole('heading', { name: 'Writing' })).toBeInTheDocument();
    expect(screen.getByLabelText('context bar')).toHaveTextContent(
      'Space context · shared-space',
    );
    expect(screen.getByLabelText('context bar')).toHaveTextContent(
      'Project context · tumor-board · doc-1',
    );
    expect(screen.getByText('draft · review · published')).toBeInTheDocument();
  });
});
