import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import type { DocumentBlockDocument } from '../../src/shared/contracts/document-content';
import { DocumentBlockRenderer } from '../../src/web/components/document-block-renderer';

import { expectDocumentBlocksToOmitAuthorityFields } from './document-block-assertions';

describe('DocumentBlockRenderer', () => {
  it('renders every app-owned block type with shared reference metadata chips', () => {
    const documentContent: DocumentBlockDocument = {
      blocks: [
        {
          level: 2,
          text: 'Structured evidence document',
          type: 'heading',
        },
        {
          text: 'Shared paragraph text.',
          type: 'paragraph',
        },
        {
          attribution: 'Reader capture',
          evidenceSpan: 'Quote evidence span.',
          libraryEntryId: 'entry-quote-1',
          locator: 'p. 3',
          paperAssetId: 'asset-quote-1',
          readerExcerptId: 'excerpt-quote-1',
          text: 'Quoted source text.',
          type: 'quote',
        },
        {
          checked: true,
          text: 'Resolve reviewer comment.',
          type: 'todo',
        },
        {
          evidenceSpan: 'Citation evidence span.',
          label: 'Citation label',
          libraryEntryId: 'entry-citation-1',
          locator: 'Fig. 2',
          paperAssetId: 'asset-citation-1',
          readerExcerptId: 'excerpt-citation-1',
          type: 'citation',
        },
        {
          capturedAt: '2026-05-24T00:00:00.000Z',
          evidenceSpan: 'Excerpt evidence span.',
          libraryEntryId: 'entry-excerpt-1',
          locator: 'Section 4',
          note: 'Capture note stays visible in private/editor contexts.',
          paperAssetId: 'asset-excerpt-1',
          quote: 'Source excerpt quote.',
          readerExcerptId: 'excerpt-excerpt-1',
          title: 'Source excerpt paper',
          type: 'sourceExcerpt',
        },
        {
          libraryEntryId: 'entry-paper-1',
          locator: 'Supplement',
          paperAssetId: 'asset-paper-1',
          title: 'Referenced paper',
          type: 'paperReference',
        },
        {
          evidenceSpan: 'AI suggestion evidence span.',
          libraryEntryId: 'entry-ai-1',
          paperAssetId: 'asset-ai-1',
          rationale: 'Grounded in the citation trace.',
          readerExcerptId: 'excerpt-ai-1',
          status: 'proposed',
          targetBlockId: 'block-target-1',
          text: 'Suggested synthesis sentence.',
          type: 'aiSuggestion',
        },
      ],
      schemaVersion: 1,
    };

    render(
      <DocumentBlockRenderer
        label="Shared renderer fixture"
        value={documentContent}
      />,
    );

    expect(screen.getByLabelText('Shared renderer fixture')).toBeInTheDocument();
    expect(screen.getByText('Structured evidence document')).toBeInTheDocument();
    expect(screen.getByText('Shared paragraph text.')).toBeInTheDocument();
    expect(screen.getByText('Quoted source text.')).toBeInTheDocument();
    expect(screen.getByText('Attribution · Reader capture')).toBeInTheDocument();
    expect(screen.getByText('Todo · complete · Resolve reviewer comment.')).toBeInTheDocument();
    expect(screen.getByText('Citation · Citation label')).toBeInTheDocument();
    expect(screen.getByText('Source excerpt paper')).toBeInTheDocument();
    expect(screen.getByText('Source excerpt quote.')).toBeInTheDocument();
    expect(screen.getByText('Capture note · Capture note stays visible in private/editor contexts.')).toBeInTheDocument();
    expect(screen.getByText('Captured · 2026-05-24T00:00:00.000Z')).toBeInTheDocument();
    expect(screen.getByText('Paper reference · Referenced paper')).toBeInTheDocument();
    expect(screen.getByText('Suggested synthesis sentence.')).toBeInTheDocument();
    expect(screen.getByText('Rationale · Grounded in the citation trace.')).toBeInTheDocument();
    expect(screen.getByText('Target block · block-target-1')).toBeInTheDocument();
    expect(screen.getByText('Status · proposed')).toBeInTheDocument();

    for (const value of [
      'asset-citation-1',
      'entry-citation-1',
      'excerpt-citation-1',
      'Fig. 2',
      'Citation evidence span.',
      'asset-excerpt-1',
      'entry-excerpt-1',
      'excerpt-excerpt-1',
      'Section 4',
      'Excerpt evidence span.',
      'asset-paper-1',
      'entry-paper-1',
      'Supplement',
      'asset-ai-1',
      'entry-ai-1',
      'excerpt-ai-1',
      'AI suggestion evidence span.',
    ]) {
      expect(screen.getByText(value)).toBeInTheDocument();
    }

    expect(screen.queryByText('ownerId')).not.toBeInTheDocument();
    expect(screen.queryByText('projectId')).not.toBeInTheDocument();
    expect(screen.queryByText('visibility')).not.toBeInTheDocument();
    expectDocumentBlocksToOmitAuthorityFields(documentContent);
  });

  it('renders an explicit empty state for empty documents', () => {
    render(
      <DocumentBlockRenderer
        emptyState="Structured content is not saved yet."
        label="Empty shared renderer"
        value={{ blocks: [], schemaVersion: 1 }}
      />,
    );

    expect(screen.getByLabelText('Empty shared renderer')).toBeInTheDocument();
    expect(screen.getByText('Structured content is not saved yet.')).toBeInTheDocument();
  });
});
