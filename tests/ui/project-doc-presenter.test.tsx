import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { DocumentBlockDocument } from '../../src/shared/contracts/document-content';
import type { ProjectDocSnapshot } from '../../src/shared/contracts/project-docs';
import { apiClient } from '../../src/web/lib/http-client';
import { useProjectDocPresenter } from '../../src/web/presenters/project-doc-presenter';

import { expectDocumentBlocksToOmitAuthorityFields } from './document-block-assertions';

function createDeferred<T>() {
  let resolve: ((value: T) => void) | undefined;
  let reject: ((error?: unknown) => void) | undefined;

  const promise = new Promise<T>((nextResolve, nextReject) => {
    resolve = nextResolve;
    reject = nextReject;
  });

  if (!resolve || !reject) {
    throw new Error('Deferred promise failed to initialize.');
  }

  return { promise, reject, resolve };
}

function buildSnapshot(
  versionId: string,
  versionNumber: number,
  content: string,
  options?: {
    citations?: Array<
      ProjectDocSnapshot['citations'][number] & {
        libraryEntryId?: string;
      }
    >;
    documentContent?: DocumentBlockDocument;
  },
): ProjectDocSnapshot {
  return {
    capturedAt: `2026-03-23T00:4${versionNumber}:00.000Z`,
    citations: options?.citations ?? [],
    content,
    document: {
      createdAt: '2026-03-23T00:35:00.000Z',
      createdByUserId: 'user-alice',
      id: 'doc-project-1',
      projectId: 'project-1',
      publishState: 'draft',
      title: 'Tumor board literature synthesis',
      updatedAt: `2026-03-23T00:4${versionNumber}:00.000Z`,
    },
    documentContent: options?.documentContent,
    versionId,
    versionNumber,
  };
}

function PresenterHarness() {
  const presenter = useProjectDocPresenter('project-1', 'doc-project-1');

  return (
    <section>
      <div data-testid="content">{presenter.content}</div>
      <div data-testid="loading">{presenter.isLoading ? 'loading' : 'idle'}</div>
      <div data-testid="version">{presenter.snapshot?.versionId ?? 'none'}</div>
      <button type="button" onClick={() => void presenter.refresh()}>
        refresh
      </button>
      <button
        type="button"
        onClick={() =>
          void presenter.save({
            citations: [],
            documentContent: {
              blocks: [
                {
                  text: 'Saved content wins over stale reloads.',
                  type: 'paragraph',
                },
              ],
              schemaVersion: 1,
            },
          })
        }
      >
        save
      </button>
    </section>
  );
}

function CitationPreservationHarness() {
  const presenter = useProjectDocPresenter('project-1', 'doc-project-1');

  return (
    <section>
      <div data-testid="citation-library-entry">
        {presenter.citations[0]?.libraryEntryId ?? 'none'}
      </div>
      <div data-testid="citation-version">{presenter.snapshot?.versionId ?? 'none'}</div>
      <button
        type="button"
        onClick={() =>
          void presenter.save({
            citations: presenter.citations.map((citation) => ({
              evidenceSpan: citation.evidenceSpan,
              libraryEntryId: citation.libraryEntryId,
              paperAssetId: citation.paperAssetId,
              readerExcerptId: citation.readerExcerptId,
            })),
            documentContent: presenter.documentContent,
          })
        }
      >
        save preserved citations
      </button>
    </section>
  );
}

afterEach(() => {
  vi.restoreAllMocks();
});

describe('project doc presenter', () => {
  it('ignores a stale refresh result that resolves after a newer save snapshot', async () => {
    const initialLoad = createDeferred<ProjectDocSnapshot>();
    const manualRefresh = createDeferred<ProjectDocSnapshot>();
    const saveRequest = createDeferred<ProjectDocSnapshot>();

    vi.spyOn(apiClient, 'listProjects').mockResolvedValue([
      {
        membership: {
          joinedAt: '2026-03-23T00:35:00.000Z',
          projectId: 'project-1',
          role: 'owner',
          userId: 'user-alice',
        },
        project: {
          createdAt: '2026-03-23T00:35:00.000Z',
          createdByUserId: 'user-alice',
          id: 'project-1',
          name: 'Tumor board project',
          spaceId: 'personal-space-user-alice',
          status: 'active',
          updatedAt: '2026-03-23T00:35:00.000Z',
        },
      },
    ]);
    vi.spyOn(apiClient, 'getProjectDoc')
      .mockImplementationOnce(() => initialLoad.promise)
      .mockImplementationOnce(() => manualRefresh.promise);
    vi.spyOn(apiClient, 'saveProjectDocVersion').mockImplementation(() => saveRequest.promise);

    render(<PresenterHarness />);

    initialLoad.resolve(buildSnapshot('project-doc-version-1', 1, 'Original server content.'));
    await waitFor(() => {
      expect(screen.getByTestId('content')).toHaveTextContent('Original server content.');
    });
    expect(screen.getByTestId('version')).toHaveTextContent('project-doc-version-1');

    fireEvent.click(screen.getByRole('button', { name: 'refresh' }));
    fireEvent.click(screen.getByRole('button', { name: 'save' }));

    expect(apiClient.saveProjectDocVersion).toHaveBeenCalledWith(
      'doc-project-1',
      {
        citations: [],
        documentContent: {
          blocks: [
            {
              text: 'Saved content wins over stale reloads.',
              type: 'paragraph',
            },
          ],
          schemaVersion: 1,
        },
      },
    );
    expectDocumentBlocksToOmitAuthorityFields(
      vi.mocked(apiClient.saveProjectDocVersion).mock.calls[0]?.[1].documentContent,
    );

    saveRequest.resolve(
      buildSnapshot('project-doc-version-2', 2, 'Saved content wins over stale reloads.'),
    );
    await waitFor(() => {
      expect(screen.getByTestId('content')).toHaveTextContent(
        'Saved content wins over stale reloads.',
      );
    });
    expect(screen.getByTestId('loading')).toHaveTextContent('idle');
    expect(screen.getByTestId('version')).toHaveTextContent('project-doc-version-2');

    manualRefresh.resolve(buildSnapshot('project-doc-version-1', 1, 'Original server content.'));
    await waitFor(() => {
      expect(screen.getByTestId('content')).toHaveTextContent(
        'Saved content wins over stale reloads.',
      );
    });
    expect(screen.getByTestId('loading')).toHaveTextContent('idle');
    expect(screen.getByTestId('version')).toHaveTextContent('project-doc-version-2');
  });

  it('reconstructs libraryEntryId and preserves readerExcerpt-backed citations on save', async () => {
    const saveRequest = createDeferred<ProjectDocSnapshot>();

    vi.spyOn(apiClient, 'listProjects').mockResolvedValue([
      {
        membership: {
          joinedAt: '2026-03-23T00:35:00.000Z',
          projectId: 'project-1',
          role: 'owner',
          userId: 'user-alice',
        },
        project: {
          createdAt: '2026-03-23T00:35:00.000Z',
          createdByUserId: 'user-alice',
          id: 'project-1',
          name: 'Tumor board project',
          spaceId: 'personal-space-user-alice',
          status: 'active',
          updatedAt: '2026-03-23T00:35:00.000Z',
        },
      },
    ]);
    vi.spyOn(apiClient, 'getProjectDoc').mockResolvedValue(
      buildSnapshot(
        'project-doc-version-1',
        1,
        'Quoted evidence survives.',
        {
          citations: [
            {
              createdAt: '2026-03-23T00:41:00.000Z',
              evidenceSpan: 'Quoted evidence survives.',
              id: 'citation-1',
              paperAssetId: 'asset-1',
              projectDocVersionId: 'project-doc-version-1',
              readerExcerptId: 'excerpt-1',
            },
          ],
          documentContent: {
            blocks: [
              {
                evidenceSpan: 'Quoted evidence survives.',
                libraryEntryId: 'entry-1',
                paperAssetId: 'asset-1',
                quote: 'Quoted evidence survives.',
                readerExcerptId: 'excerpt-1',
                type: 'sourceExcerpt',
              },
            ],
            schemaVersion: 1,
          },
        },
      ),
    );
    vi.spyOn(apiClient, 'saveProjectDocVersion').mockImplementation(() => saveRequest.promise);

    render(<CitationPreservationHarness />);

    await waitFor(() => {
      expect(screen.getByTestId('citation-library-entry')).toHaveTextContent('entry-1');
    });

    fireEvent.click(screen.getByRole('button', { name: 'save preserved citations' }));

    expect(apiClient.saveProjectDocVersion).toHaveBeenCalledWith(
      'doc-project-1',
      {
        citations: [
          {
            evidenceSpan: 'Quoted evidence survives.',
            libraryEntryId: 'entry-1',
            paperAssetId: 'asset-1',
            readerExcerptId: 'excerpt-1',
          },
        ],
        documentContent: {
          blocks: [
            {
              evidenceSpan: 'Quoted evidence survives.',
              libraryEntryId: 'entry-1',
              paperAssetId: 'asset-1',
              quote: 'Quoted evidence survives.',
              readerExcerptId: 'excerpt-1',
              type: 'sourceExcerpt',
            },
          ],
          schemaVersion: 1,
        },
      },
    );
    expectDocumentBlocksToOmitAuthorityFields(
      vi.mocked(apiClient.saveProjectDocVersion).mock.calls[0]?.[1].documentContent,
    );

    saveRequest.resolve(
      buildSnapshot('project-doc-version-2', 2, 'Quoted evidence survives.'),
    );

    await waitFor(() => {
      expect(screen.getByTestId('citation-version')).toHaveTextContent(
        'project-doc-version-2',
      );
    });
  });
});
