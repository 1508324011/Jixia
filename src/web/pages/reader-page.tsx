import { useEffect, useMemo, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';

import type { AiWorkspaceView } from '@shared/contracts/ai-workspace';
import type { GovernedJobView } from '@shared/contracts/jobs';
import type {
  ReadingDocumentView,
  ReadingDetailView,
  ReadingRetrievalStateView,
  ReadingWorkspaceView,
} from '@shared/contracts/reading';
import { metadataOnlyReadingRetrievalState } from '@shared/contracts/reading';

import { AiWorkspaceShell } from '../components/ai-workspace-shell';
import { ReaderDocumentCanvas } from '../components/reader-document-canvas';
import {
  createDemoApi,
  getGovernedSummary,
  getReadingDetail as getLegacyReadingDetail,
} from '../lib/demo-api';

const demoApi = createDemoApi();
const DEFAULT_PROJECT_SPACE_ID = 'shared-space';

function buildProjectPath(
  projectId: string,
  spaceId: string,
  preserveSpaceContext = false,
): string {
  const pathname = `/projects/${projectId}`;

  if (!preserveSpaceContext && spaceId === DEFAULT_PROJECT_SPACE_ID) {
    return pathname;
  }

  return `${pathname}?spaceId=${encodeURIComponent(spaceId)}`;
}

function buildNotesWorkspacePath(
  entryId: string,
  options: {
    preserveSpaceContext?: boolean;
    projectId?: string;
    spaceId?: string;
  },
): string {
  if (!options.projectId) {
    return `/library/${entryId}/notes`;
  }

  const pathname = `/projects/${options.projectId}/library/${entryId}/notes`;

  if (!options.preserveSpaceContext && options.spaceId === DEFAULT_PROJECT_SPACE_ID) {
    return pathname;
  }

  return `${pathname}?spaceId=${encodeURIComponent(options.spaceId ?? DEFAULT_PROJECT_SPACE_ID)}`;
}

function buildProjectDocsPath(
  projectId: string,
  documentId: string,
  spaceId: string,
  preserveSpaceContext = false,
): string {
  const pathname = `/projects/${projectId}/writing/${documentId}`;

  if (!preserveSpaceContext && spaceId === DEFAULT_PROJECT_SPACE_ID) {
    return pathname;
  }

  return `${pathname}?spaceId=${encodeURIComponent(spaceId)}`;
}

function resolveReaderWorkspace(detail: ReadingDetailView): ReadingWorkspaceView {
  if (detail.workspace?.notebookId) {
    return detail.workspace;
  }

  return {
    notebookId: `notebook-${detail.entry.id}`,
    sharedComments: detail.notes.filter((note) => note.visibility === 'space_shared'),
  };
}

function resolveRetrievalState(detail: ReadingDetailView): ReadingRetrievalStateView {
  return detail.retrieval ?? { ...metadataOnlyReadingRetrievalState };
}

function resolveReadingDocument(detail: ReadingDetailView): ReadingDocumentView {
  if (detail.document?.sections?.length) {
    return detail.document;
  }

  return {
    sections: [
      {
        body: [
          detail.asset.title,
          detail.asset.abstractText?.trim() || 'No abstract was imported for this record.',
          'Reader keeps the paper itself centered even when the stored document payload has not been expanded yet.',
        ].join('\n\n'),
        id: 'section-overview',
        title: 'Overview',
      },
    ],
    title: detail.asset.title,
  };
}

export function ReaderPage() {
  const [searchParams] = useSearchParams();
  const { spaceId: routeSpaceId, projectId, entryId = 'entry-1' } = useParams();
  const isPersonalMode = !projectId;
  const spaceId = routeSpaceId ?? searchParams.get('spaceId') ?? undefined;
  const hasExplicitSpaceContext = typeof spaceId === 'string' && spaceId.length > 0;
  const resolvedSpaceId = spaceId ?? DEFAULT_PROJECT_SPACE_ID;

  const [detail, setDetail] = useState<ReadingDetailView | null>(null);
  const [aiWorkspace, setAiWorkspace] = useState<AiWorkspaceView | null>(null);
  const [aiLoadError, setAiLoadError] = useState<string | null>(null);
  const [isAiLoading, setIsAiLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [governedJob, setGovernedJob] = useState<GovernedJobView | null>(null);

  useEffect(() => {
    let isCancelled = false;

    async function loadDetail(): Promise<void> {
      setIsLoading(true);
      setLoadError(null);

      try {
        const readingDetail = hasExplicitSpaceContext
          ? await getLegacyReadingDetail(entryId, resolvedSpaceId)
          : await demoApi.getReadingDetail(entryId);

        if (!isCancelled) {
          setDetail(readingDetail);
        }
      } catch (error) {
        if (!isCancelled) {
          setDetail(null);
          setLoadError(
            error instanceof Error
              ? error.message
              : hasExplicitSpaceContext
                ? 'Failed to load the reading detail.'
                : 'Failed to load the paper workspace.',
          );
        }
      } finally {
        if (!isCancelled) {
          setIsLoading(false);
        }
      }
    }

    void loadDetail();

    return () => {
      isCancelled = true;
    };
  }, [entryId, hasExplicitSpaceContext, resolvedSpaceId]);

  useEffect(() => {
    let isCancelled = false;

    async function loadAiWorkspace(): Promise<void> {
      setIsAiLoading(true);
      setAiLoadError(null);

      try {
        const response = await demoApi.getAiWorkspace({ entryId });

        if (!isCancelled) {
          setAiWorkspace(response.workspace);
        }
      } catch (error) {
        if (!isCancelled) {
          setAiWorkspace(null);
          setAiLoadError(error instanceof Error ? error.message : 'Failed to load the AI workspace.');
        }
      } finally {
        if (!isCancelled) {
          setIsAiLoading(false);
        }
      }
    }

    void loadAiWorkspace();

    return () => {
      isCancelled = true;
    };
  }, [entryId]);

  useEffect(() => {
    if (!hasExplicitSpaceContext) {
      setGovernedJob(null);
      return;
    }

    let isCancelled = false;

    async function loadGovernedSummary(): Promise<void> {
      try {
        const response = await getGovernedSummary(resolvedSpaceId);

        if (!isCancelled) {
          setGovernedJob(response.governedJob);
        }
      } catch {
        if (!isCancelled) {
          setGovernedJob(null);
        }
      }
    }

    void loadGovernedSummary();

    return () => {
      isCancelled = true;
    };
  }, [hasExplicitSpaceContext, resolvedSpaceId]);

  const workspace = useMemo(() => (detail ? resolveReaderWorkspace(detail) : null), [detail]);
  const retrievalState = useMemo(
    () => (detail ? resolveRetrievalState(detail) : { ...metadataOnlyReadingRetrievalState }),
    [detail],
  );
  const readingDocument = useMemo(() => (detail ? resolveReadingDocument(detail) : null), [detail]);
  const privateNotes = detail?.notes.filter((note) => note.visibility === 'private') ?? [];
  const projectComments = workspace?.sharedComments ?? [];
  const linkedSpaceContext = hasExplicitSpaceContext ? resolvedSpaceId : DEFAULT_PROJECT_SPACE_ID;
  const defaultProjectDocsPath = projectId
    ? buildProjectDocsPath(projectId, 'doc-1', linkedSpaceContext, hasExplicitSpaceContext)
    : null;
  const notesWorkspacePath = buildNotesWorkspacePath(
    entryId,
    {
      preserveSpaceContext: hasExplicitSpaceContext,
      projectId,
      spaceId: linkedSpaceContext,
    },
  );
  const notebookPath = workspace?.companion?.notebookPath ?? notesWorkspacePath;
  const projectPath = projectId
    ? (workspace?.companion?.projectPath ??
      buildProjectPath(projectId, linkedSpaceContext, hasExplicitSpaceContext))
    : null;
  const resolvedProjectDocsPath = workspace?.companion?.projectDocsPath ?? defaultProjectDocsPath;

  return (
    <main className="workbench-route workbench-route--reader" data-testid="reader-workspace-canvas">
      <header className="page-header">
        <h1 className="page-title">{isLoading || isAiLoading ? 'Loading Reader…' : 'Reader'}</h1>
      </header>

      <section aria-label="context bar" className="context-bar">
        <span>{isPersonalMode ? 'Personal context' : `Project context · ${projectId}`}</span>
        {!isPersonalMode && hasExplicitSpaceContext ? <span>Space context · {resolvedSpaceId}</span> : null}
        <span>Entry · {entryId}</span>
        <span className="status-badge">{privateNotes.length} private notes</span>
        <span className="status-badge">{projectComments.length} shared comments</span>
      </section>

      <section className="reader-page" aria-label="reading layout">
        <article className="reader-document-surface">
          {isLoading ? (
            <div className="workbench-row">
              <p className="quiet-copy">Loading reading detail…</p>
            </div>
          ) : loadError ? (
            <div className="workbench-row">
              <p className="quiet-copy">{loadError}</p>
            </div>
          ) : detail ? (
              <>
                <ReaderDocumentCanvas
                  canonicalId={detail.asset.canonicalId}
                  document={readingDocument ?? resolveReadingDocument(detail)}
                  retrieval={retrievalState}
                />
              </>
          ) : (
            <div className="workbench-row">
              <p className="quiet-copy">This project entry does not have an imported paper asset yet.</p>
            </div>
          )}
        </article>

        <aside className="reader-support-rail">
          {aiWorkspace ? (
            <AiWorkspaceShell
              description="Dock the active AI conversation beside Reader while keeping notebook and project docs as separate surfaces."
              headingLevel="h2"
              workspace={aiWorkspace}
              variant="docked"
            />
          ) : (
            <section className="workbench-surface" aria-label="AI workspace shell">
              <h2 className="panel-title">AI Workspace</h2>
              <p className="quiet-copy">
                {isLoading
                  ? 'Loading the docked AI workspace…'
                  : aiLoadError ??
                    'No AI session is docked yet, but Reader still exits into the standalone workspace.'}
              </p>
            </section>
          )}

          {detail ? (
            <>
              <section className="workbench-surface--section" aria-label="Reader supporting context">
                <h2 className="panel-title">Reader supporting context</h2>
                <p className="quiet-copy">
                  Notebook privacy and project ownership stay intact; Reader only mirrors the
                  evidence you need while reading.
                </p>

                <div className="reader-support-grid">
                  <section className="workbench-row--compact" aria-label="private notes mirror">
                    <h3 className="panel-title">Private notes</h3>
                    {privateNotes.length > 0 ? (
                      <div className="reader-note-list">
                        {privateNotes.map((note) => (
                          <p key={note.id} className="reader-note-item">
                            {note.body}
                          </p>
                        ))}
                      </div>
                    ) : (
                      <p className="quiet-copy">No private notes yet. Continue in Notebook.</p>
                    )}
                  </section>

                  <section className="workbench-row--compact" aria-label="shared comments mirror">
                    <h3 className="panel-title">Shared comments</h3>
                    {projectComments.length > 0 ? (
                      <div className="reader-note-list">
                        {projectComments.map((note) => (
                          <p key={note.id} className="reader-note-item">
                            {note.body}
                          </p>
                        ))}
                      </div>
                    ) : (
                      <p className="quiet-copy">No shared comments yet.</p>
                    )}
                  </section>
                </div>

                <section className="workbench-row--compact" aria-label="reading retrieval state">
                  <h3 className="panel-title">Reading status</h3>
                  <div className="reader-status-row">
                    <span className="status-badge">{retrievalState.summary}</span>
                    <span className="status-badge">
                      Full text available · {retrievalState.fullTextAvailable ? 'Yes' : 'No'}
                    </span>
                  </div>
                  <p className="quiet-copy">{retrievalState.detail}</p>
                </section>

                {detail.insights.length > 0 || governedJob ? (
                  <section className="workbench-row--compact" aria-label="governed insights mirror">
                    <h3 className="panel-title">Governed insights</h3>
                    {detail.insights.length > 0 ? (
                      <div className="reader-note-list">
                        {detail.insights.map((insight) => (
                          <p key={insight.id} className="reader-note-item">
                            {insight.summary}
                          </p>
                        ))}
                      </div>
                    ) : null}
                    {governedJob ? (
                      <p className="quiet-copy">
                        {governedJob.events.length} events · {governedJob.audits.length} audit
                        records · {governedJob.job.status}
                      </p>
                    ) : null}
                  </section>
                ) : null}
              </section>

              <div className="button-row">
                <Link className="panel-link" to={notebookPath}>
                  Open notebook
                </Link>
                <Link className="panel-link" to="/ai">
                  Open AI workspace
                </Link>
                {projectPath ? (
                  <Link className="panel-link" to={projectPath}>
                    Open project overview
                  </Link>
                ) : null}
                {resolvedProjectDocsPath ? (
                  <Link className="panel-link" to={resolvedProjectDocsPath}>
                    Open project docs
                  </Link>
                ) : null}
              </div>
            </>
          ) : null}
        </aside>
      </section>
    </main>
  );
}
