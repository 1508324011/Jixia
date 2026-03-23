import { useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';

import type { NoteVisibility, ReadingDetailView } from '@shared/contracts/reading';

import { PaperWorkspaceTabs } from '../components/paper-workspace-tabs';
import { createDemoApi } from '../lib/demo-api';

const demoApi = createDemoApi();
const DEFAULT_WRITER_TITLE = 'Tumor board literature synthesis';

export function ReaderPage() {
  const { spaceId, projectId = 'project-1', entryId = 'entry-1' } = useParams();
  const hasLegacySpaceContext = typeof spaceId === 'string' && spaceId.length > 0;
  const [detail, setDetail] = useState<ReadingDetailView | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [privateNoteBody, setPrivateNoteBody] = useState('');
  const [projectCommentBody, setProjectCommentBody] = useState('');
  const [insightSummary, setInsightSummary] = useState('');
  const [mutationError, setMutationError] = useState<string | null>(null);
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
        const readingDetail = await demoApi.getReadingDetail(entryId);

        if (!isCancelled) {
          setDetail(readingDetail);
        }
      } catch (error) {
        if (!isCancelled) {
          setDetail(null);
          setLoadError(
            error instanceof Error ? error.message : 'Failed to load the paper workspace.',
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
  }, [entryId]);

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
          <span>Space context · {spaceId}</span>
          <span>Project context · {projectId}</span>
          <span>Entry · {entryId}</span>
          <span className="status-badge">quoted evidence</span>
          <span className="status-badge">governed AI</span>
        </section>

        <section className="reader-page" aria-label="reading layout">
          <article className="panel paper-surface">
            <h2 className="panel-title">Paper text</h2>
            <p className="quiet-copy">Long-form reading surface with traceable source context.</p>
          </article>
          <aside className="panel paper-workspace">
            <h2 className="panel-title">Workbench</h2>
            <p className="quiet-copy">
              <span className="status-badge">space_shared note</span> · quoted evidence ·
              governed AI summary
            </p>
            <p className="quiet-copy">Governed action source · queued → running → succeeded</p>
            <PaperWorkspaceTabs />
          </aside>
        </section>

        <Link className="panel-link" to={`/spaces/${spaceId}/projects/${projectId}/writing/doc-1`}>
          Open writing
        </Link>
      </main>
    );
  }

  async function handleSaveNote(
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

  async function handleSaveInsight(): Promise<void> {
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
                  void handleSaveNote(
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
                  void handleSaveNote(
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
                onClick={() => void handleSaveInsight()}
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
