import { useEffect, useMemo, useState } from "react";
import { Link, useParams } from "react-router-dom";

import type { GeneratedInsightRecord } from "@shared/contracts/evidence";
import type { ReadingDetailView } from "@shared/contracts/reading";

import { PaperWorkspaceTabs } from "../components/paper-workspace-tabs";
import { createDemoApi } from "../lib/demo-api";
import { apiClient } from "../lib/http-client";
import { useReaderPresenter } from "../presenters/reader-presenter";

const demoApi = createDemoApi();
const DEFAULT_WRITER_TITLE = "Tumor board literature synthesis";

export function ReaderPage() {
  const {
    spaceId,
    projectId = "",
    entryId = "",
  } = useParams();
  const hasLegacySpaceContext = typeof spaceId === "string" && spaceId.length > 0;
  const hasProjectRouteContext = typeof projectId === "string" && projectId.length > 0;
  const isPersonalReaderRoute = !hasLegacySpaceContext && !hasProjectRouteContext;
  const projectReader = useReaderPresenter(projectId, entryId);
  const [detail, setDetail] = useState<ReadingDetailView | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isWorkbenchLoading, setIsWorkbenchLoading] = useState(isPersonalReaderRoute);
  const [privateNoteBody, setPrivateNoteBody] = useState("");
  const [projectCommentBody, setProjectCommentBody] = useState("");
  const [insightSummary, setInsightSummary] = useState("");
  const [mutationError, setMutationError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [promotedDocumentId, setPromotedDocumentId] = useState<string | null>(null);
  const [isSavingPrivateNote, setIsSavingPrivateNote] = useState(false);
  const [isSavingInsight, setIsSavingInsight] = useState(false);
  const [isPromoting, setIsPromoting] = useState(false);
  const [projectReaderCommentBody, setProjectReaderCommentBody] = useState(
    "This paper matters for the shared review.",
  );

  useEffect(() => {
    setPromotedDocumentId(null);
    setSuccessMessage(null);
    setMutationError(null);
  }, [entryId, projectId]);

  useEffect(() => {
    if (!isPersonalReaderRoute || hasLegacySpaceContext) {
      setIsWorkbenchLoading(false);
      return;
    }

    let isCancelled = false;

    async function loadDetail(): Promise<void> {
      setIsWorkbenchLoading(true);
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
            error instanceof Error ? error.message : "Failed to load the paper workspace.",
          );
        }
      } finally {
        if (!isCancelled) {
          setIsWorkbenchLoading(false);
        }
      }
    }

    void loadDetail();

    return () => {
      isCancelled = true;
    };
  }, [entryId, hasLegacySpaceContext, isPersonalReaderRoute]);

  const privateNotes = useMemo(
    () => detail?.notes ?? [],
    [detail],
  );
  const projectComments = useMemo(
    () => detail?.projectComments ?? [],
    [detail],
  );
  const latestInsight = detail?.insights.at(-1) ?? null;
  const workbenchWritingPath = promotedDocumentId
    ? `/projects/${projectId}/writing/${promotedDocumentId}`
    : null;

  async function promoteInsightToWriter(
    targetProjectId: string,
    insight: GeneratedInsightRecord,
  ): Promise<string> {
    const createdDocument = await apiClient.createProjectDoc({
      projectId: targetProjectId,
      title: DEFAULT_WRITER_TITLE,
    });

    const savedSnapshot = await apiClient.saveProjectDocVersion(
      createdDocument.id,
      {
        citations: insight.evidenceSpans.map((span) => ({
          evidenceSpan: span.quote,
          paperAssetId: span.paperAssetId,
        })),
        content: insight.summary,
      },
    );

    return savedSnapshot.document.id;
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
              <span className="status-badge">project comment</span> · quoted evidence ·
              governed AI summary
            </p>
            <p className="quiet-copy">Governed action source · queued → running → succeeded</p>
            <PaperWorkspaceTabs />
            <p className="quiet-copy">
              Legacy `/spaces/...` reader routes stay compatibility-only. Open the canonical
              `/projects/:projectId` workspace to reach a real Writer document.
            </p>
          </aside>
        </section>
      </main>
    );
  }

  async function handleSaveNote(
    body: string,
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
        error instanceof Error ? error.message : "Failed to save the reading note.",
      );
    } finally {
      setSaving(false);
    }
  }

  async function handlePersonalProjectCommentAttempt(): Promise<void> {
    setMutationError(
      "Open a real project workspace before saving project comments.",
    );
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
      setInsightSummary("");
    } catch (error) {
      setMutationError(
        error instanceof Error ? error.message : "Failed to save the governed insight.",
      );
    } finally {
      setIsSavingInsight(false);
    }
  }

  async function handlePromoteLatestInsight(): Promise<void> {
    if (!detail || !latestInsight) {
      return;
    }

    setMutationError(
      "Open a real project workspace before promoting personal reading insights into Writer.",
    );
  }

  if (hasProjectRouteContext) {
    const {
      asset,
      entry,
      error,
      insights,
      isLoading,
      isMutating,
      notes,
      projectComments,
      project,
      refresh,
      saveGeneratedInsight,
      saveNote,
      saveProjectComment,
    } = projectReader;
    const resolvedSpaceId = project?.project.spaceId ?? "No governance space";
    const projectLabel = project?.project.name ?? (projectId || "No project");
    const contextProjectId = project?.project.id ?? projectId;
    const latestProjectInsight = insights.at(-1) ?? null;
    const projectWritingPath = promotedDocumentId
      ? `/projects/${contextProjectId}/writing/${promotedDocumentId}`
      : null;

    async function handleProjectPromoteLatestInsight(): Promise<void> {
      if (!project || !latestProjectInsight) {
        return;
      }

      setIsPromoting(true);
      setMutationError(null);
      setSuccessMessage(null);

      try {
        const nextDocumentId = await promoteInsightToWriter(
          project.project.id,
          latestProjectInsight,
        );
        setPromotedDocumentId(nextDocumentId);
        setSuccessMessage(`Promoted latest insight into Writer as ${nextDocumentId}.`);
      } catch (error) {
        setMutationError(
          error instanceof Error ? error.message : "Failed to promote the latest insight.",
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
          <span>Space context · {resolvedSpaceId}</span>
          <span>Project context · {projectLabel}</span>
          <span>Entry · {entryId}</span>
          <span className="status-badge">quoted evidence</span>
          <span className="status-badge">governed AI</span>
          <button className="panel-link" type="button" onClick={() => void refresh()}>
            Refresh
          </button>
        </section>

        {error ? (
          <section className="panel-grid" aria-label="reader errors">
            <article className="panel">
              <h2 className="panel-title">Reader runtime error</h2>
              <p className="quiet-copy">{error}</p>
            </article>
          </section>
        ) : null}

        <section className="panel-grid" aria-label="reading layout">
          <article className="panel">
            <h2 className="panel-title">Paper text</h2>
            <p className="quiet-copy">
              {asset?.title ?? "No paper asset loaded from the server for this project entry."}
            </p>
            <p className="quiet-copy">Canonical id · {asset?.canonicalId ?? "No asset"}</p>
            <p className="quiet-copy">Visibility · {entry?.visibility ?? "No entry"}</p>
            <p className="quiet-copy">
              {asset?.abstractText ?? "Use project library imports before opening reader detail."}
            </p>
            {isLoading ? (
              <p className="quiet-copy">Loading reader detail from the browser-facing runtime.</p>
            ) : null}
          </article>

          <aside className="panel paper-workspace">
            <h2 className="panel-title">Workbench</h2>
            <p className="quiet-copy">
              <span className="status-badge">quoted evidence</span> · governed AI · Writer promotion
            </p>
            <p className="quiet-copy">Governed action source · queued → running → succeeded</p>
            <PaperWorkspaceTabs />
            <label className="quiet-copy" htmlFor="reader-private-note-input">
              Private note draft
            </label>
            <textarea
              id="reader-private-note-input"
              value={privateNoteBody}
              onChange={(event) => setPrivateNoteBody(event.target.value)}
            />
            <button
              className="panel-link"
              type="button"
              disabled={isMutating || privateNoteBody.trim().length === 0}
              onClick={() => {
                void saveNote(privateNoteBody.trim()).then(() => setPrivateNoteBody(""));
              }}
            >
              {isMutating ? "Saving…" : "Save private note"}
            </button>
            <label className="quiet-copy" htmlFor="reader-comment-input">
              Project comment draft
            </label>
            <textarea
              id="reader-comment-input"
              value={projectReaderCommentBody}
              onChange={(event) => setProjectReaderCommentBody(event.target.value)}
            />
            <button
              className="panel-link"
              type="button"
              disabled={isMutating || projectReaderCommentBody.trim().length === 0}
              onClick={() => {
                void saveProjectComment(projectReaderCommentBody.trim()).then(() => setProjectReaderCommentBody(""));
              }}
            >
              {isMutating ? "Saving…" : "Save project comment"}
            </button>
            <button
              className="panel-link"
              type="button"
              disabled={isMutating}
              onClick={() =>
                void saveGeneratedInsight(
                  "The imported paper supports the shared review workflow.",
                  "AI summary",
                )
              }
            >
              {isMutating ? "Generating…" : "Generate insight"}
            </button>
            <button
              className="panel-link"
              type="button"
              disabled={!latestProjectInsight || isMutating || isPromoting}
              onClick={() => void handleProjectPromoteLatestInsight()}
            >
              {isPromoting ? "Promoting…" : "Promote latest insight to Writer"}
            </button>
            {mutationError ? <p className="quiet-copy">{mutationError}</p> : null}
            {successMessage ? <p className="quiet-copy">{successMessage}</p> : null}
            {projectWritingPath ? (
              <Link className="panel-link" to={projectWritingPath}>
                Open writing
              </Link>
            ) : (
              <p className="quiet-copy">
                This reader entry is not currently available in the selected project Writer flow.
              </p>
            )}
            <div className="shell-grid">
              {notes.map((note) => (
                <div key={note.id} className="hero-card">
                  <h3 className="panel-title">Private note</h3>
                  <p className="quiet-copy">{note.body}</p>
                </div>
              ))}
              {projectComments.map((comment) => (
                <div key={comment.id} className="hero-card">
                  <h3 className="panel-title">Project comment</h3>
                  <p className="quiet-copy">{comment.body}</p>
                </div>
              ))}
              {insights.map((insight) => (
                <div key={insight.id} className="hero-card">
                  <h3 className="panel-title">Insight</h3>
                  <p className="quiet-copy">{insight.summary}</p>
                  <p className="quiet-copy">Evidence spans · {insight.evidenceSpans.length}</p>
                </div>
              ))}
            </div>
          </aside>
        </section>
      </main>
    );
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
        <span>Personal context</span>
        <span>Entry · {entryId}</span>
        {detail ? <span>Space context · {detail.entry.spaceId}</span> : null}
        <span className="status-badge">{privateNotes.length} private notes</span>
        <span className="status-badge">{projectComments.length} project comments</span>
      </section>

      <section className="reader-page" aria-label="reading layout">
        <article className="panel paper-surface">
          {isWorkbenchLoading ? (
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
                {detail.asset.abstractText ?? "No abstract was imported for this paper asset."}
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
                disabled={isSavingPrivateNote || isSavingInsight || isPromoting}
                onClick={() =>
                  void handleSaveNote(privateNoteBody, setIsSavingPrivateNote, () =>
                    setPrivateNoteBody(""),
                  )
                }
              >
                {isSavingPrivateNote ? "Saving private note…" : "Save private note"}
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
                disabled={isSavingPrivateNote || isSavingInsight || isPromoting}
                onClick={() => void handlePersonalProjectCommentAttempt()}
              >
                Save project comment
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
                disabled={isSavingPrivateNote || isSavingInsight || isPromoting}
                onClick={() => void handleSaveInsight()}
              >
                {isSavingInsight ? "Saving insight…" : "Save insight"}
              </button>

              <button
                type="button"
                className="action-button action-button-secondary"
                disabled={
                  !latestInsight ||
                  isSavingPrivateNote ||
                  isSavingInsight ||
                  isPromoting
                }
                onClick={() => void handlePromoteLatestInsight()}
              >
                {isPromoting ? "Promoting latest insight…" : "Promote latest insight to Writer"}
              </button>

              {mutationError ? <p className="quiet-copy">{mutationError}</p> : null}
              {successMessage ? <p className="quiet-copy">{successMessage}</p> : null}
              <p className="quiet-copy">
                Personal reader does not invent a project. Open a real project workspace before Writer promotion.
              </p>

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
                  projectComments.map((comment) => (
                    <p key={comment.id} className="quiet-copy">
                      {comment.body}
                    </p>
                  ))
                ) : (
                  <p className="quiet-copy">No project comments yet.</p>
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

      {workbenchWritingPath ? (
        <Link className="panel-link" to={workbenchWritingPath}>
          Open writing
        </Link>
      ) : null}
    </main>
  );
}
