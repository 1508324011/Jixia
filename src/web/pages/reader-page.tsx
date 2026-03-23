import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';

import type { GovernedJobView } from '@shared/contracts/jobs';
import type { NoteVisibility, ReadingDetailView } from '@shared/contracts/reading';

import { PaperWorkspaceTabs } from '../components/paper-workspace-tabs';
import {
  createDemoApi,
  createReadingNote as createLegacyReadingNote,
  getGovernedSummary,
  getReadingDetail as getLegacyReadingDetail,
  saveReadingInsight as saveLegacyReadingInsight,
} from '../lib/demo-api';

const demoApi = createDemoApi();
const DEFAULT_WRITER_TITLE = 'Tumor board literature synthesis';

export function ReaderPage() {
  const { spaceId, projectId = 'project-1', entryId = 'entry-1' } = useParams();
  const hasLegacySpaceContext = typeof spaceId === 'string' && spaceId.length > 0;
  const resolvedSpaceId = spaceId ?? 'shared-space';

  const [detail, setDetail] = useState<ReadingDetailView | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [mutationError, setMutationError] = useState<string | null>(null);

  const [legacyNoteBody, setLegacyNoteBody] = useState('');
  const [legacyInsightSummary, setLegacyInsightSummary] = useState('');
  const [isSavingLegacyNote, setIsSavingLegacyNote] = useState(false);
  const [isSavingLegacyInsight, setIsSavingLegacyInsight] = useState(false);
  const [isRefreshingLegacyReader, setIsRefreshingLegacyReader] = useState(false);
  const [governedJob, setGovernedJob] = useState<GovernedJobView | null>(null);

  const [privateNoteBody, setPrivateNoteBody] = useState('');
  const [projectCommentBody, setProjectCommentBody] = useState('');
  const [insightSummary, setInsightSummary] = useState('');
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [writingDocumentId, setWritingDocumentId] = useState<string>('doc-1');
  const [isSavingPrivateNote, setIsSavingPrivateNote] = useState(false);
  const [isSavingProjectComment, setIsSavingProjectComment] = useState(false);
  const [isSavingInsight, setIsSavingInsight] = useState(false);
  const [isPromoting, setIsPromoting] = useState(false);

  useEffect(() => {
    let isCancelled = false;

    async function loadDetail(): Promise<void> {
      setIsLoading(true);
      setLoadError(null);

      try {
        const readingDetail = hasLegacySpaceContext
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
              : hasLegacySpaceContext
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
  }, [entryId, hasLegacySpaceContext, resolvedSpaceId]);

  useEffect(() => {
    if (!hasLegacySpaceContext) {
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
  }, [hasLegacySpaceContext, resolvedSpaceId]);

  const privateNotes = useMemo(
    () => detail?.notes.filter((note) => note.visibility === 'private') ?? [],
    [detail],
  );
  const projectComments = useMemo(
    () => detail?.notes.filter((note) => note.visibility === 'space_shared') ?? [],
    [detail],
  );
  const latestInsight = detail?.insights.at(-1) ?? null;
  const writingPath = detail
    ? `/spaces/${detail.entry.spaceId}/projects/${projectId}/writing/${writingDocumentId}`
    : null;

  async function refreshLegacyReader(): Promise<void> {
    setIsRefreshingLegacyReader(true);
    setMutationError(null);

    try {
      const readingDetail = await getLegacyReadingDetail(entryId, resolvedSpaceId);
      setDetail(readingDetail);
      setLoadError(null);
    } catch (error) {
      setMutationError(
        error instanceof Error ? error.message : 'Failed to refresh the reader.',
      );
    } finally {
      setIsRefreshingLegacyReader(false);
    }
  }

  async function handleSaveLegacyNote(): Promise<void> {
    if (!legacyNoteBody.trim()) {
      return;
    }

    setIsSavingLegacyNote(true);
    setMutationError(null);

    try {
      const response = await createLegacyReadingNote({
        body: legacyNoteBody.trim(),
        entryId,
        spaceId: resolvedSpaceId,
      });

      setDetail((current) =>
        current
          ? {
              ...current,
              notes: [...current.notes, response.note],
            }
          : current,
      );
      setLegacyNoteBody('');
    } catch (error) {
      setMutationError(
        error instanceof Error ? error.message : 'Failed to save the note.',
      );
    } finally {
      setIsSavingLegacyNote(false);
    }
  }

  async function handleSaveLegacyInsight(): Promise<void> {
    if (!legacyInsightSummary.trim()) {
      return;
    }

    setIsSavingLegacyInsight(true);
    setMutationError(null);

    try {
      const response = await saveLegacyReadingInsight({
        entryId,
        spaceId: resolvedSpaceId,
        summary: legacyInsightSummary.trim(),
      });

      setDetail((current) =>
        current
          ? {
              ...current,
              insights: [...current.insights, response.insight],
            }
          : current,
      );
      setLegacyInsightSummary('');
    } catch (error) {
      setMutationError(
        error instanceof Error ? error.message : 'Failed to save the insight.',
      );
    } finally {
      setIsSavingLegacyInsight(false);
    }
  }

  async function handleSaveWorkbenchNote(
    body: string,
    visibility: NoteVisibility,
    setSaving: (value: boolean) => void,
    resetBody: () => void,
  ): Promise<void> {
    if (!body.trim()) {
      return;
    }

    setSaving(true);
    setMutationError(null);
    setSuccessMessage(null);

    try {
      const response = await demoApi.createReadingNote({
        body: body.trim(),
        entryId,
        visibility,
      });

      setDetail((current) =>
        current
          ? {
              ...current,
              notes: [...current.notes, response.note],
            }
          : current,
      );
      resetBody();
    } catch (error) {
      setMutationError(
        error instanceof Error ? error.message : 'Failed to save the reading note.',
      );
    } finally {
      setSaving(false);
    }
  }

  async function handleSaveWorkbenchInsight(): Promise<void> {
    if (!insightSummary.trim()) {
      return;
    }

    setIsSavingInsight(true);
    setMutationError(null);
    setSuccessMessage(null);

    try {
      const response = await demoApi.saveReadingInsight({
        entryId,
        summary: insightSummary.trim(),
      });

      setDetail((current) =>
        current
          ? {
              ...current,
              insights: [...current.insights, response.insight],
            }
          : current,
      );
      setInsightSummary('');
    } catch (error) {
      setMutationError(
        error instanceof Error ? error.message : 'Failed to save the governed insight.',
      );
    } finally {
      setIsSavingInsight(false);
    }
  }

  async function handlePromoteLatestInsight(): Promise<void> {
    if (!detail || !latestInsight) {
      return;
    }

    setIsPromoting(true);
    setMutationError(null);
    setSuccessMessage(null);

    try {
      const response = await demoApi.saveWritingDocument({
        citations: latestInsight.evidenceSpans.map((span) => ({
          evidenceSpan: span.quote,
          paperAssetId: span.paperAssetId,
        })),
        content: latestInsight.summary,
        projectId,
        spaceId: detail.entry.spaceId,
        title: DEFAULT_WRITER_TITLE,
      });

      setWritingDocumentId(response.document.documentId);
      setSuccessMessage('Promoted latest insight into Writer.');
    } catch (error) {
      setMutationError(
        error instanceof Error ? error.message : 'Failed to promote the latest insight.',
      );
    } finally {
      setIsPromoting(false);
    }
  }

  if (hasLegacySpaceContext) {
    return (
      <main className="page-shell">
        <header className="page-header">
          <p className="page-kicker">Reading desk · notes · evidence-linked insight</p>
          <h1 className="page-title">Reader</h1>
          <p className="page-description">
            Read the paper asset while keeping notes, evidence spans, and generated insights in
            view.
          </p>
        </header>

        <section aria-label="context bar" className="context-bar">
          <span>Space context · {resolvedSpaceId}</span>
          <span>Project context · {projectId}</span>
          <span>Entry · {entryId}</span>
          <span className="status-badge">quoted evidence</span>
          <span className="status-badge">governed AI</span>
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
            ) : loadError ? (
              <>
                <h2 className="panel-title">Reading unavailable</h2>
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
              <span className="status-badge">space_shared note</span> · quoted evidence ·
              governed AI summary
            </p>
            <PaperWorkspaceTabs />

            {detail ? (
              <div className="stack-sm">
                <p className="quiet-copy">Governed action source · queued → running → succeeded</p>

                <label className="quiet-copy" htmlFor="legacy-note-body">
                  Note body
                </label>
                <textarea
                  id="legacy-note-body"
                  className="draft-editor"
                  rows={4}
                  value={legacyNoteBody}
                  onChange={(event) => setLegacyNoteBody(event.target.value)}
                />

                <label className="quiet-copy" htmlFor="legacy-insight-summary">
                  Insight summary
                </label>
                <textarea
                  id="legacy-insight-summary"
                  className="draft-editor"
                  rows={3}
                  value={legacyInsightSummary}
                  onChange={(event) => setLegacyInsightSummary(event.target.value)}
                />

                <div className="button-row">
                  <button
                    type="button"
                    className="action-button"
                    onClick={() => void handleSaveLegacyNote()}
                    disabled={isSavingLegacyNote || isSavingLegacyInsight || isRefreshingLegacyReader}
                  >
                    {isSavingLegacyNote ? 'Saving note…' : 'Save note'}
                  </button>
                  <button
                    type="button"
                    className="action-button"
                    onClick={() => void handleSaveLegacyInsight()}
                    disabled={isSavingLegacyNote || isSavingLegacyInsight || isRefreshingLegacyReader}
                  >
                    {isSavingLegacyInsight ? 'Saving insight…' : 'Save insight'}
                  </button>
                  <button
                    type="button"
                    className="action-button action-button-secondary"
                    onClick={() => void refreshLegacyReader()}
                    disabled={isSavingLegacyNote || isSavingLegacyInsight || isRefreshingLegacyReader}
                  >
                    {isRefreshingLegacyReader ? 'Refreshing…' : 'Refresh reader'}
                  </button>
                </div>

                {mutationError ? <p className="quiet-copy">{mutationError}</p> : null}

                {detail.notes.length > 0 ? (
                  detail.notes.map((note) => (
                    <div key={note.id} className="stack-xs">
                      <span className="status-badge">{note.visibility} note</span>
                      <p className="quiet-copy">{note.body}</p>
                    </div>
                  ))
                ) : (
                  <p className="quiet-copy">No notes captured for this entry yet.</p>
                )}

                {detail.insights.length > 0 ? (
                  detail.insights.map((insight) => (
                    <div key={insight.id} className="stack-xs">
                      <span className="status-badge">governed insight</span>
                      <p className="quiet-copy">{insight.summary}</p>
                    </div>
                  ))
                ) : (
                  <p className="quiet-copy">No governed summaries have been saved for this entry yet.</p>
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
                    No governed summary has been run for this space yet. Continue in Writing for the
                    optional finale.
                  </p>
                )}
              </div>
            ) : null}
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

  return (
    <main className="page-shell">
      <header className="page-header">
        <p className="page-kicker">Reading desk · notes · evidence-linked insight</p>
        <h1 className="page-title">Reader</h1>
        <p className="page-description">
          Read the paper asset while keeping notes, evidence spans, and generated insights in view.
        </p>
      </header>

      <section aria-label="context bar" className="context-bar">
        <span>Project context · {projectId}</span>
        <span>Entry · {entryId}</span>
        {detail ? <span>Space context · {detail.entry.spaceId}</span> : null}
        <span className="status-badge">{privateNotes.length} private notes</span>
        <span className="status-badge">{projectComments.length} shared comments</span>
      </section>

      <section className="reader-page" aria-label="reading layout">
        <article className="panel paper-surface">
          {isLoading ? (
            <>
              <h2 className="panel-title">Loading paper workspace…</h2>
              <p className="quiet-copy">Pulling the imported reading record from the server.</p>
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
                {detail.asset.abstractText ?? 'No abstract was imported for this paper asset.'}
              </p>
              <p className="quiet-copy">Canonical source · {detail.asset.canonicalId}</p>
            </>
          ) : (
            <>
              <h2 className="panel-title">No paper loaded</h2>
              <p className="quiet-copy">The selected project entry does not have a paper asset.</p>
            </>
          )}
        </article>

        <aside className="panel paper-workspace">
          <h2 className="panel-title">Workbench</h2>
          <p className="quiet-copy">
            <span className="status-badge">quoted evidence</span> · governed AI · Writer promotion
          </p>
          <PaperWorkspaceTabs />

          {detail ? (
            <div className="stack-sm">
              <label className="quiet-copy" htmlFor="private-note-body">
                Private note
              </label>
              <textarea
                id="private-note-body"
                className="draft-editor"
                rows={3}
                value={privateNoteBody}
                onChange={(event) => setPrivateNoteBody(event.target.value)}
              />
              <button
                type="button"
                className="action-button"
                disabled={isSavingPrivateNote || isSavingProjectComment || isSavingInsight || isPromoting}
                onClick={() =>
                  void handleSaveWorkbenchNote(
                    privateNoteBody,
                    'private',
                    setIsSavingPrivateNote,
                    () => setPrivateNoteBody(''),
                  )
                }
              >
                {isSavingPrivateNote ? 'Saving private note…' : 'Save private note'}
              </button>

              <label className="quiet-copy" htmlFor="project-comment-body">
                Project comment
              </label>
              <textarea
                id="project-comment-body"
                className="draft-editor"
                rows={3}
                value={projectCommentBody}
                onChange={(event) => setProjectCommentBody(event.target.value)}
              />
              <button
                type="button"
                className="action-button"
                disabled={isSavingPrivateNote || isSavingProjectComment || isSavingInsight || isPromoting}
                onClick={() =>
                  void handleSaveWorkbenchNote(
                    projectCommentBody,
                    'space_shared',
                    setIsSavingProjectComment,
                    () => setProjectCommentBody(''),
                  )
                }
              >
                {isSavingProjectComment ? 'Saving project comment…' : 'Save project comment'}
              </button>

              <label className="quiet-copy" htmlFor="insight-summary-body">
                Insight summary
              </label>
              <textarea
                id="insight-summary-body"
                className="draft-editor"
                rows={3}
                value={insightSummary}
                onChange={(event) => setInsightSummary(event.target.value)}
              />
              <button
                type="button"
                className="action-button"
                disabled={isSavingPrivateNote || isSavingProjectComment || isSavingInsight || isPromoting}
                onClick={() => void handleSaveWorkbenchInsight()}
              >
                {isSavingInsight ? 'Saving insight…' : 'Save insight'}
              </button>

              <button
                type="button"
                className="action-button action-button-secondary"
                disabled={!latestInsight || isSavingPrivateNote || isSavingProjectComment || isSavingInsight || isPromoting}
                onClick={() => void handlePromoteLatestInsight()}
              >
                {isPromoting ? 'Promoting latest insight…' : 'Promote latest insight to Writer'}
              </button>

              {mutationError ? <p className="quiet-copy">{mutationError}</p> : null}
              {successMessage ? <p className="quiet-copy">{successMessage}</p> : null}

              <div className="stack-xs">
                <h3 className="panel-title">Private notes</h3>
                {privateNotes.length > 0 ? (
                  privateNotes.map((note) => (
                    <p key={note.id} className="quiet-copy">
                      {note.body}
                    </p>
                  ))
                ) : (
                  <p className="quiet-copy">No private notes yet.</p>
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
            </div>
          ) : null}
        </aside>
      </section>

      {writingPath ? (
        <Link className="panel-link" to={writingPath}>
          Open writing
        </Link>
      ) : null}
    </main>
  );
}
