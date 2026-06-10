import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import type { DocumentBlockDocument } from '../../src/shared/contracts/document-content';
import type {
  ProjectDocCitationTraceResponse,
  ProjectDocSnapshot,
} from '../../src/shared/contracts/project-docs';
import { PROJECT_DOC_CITATION_SOURCE_UNAVAILABLE } from '../../src/shared/contracts/project-docs';
import { apiClient } from '../../src/web/lib/http-client';
import { ApiError } from '../../src/web/lib/http-client';
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

function buildCitationTrace(
  snapshot: ProjectDocSnapshot,
  citations: ProjectDocCitationTraceResponse['citations'] = [],
): ProjectDocCitationTraceResponse {
  return {
    capturedAt: snapshot.capturedAt,
    citations,
    document: snapshot.document,
    generatedAt: '2026-03-23T00:45:30.000Z',
    versionId: snapshot.versionId,
    versionNumber: snapshot.versionNumber,
  };
}

function PresenterHarness() {
  const presenter = useProjectDocPresenter('project-1', 'doc-project-1');

  return (
    <section>
      <div data-testid="content">{presenter.content}</div>
      <div data-testid="loading">{presenter.isLoading ? 'loading' : 'idle'}</div>
      <div data-testid="version">{presenter.snapshot?.versionId ?? 'none'}</div>
      <div data-testid="trace-loading">
        {presenter.isCitationTraceLoading ? 'loading' : 'idle'}
      </div>
      <div data-testid="trace-citations">
        {presenter.citationTrace?.citations.length ?? 'none'}
      </div>
      <div data-testid="trace-error">{presenter.citationTraceError ?? 'none'}</div>
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

function CitationTraceStateHarness() {
  const presenter = useProjectDocPresenter('project-1', 'doc-project-1');

  return (
    <section>
      <div data-testid="trace-loading">
        {presenter.isCitationTraceLoading ? 'loading' : 'idle'}
      </div>
      <div data-testid="trace-json">
        {presenter.citationTrace ? JSON.stringify(presenter.citationTrace) : 'none'}
      </div>
      <div data-testid="trace-error">{presenter.citationTraceError ?? 'none'}</div>
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

function AdoptionNeededHarness() {
  const presenter = useProjectDocPresenter('project-1', 'doc-project-1');

  return (
    <section>
      <div data-testid="presenter-error">{presenter.error ?? 'none'}</div>
      <div data-testid="snapshot-version">{presenter.snapshot?.versionId ?? 'none'}</div>
      <div data-testid="adoption-paper-asset">
        {presenter.adoptionNeeded?.paperAssetId ?? 'none'}
      </div>
      <div data-testid="adoption-source-entry">
        {presenter.adoptionNeeded?.sourceLibraryEntryId ?? 'none'}
      </div>
      <div data-testid="adoption-reference-entry">
        {presenter.adoptionNeeded?.libraryEntryId ?? 'none'}
      </div>
      <button
        type="button"
        onClick={() =>
          void presenter.save({
            citations: [],
            documentContent: {
              blocks: [
                {
                  evidenceSpan: 'Unavailable quote survives recovery.',
                  libraryEntryId: 'entry-personal-source',
                  paperAssetId: 'asset-adoption-needed',
                  quote: 'Unavailable quote survives recovery.',
                  readerExcerptId: 'excerpt-adoption-needed',
                  type: 'sourceExcerpt',
                },
              ],
              schemaVersion: 1,
            },
          })
        }
      >
        save unavailable citation
      </button>
      <button type="button" onClick={() => void presenter.adoptCitationSource()}>
        adopt citation source
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
    const emptyCitationTrace = buildCitationTrace(
      buildSnapshot('project-doc-version-trace', 1, ''),
    );

    vi.spyOn(apiClient, 'listProjects').mockResolvedValue([
      {
        memberCount: 1,
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
    vi.spyOn(apiClient, 'getProjectDocCitationTrace').mockResolvedValue(emptyCitationTrace);
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
    expect(apiClient.getProjectDocCitationTrace).toHaveBeenCalledWith('doc-project-1');

    manualRefresh.resolve(buildSnapshot('project-doc-version-1', 1, 'Original server content.'));
    await waitFor(() => {
      expect(screen.getByTestId('content')).toHaveTextContent(
        'Saved content wins over stale reloads.',
      );
    });
    expect(screen.getByTestId('loading')).toHaveTextContent('idle');
    expect(screen.getByTestId('version')).toHaveTextContent('project-doc-version-2');
  });

  it('loads citation trace as a separate read model and keeps snapshot content when trace fails', async () => {
    const loadedSnapshot = buildSnapshot(
      'project-doc-version-1',
      1,
      'Trace-backed Project Doc content.',
      {
        citations: [
          {
            createdAt: '2026-03-23T00:41:00.000Z',
            evidenceSpan: 'Trace-backed evidence quote.',
            id: 'citation-trace-1',
            paperAssetId: 'asset-trace-1',
            projectDocVersionId: 'project-doc-version-1',
            readerExcerptId: 'excerpt-trace-1',
          },
        ],
      },
    );

    vi.spyOn(apiClient, 'listProjects').mockResolvedValue([
      {
        memberCount: 1,
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
    vi.spyOn(apiClient, 'getProjectDoc').mockResolvedValue(loadedSnapshot);
    vi.spyOn(apiClient, 'getProjectDocCitationTrace')
      .mockResolvedValueOnce(
        buildCitationTrace(loadedSnapshot, [
          {
            citationId: 'citation-trace-1',
            createdAt: '2026-03-23T00:41:00.000Z',
            evidenceSpan: 'Trace-backed evidence quote.',
            paper: {
              canonicalId: 'doi:10.1000/trace',
              createdAt: '2026-03-23T00:35:00.000Z',
              hasFile: false,
              id: 'asset-trace-1',
              title: 'Trace-backed paper',
            },
            paperAssetId: 'asset-trace-1',
            projectDocVersionId: 'project-doc-version-1',
            projectLibraryEntry: {
              libraryEntryId: 'entry-project-trace-1',
              projectId: 'project-1',
            },
            readerExcerpt: {
              evidenceSpan: 'Trace-backed evidence quote.',
              id: 'excerpt-trace-1',
              quote: 'Trace-backed evidence quote.',
              source: 'reader_source',
              sourceLibraryEntryId: 'entry-project-trace-1',
            },
            readerExcerptId: 'excerpt-trace-1',
            source: { state: 'available' },
          },
        ]),
      )
      .mockRejectedValueOnce(new Error('Trace endpoint unavailable.'));

    render(<PresenterHarness />);

    await waitFor(() => {
      expect(screen.getByTestId('trace-citations')).toHaveTextContent('1');
    });
    expect(screen.getByTestId('content')).toHaveTextContent(
      'Trace-backed Project Doc content.',
    );
    expect(screen.getByTestId('trace-error')).toHaveTextContent('none');
    expect(apiClient.getProjectDocCitationTrace).toHaveBeenCalledWith('doc-project-1');

    fireEvent.click(screen.getByRole('button', { name: 'refresh' }));

    await waitFor(() => {
      expect(screen.getByTestId('trace-error')).toHaveTextContent(
        'Trace endpoint unavailable.',
      );
    });
    expect(screen.getByTestId('content')).toHaveTextContent(
      'Trace-backed Project Doc content.',
    );
    expect(screen.getByTestId('trace-citations')).toHaveTextContent('none');
  });

  it('tracks citation trace loading and preserves browser-safe presenter trace shape', async () => {
    const loadedSnapshot = buildSnapshot(
      'project-doc-version-1',
      1,
      'Trace shape Project Doc content.',
      {
        citations: [
          {
            createdAt: '2026-03-23T00:41:00.000Z',
            evidenceSpan: 'Trace shape evidence quote.',
            id: 'citation-trace-shape-1',
            paperAssetId: 'asset-trace-shape-1',
            projectDocVersionId: 'project-doc-version-1',
            readerExcerptId: 'excerpt-trace-shape-1',
          },
        ],
      },
    );
    const traceRequest = createDeferred<ProjectDocCitationTraceResponse>();

    vi.spyOn(apiClient, 'listProjects').mockResolvedValue([
      {
        memberCount: 1,
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
    vi.spyOn(apiClient, 'getProjectDoc').mockResolvedValue(loadedSnapshot);
    vi.spyOn(apiClient, 'getProjectDocCitationTrace').mockImplementation(() => traceRequest.promise);

    render(<CitationTraceStateHarness />);

    await waitFor(() => {
      expect(screen.getByTestId('trace-loading')).toHaveTextContent('loading');
    });
    expect(apiClient.getProjectDocCitationTrace).toHaveBeenCalledWith('doc-project-1');

    traceRequest.resolve(
      buildCitationTrace(loadedSnapshot, [
        {
          citationId: 'citation-trace-shape-1',
          createdAt: '2026-03-23T00:41:00.000Z',
          evidenceSpan: 'Trace shape evidence quote.',
          paper: {
            canonicalId: 'doi:10.1000/trace-shape',
            createdAt: '2026-03-23T00:35:00.000Z',
            hasFile: false,
            id: 'asset-trace-shape-1',
            title: 'Trace shape paper',
          },
          paperAssetId: 'asset-trace-shape-1',
          projectDocVersionId: 'project-doc-version-1',
          projectLibraryEntry: {
            libraryEntryId: 'entry-trace-shape-1',
            projectId: 'project-1',
          },
          readerExcerpt: {
            evidenceSpan: 'Trace shape evidence quote.',
            id: 'excerpt-trace-shape-1',
            quote: 'Trace shape evidence quote.',
            source: 'reader_source',
            sourceLibraryEntryId: 'entry-trace-shape-1',
          },
          readerExcerptId: 'excerpt-trace-shape-1',
          source: { state: 'available' },
        },
      ]),
    );

    await waitFor(() => {
      expect(screen.getByTestId('trace-loading')).toHaveTextContent('idle');
    });
    const traceJson = screen.getByTestId('trace-json').textContent ?? '';
    const trace = JSON.parse(traceJson) as ProjectDocCitationTraceResponse;
    const traceRow = trace.citations[0];

    expect(traceRow).toMatchObject({
      citationId: 'citation-trace-shape-1',
      paperAssetId: 'asset-trace-shape-1',
      source: { state: 'available' },
    });
    expect(traceRow).not.toHaveProperty('actorUserId');
    expect(traceRow).not.toHaveProperty('ownerId');
    expect(traceRow.projectLibraryEntry).not.toHaveProperty('spaceId');
    expect(traceRow.projectLibraryEntry).not.toHaveProperty('visibility');
    expect(traceRow.readerExcerpt).not.toHaveProperty('note');
    expect(traceRow.readerExcerpt).not.toHaveProperty('createdByUserId');
  });

  it('reconstructs libraryEntryId and preserves readerExcerpt-backed citations on save', async () => {
    const saveRequest = createDeferred<ProjectDocSnapshot>();

    vi.spyOn(apiClient, 'listProjects').mockResolvedValue([
      {
        memberCount: 1,
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
    const initialSnapshot = buildSnapshot(
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
      );
    vi.spyOn(apiClient, 'getProjectDoc').mockResolvedValue(initialSnapshot);
    vi.spyOn(apiClient, 'getProjectDocCitationTrace').mockResolvedValue(
      buildCitationTrace(initialSnapshot),
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

  it('keeps citation adoption actions gated by server-provided source entries', async () => {
    vi.spyOn(apiClient, 'listProjects').mockResolvedValue([
      {
        memberCount: 1,
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
          spaceId: 'space-project-1',
          status: 'active',
          updatedAt: '2026-03-23T00:35:00.000Z',
        },
      },
    ]);
    vi.spyOn(apiClient, 'getProjectDoc').mockResolvedValue(
      buildSnapshot('project-doc-version-1', 1, 'Draft before recovery.'),
    );
    vi.spyOn(apiClient, 'getProjectDocCitationTrace').mockResolvedValue(
      buildCitationTrace(buildSnapshot('project-doc-version-1', 1, 'Draft before recovery.')),
    );
    vi.spyOn(apiClient, 'saveProjectDocVersion').mockRejectedValue(
      new ApiError(
        'Paper asset asset-adoption-needed is not available in project project-1.',
        400,
        PROJECT_DOC_CITATION_SOURCE_UNAVAILABLE,
        {
          paperAssetId: 'asset-adoption-needed',
          projectId: 'project-1',
          readerExcerptId: 'excerpt-adoption-needed',
        },
      ),
    );
    vi.spyOn(apiClient, 'adoptProjectLibraryEntry').mockResolvedValue({
      entry: {
        asset: {
          canonicalId: 'doi:10.1000/adoption-needed',
          createdAt: '2026-03-23T00:35:00.000Z',
          id: 'asset-adoption-needed',
          title: 'Adoption needed paper',
        },
        entry: {
          addedAt: '2026-03-23T00:36:00.000Z',
          addedByUserId: 'user-alice',
          createdAt: '2026-03-23T00:36:00.000Z',
          id: 'entry-project-adopted',
          paperAssetId: 'asset-adoption-needed',
          scope: { id: 'project-1', type: 'project' },
          scopeId: 'project-1',
          scopeType: 'project',
          spaceId: 'space-project-1',
          visibility: 'published_to_project',
        },
      },
      reused: false,
    });

    render(<AdoptionNeededHarness />);

    await waitFor(() => {
      expect(screen.getByTestId('snapshot-version')).toHaveTextContent(
        'project-doc-version-1',
      );
    });

    fireEvent.click(screen.getByRole('button', { name: 'save unavailable citation' }));

    await waitFor(() => {
      expect(screen.getByTestId('adoption-paper-asset')).toHaveTextContent(
        'asset-adoption-needed',
      );
    });
    expect(screen.getByTestId('adoption-source-entry')).toHaveTextContent(
      'none',
    );
    expect(screen.getByTestId('adoption-reference-entry')).toHaveTextContent(
      'entry-personal-source',
    );
    expect(screen.getByTestId('presenter-error')).toHaveTextContent(
      'not available in project project-1',
    );

    fireEvent.click(screen.getByRole('button', { name: 'adopt citation source' }));

    await waitFor(() => {
      expect(screen.getByTestId('presenter-error')).toHaveTextContent(
        'A source library entry and visible project are required before adoption.',
      );
    });
    expect(apiClient.adoptProjectLibraryEntry).not.toHaveBeenCalled();
    expect(screen.getByTestId('adoption-paper-asset')).toHaveTextContent(
      'asset-adoption-needed',
    );
  });
});
