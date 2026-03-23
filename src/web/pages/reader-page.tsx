import { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';

import type { ReadingDetailView } from '@shared/contracts/reading';
import type { GovernedJobView } from '@shared/contracts/jobs';

import {
  createReadingNote,
  getGovernedSummary,
  getReadingDetail,
  saveReadingInsight,
} from '../lib/demo-api';
import { PaperWorkspaceTabs } from '../components/paper-workspace-tabs';

export function ReaderPage() {
  const {
    spaceId,
    projectId = 'tumor-board',
    entryId = 'entry-1',
  } = useParams();
  const hasSpaceContext = typeof spaceId === 'string' && spaceId.length > 0;
  const resolvedSpaceId = spaceId ?? 'shared-space';

  const [data, setData] = useState<ReadingDetailView | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [noteBody, setNoteBody] = useState('');
  const [insightSummary, setInsightSummary] = useState('');
  const [mutationError, setMutationError] = useState<string | null>(null);
  const [isSavingNote, setIsSavingNote] = useState(false);
  const [isSavingInsight, setIsSavingInsight] = useState(false);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [governedJob, setGovernedJob] = useState<GovernedJobView | null>(null);

  useEffect(() => {
    let isCancelled = false;

    async function loadDetail(): Promise<void> {
      setIsLoading(true);
      setError(null);

      try {
        const detail = await getReadingDetail(entryId, resolvedSpaceId);

        if (!isCancelled) {
          setData(detail);
        }
      } catch (loadError) {
        if (!isCancelled) {
          setError(
            loadError instanceof Error
              ? loadError.message
              : 'Failed to load the reading detail.',
          );
          setData(null);
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
  }, [entryId, resolvedSpaceId]);

  useEffect(() => {
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
  }, [resolvedSpaceId]);

  async function refreshReader(): Promise<void> {
    setIsRefreshing(true);
    setMutationError(null);

    try {
      const detail = await getReadingDetail(entryId, resolvedSpaceId);
      setData(detail);
      setError(null);
    } catch (refreshError) {
      setMutationError(
        refreshError instanceof Error
          ? refreshError.message
          : 'Failed to refresh the reader.',
      );
    } finally {
      setIsRefreshing(false);
    }
  }

  async function handleSaveNote(): Promise<void> {
    if (!noteBody.trim()) {
      return;
    }

    setIsSavingNote(true);
    setMutationError(null);

    try {
      const response = await createReadingNote({
        body: noteBody.trim(),
        entryId,
        spaceId: resolvedSpaceId,
      });

      setData((current) =>
        current
          ? {
              ...current,
              notes: [...current.notes, response.note],
            }
          : current,
      );
      setNoteBody('');
    } catch (saveError) {
      setMutationError(
        saveError instanceof Error ? saveError.message : 'Failed to save the note.',
      );
    } finally {
      setIsSavingNote(false);
    }
  }

  async function handleSaveInsight(): Promise<void> {
    if (!insightSummary.trim()) {
      return;
    }

    setIsSavingInsight(true);
    setMutationError(null);

    try {
      const response = await saveReadingInsight({
        entryId,
        spaceId: resolvedSpaceId,
        summary: insightSummary.trim(),
      });

      setData((current) =>
        current
          ? {
              ...current,
              insights: [...current.insights, response.insight],
            }
          : current,
      );
      setInsightSummary('');
    } catch (saveError) {
      setMutationError(
        saveError instanceof Error
          ? saveError.message
          : 'Failed to save the insight.',
      );
    } finally {
      setIsSavingInsight(false);
    }
  }

  const statusLabel = data?.entry.visibility ?? 'reading';
  const noteCountLabel = `${data?.notes.length ?? 0} notes`;
  const insightCountLabel = `${data?.insights.length ?? 0} insights`;

  return (
    <main className="page-shell">
      <header className="page-header">
        <p className="page-kicker">Reading desk · notes · evidence-linked insight</p>
        <h1 className="page-title">Reader</h1>
        <p className="page-description">
          Read the paper asset while keeping notes, evidence spans, and
          generated insights in view.
        </p>
      </header>

      <section aria-label="context bar" className="context-bar">
        {hasSpaceContext ? <span>Space context · {spaceId}</span> : null}
        <span>Project context · {projectId}</span>
        <span>Entry · {entryId}</span>
        <span className="status-badge">{statusLabel}</span>
        <span className="status-badge">{noteCountLabel}</span>
        <span className="status-badge">{insightCountLabel}</span>
      </section>

      <section className="reader-page" aria-label="reading layout">
        <article className="panel paper-surface">
          {isLoading ? (
            <>
              <h2 className="panel-title">Loading reading detail…</h2>
              <p className="quiet-copy">
                Pulling the imported record and its governed evidence context.
              </p>
            </>
          ) : error ? (
            <>
              <h2 className="panel-title">Reading unavailable</h2>
              <p className="quiet-copy">
                The reader could not load the paper asset for this entry.
              </p>
            </>
          ) : data ? (
            <>
              <h2 className="panel-title">{data.asset.title}</h2>
              <p className="quiet-copy">
                {data.asset.abstractText ?? 'No abstract was imported for this record.'}
              </p>
              <p className="quiet-copy">Canonical source · {data.asset.canonicalId}</p>
            </>
          ) : (
            <>
              <h2 className="panel-title">No reading record found</h2>
              <p className="quiet-copy">
                This project entry does not have an imported paper asset yet.
              </p>
            </>
          )}
        </article>
        <aside className="panel paper-workspace">
          <h2 className="panel-title">Evidence workspace</h2>
          <p className="quiet-copy">
            <span className="status-badge">space_shared note</span> · quoted evidence ·
            governed AI summary
          </p>
          <PaperWorkspaceTabs />
          {isLoading ? (
            <p className="quiet-copy">Preparing notes and insight context…</p>
          ) : error ? (
            <p className="quiet-copy">Notes and insights are unavailable right now.</p>
          ) : data ? (
            <div className="stack-sm">
              <p className="quiet-copy">
                Governed action source · queued → running → succeeded
              </p>
              <label className="quiet-copy" htmlFor="note-body">
                Note body
              </label>
              <textarea
                id="note-body"
                className="draft-editor"
                rows={4}
                value={noteBody}
                onChange={(event) => setNoteBody(event.target.value)}
              />
              <label className="quiet-copy" htmlFor="insight-summary">
                Insight summary
              </label>
              <textarea
                id="insight-summary"
                className="draft-editor"
                rows={3}
                value={insightSummary}
                onChange={(event) => setInsightSummary(event.target.value)}
              />
              <div className="button-row">
                <button
                  type="button"
                  className="action-button"
                  onClick={() => void handleSaveNote()}
                  disabled={isSavingNote || isSavingInsight || isRefreshing}
                >
                  {isSavingNote ? 'Saving note…' : 'Save note'}
                </button>
                <button
                  type="button"
                  className="action-button"
                  onClick={() => void handleSaveInsight()}
                  disabled={isSavingNote || isSavingInsight || isRefreshing}
                >
                  {isSavingInsight ? 'Saving insight…' : 'Save insight'}
                </button>
                <button
                  type="button"
                  className="action-button action-button-secondary"
                  onClick={() => void refreshReader()}
                  disabled={isSavingNote || isSavingInsight || isRefreshing}
                >
                  {isRefreshing ? 'Refreshing…' : 'Refresh reader'}
                </button>
              </div>
              {mutationError ? <p className="quiet-copy">{mutationError}</p> : null}
              {data.notes.length > 0 ? (
                data.notes.map((note) => (
                  <div key={note.id} className="stack-xs">
                    <span className="status-badge">{note.visibility} note</span>
                    <p className="quiet-copy">{note.body}</p>
                  </div>
                ))
              ) : (
                <p className="quiet-copy">No notes captured for this entry yet.</p>
              )}
              {data.insights.length > 0 ? (
                data.insights.map((insight) => (
                  <div key={insight.id} className="stack-xs">
                    <span className="status-badge">governed insight</span>
                    <p className="quiet-copy">{insight.summary}</p>
                  </div>
                ))
              ) : (
                <p className="quiet-copy">
                  No governed summaries have been saved for this entry yet.
                </p>
              )}
              {governedJob ? (
                <div className="stack-xs">
                  <p className="quiet-copy">Latest governed finale</p>
                  <span className="status-badge">{governedJob.job.status}</span>
                  <p className="quiet-copy">
                    {governedJob.events.length} events · {governedJob.audits.length} audit records
                  </p>
                </div>
              ) : (
                <p className="quiet-copy">
                  No governed summary has been run for this space yet. Continue in Writing for
                  the optional finale.
                </p>
              )}
            </div>
          ) : (
            <p className="quiet-copy">No evidence workspace is available yet.</p>
          )}
        </aside>
      </section>

      <Link
        className="panel-link"
        to={`/spaces/${resolvedSpaceId}/projects/${projectId}/writing/doc-1`}
      >
        Open writing
      </Link>
    </main>
  );
}
