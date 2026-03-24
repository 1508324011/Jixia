import { useEffect, useMemo, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';

import type { GovernedJobView } from '@shared/contracts/jobs';
import type { ReadingDetailView } from '@shared/contracts/reading';

import { PaperWorkspaceTabs } from '../components/paper-workspace-tabs';
import {
  createDemoApi,
  getGovernedSummary,
  getReadingDetail as getLegacyReadingDetail,
} from '../lib/demo-api';

const demoApi = createDemoApi();
const DEFAULT_PROJECT_SPACE_ID = 'shared-space';

function buildNotesWorkspacePath(
  projectId: string,
  entryId: string,
  spaceId: string,
  preserveSpaceContext = false,
): string {
  const pathname = `/projects/${projectId}/library/${entryId}/notes`;

  if (!preserveSpaceContext && spaceId === DEFAULT_PROJECT_SPACE_ID) {
    return pathname;
  }

  return `${pathname}?spaceId=${encodeURIComponent(spaceId)}`;
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

export function ReaderPage() {
  const [searchParams] = useSearchParams();
  const { spaceId: routeSpaceId, projectId = 'project-1', entryId = 'entry-1' } = useParams();
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

  const privateNotes = useMemo(
    () => detail?.notes.filter((note) => note.visibility === 'private') ?? [],
    [detail],
  );
  const projectComments = useMemo(
    () => detail?.notes.filter((note) => note.visibility === 'space_shared') ?? [],
    [detail],
  );
  const linkedSpaceContext = hasExplicitSpaceContext ? resolvedSpaceId : DEFAULT_PROJECT_SPACE_ID;
  const projectDocsPath = buildProjectDocsPath(
    projectId,
    'doc-1',
    linkedSpaceContext,
    hasExplicitSpaceContext,
  );
  const notesWorkspacePath = buildNotesWorkspacePath(
    projectId,
    entryId,
    linkedSpaceContext,
    hasExplicitSpaceContext,
  );

  return (
    <main className="page-shell">
      <header className="page-header">
        <p className="page-kicker">Reading desk · single-paper focus · evidence review</p>
        <h1 className="page-title">Reader</h1>
        <p className="page-description">
          Stay with the paper here. Private thinking moves to Notes Workspace, and shared drafting
          stays in Project Docs.
        </p>
      </header>

      <section aria-label="context bar" className="context-bar">
        {hasExplicitSpaceContext ? <span>Space context · {resolvedSpaceId}</span> : null}
        <span>Project context · {projectId}</span>
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
          <h2 className="panel-title">Evidence workspace</h2>
          <p className="quiet-copy">
            Reader stays focused on evidence. Private notes and project docs now live on their own
            surfaces.
          </p>
          <PaperWorkspaceTabs />

          {detail ? (
            <div className="stack-sm">
              <p className="quiet-copy">Governed action source · queued → running → succeeded</p>

              <div className="stack-xs">
                <h3 className="panel-title">Private notebook preview</h3>
                {privateNotes.length > 0 ? (
                  privateNotes.map((note) => (
                    <p key={note.id} className="quiet-copy">
                      {note.body}
                    </p>
                  ))
                ) : (
                  <p className="quiet-copy">No private notes yet. Continue in Notes Workspace.</p>
                )}
              </div>

              <div className="stack-xs">
                <h3 className="panel-title">Project comments</h3>
                {projectComments.length > 0 ? (
                  projectComments.map((note) => (
                    <p key={note.id} className="quiet-copy">
                      {note.body}
                    </p>
                  ))
                ) : (
                  <p className="quiet-copy">No shared comments yet.</p>
                )}
              </div>

              <div className="stack-xs">
                <h3 className="panel-title">Governed insights</h3>
                {detail.insights.length > 0 ? (
                  detail.insights.map((insight) => (
                    <p key={insight.id} className="quiet-copy">
                      {insight.summary}
                    </p>
                  ))
                ) : (
                  <p className="quiet-copy">No governed insights yet.</p>
                )}
              </div>

              {governedJob ? (
                <div className="stack-xs">
                  <p className="quiet-copy">Latest governed finale</p>
                  <span className="status-badge">{governedJob.job.status}</span>
                  <p className="quiet-copy">
                    {governedJob.events.length} events · {governedJob.audits.length} audit records
                  </p>
                </div>
              ) : null}

              <div className="button-row">
                <Link className="panel-link" to={notesWorkspacePath}>
                  Open notes workspace
                </Link>
                <Link className="panel-link" to={projectDocsPath}>
                  Open project docs
                </Link>
              </div>
            </div>
          ) : null}
        </aside>
      </section>
    </main>
  );
}
