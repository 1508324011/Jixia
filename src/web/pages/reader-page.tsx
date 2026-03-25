import { useEffect, useMemo, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';

import type { GovernedJobView } from '@shared/contracts/jobs';
import type {
  ReadingDetailView,
  ReadingRetrievalStateView,
  ReadingWorkspaceView,
} from '@shared/contracts/reading';
import {
  defaultNotebookQuestionPrompts,
  metadataOnlyReadingRetrievalState,
} from '@shared/contracts/reading';

import { PaperWorkspaceTabs } from '../components/paper-workspace-tabs';
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

  const notebookId = `notebook-${detail.entry.id}`;

  return {
    notebookId,
    privateNotes: detail.notes.filter((note) => note.visibility === 'private'),
    questions: defaultNotebookQuestionPrompts.map((prompt, index) => ({
      id: `${notebookId}-question-${index + 1}`,
      prompt,
    })),
    sharedComments: detail.notes.filter((note) => note.visibility === 'space_shared'),
  };
}

function resolveRetrievalState(detail: ReadingDetailView): ReadingRetrievalStateView {
  return detail.retrieval ?? { ...metadataOnlyReadingRetrievalState };
}

export function ReaderPage() {
  const [searchParams] = useSearchParams();
  const { spaceId: routeSpaceId, projectId, entryId = 'entry-1' } = useParams();
  const isPersonalMode = !projectId;
  const spaceId = routeSpaceId ?? searchParams.get('spaceId') ?? undefined;
  const hasExplicitSpaceContext = typeof spaceId === 'string' && spaceId.length > 0;
  const resolvedSpaceId = spaceId ?? DEFAULT_PROJECT_SPACE_ID;

  const [detail, setDetail] = useState<ReadingDetailView | null>(null);
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
  const privateNotes = workspace?.privateNotes ?? [];
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
    <main className="page-shell">
      <header className="page-header">
        <p className="page-kicker">Evidence companion · paper review · notebook handoff</p>
        <h1 className="page-title">Reader</h1>
        <p className="page-description">
          Review the evidence here, then move back into the notebook and project surfaces where
          synthesis and drafting actually live.
        </p>
      </header>

      <section aria-label="context bar" className="context-bar">
        <span>{isPersonalMode ? 'Personal context' : `Project context · ${projectId}`}</span>
        {!isPersonalMode && hasExplicitSpaceContext ? <span>Space context · {resolvedSpaceId}</span> : null}
        <span>Entry · {entryId}</span>
        <span className="status-badge">{privateNotes.length} private notes</span>
        <span className="status-badge">{projectComments.length} shared comments</span>
      </section>

      <section className="reader-page" aria-label="reading layout">
        <article className="panel paper-surface">
          {isLoading ? (
            <>
              <h2 className="panel-title">Loading reading detail…</h2>
              <p className="quiet-copy">Pulling the imported record and its evidence context.</p>
            </>
          ) : loadError ? (
            <>
              <h2 className="panel-title">Reader unavailable</h2>
              <p className="quiet-copy">{loadError}</p>
            </>
          ) : detail ? (
            <>
              <h2 className="panel-title">{detail.asset.title}</h2>
              <p className="quiet-copy">
                {detail.asset.abstractText ?? 'No abstract was imported for this record.'}
              </p>
              <p className="quiet-copy">Canonical source · {detail.asset.canonicalId}</p>
            </>
          ) : (
            <>
              <h2 className="panel-title">No reading record found</h2>
              <p className="quiet-copy">This project entry does not have an imported paper asset yet.</p>
            </>
          )}
        </article>

        <aside className="panel paper-workspace">
          <h2 className="panel-title">Evidence companion</h2>
          <p className="quiet-copy">
            Reader stays subordinate to notebook synthesis and project drafting. Use the companion
            links to move back into the surfaces where decisions are made.
          </p>
          {detail ? (
            <PaperWorkspaceTabs
              governedJob={governedJob}
              insights={detail.insights}
              privateNotes={privateNotes}
              retrieval={retrievalState}
              sharedComments={projectComments}
            />
          ) : null}

          {detail ? (
            <div className="stack-sm">
              <p className="quiet-copy">
                Notebook prompts remain the synthesis scaffold in Notes Workspace, while reader keeps
                the evidence, comments, and governed summaries close at hand.
              </p>

              <div className="button-row">
                <Link className="panel-link" to={notebookPath}>
                  Back to notebook
                </Link>
                {projectPath ? (
                  <Link className="panel-link" to={projectPath}>
                    Back to project
                  </Link>
                ) : null}
                <Link className="panel-link" to={notesWorkspacePath}>
                  Open notes workspace
                </Link>
                {resolvedProjectDocsPath ? (
                  <Link className="panel-link" to={resolvedProjectDocsPath}>
                    Open project docs
                  </Link>
                ) : null}
              </div>
            </div>
          ) : null}
        </aside>
      </section>
    </main>
  );
}
