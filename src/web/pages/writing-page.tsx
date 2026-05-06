import { useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";

import { useProjectDocPresenter } from "../presenters/project-doc-presenter";

export function WritingPage() {
  const { projectId, docId } = useParams();
  const presenter = useProjectDocPresenter(projectId, docId);
  const [draftContent, setDraftContent] = useState(presenter.content);
  const [draftVersionId, setDraftVersionId] = useState<string | null>(
    presenter.snapshot?.versionId ?? null,
  );
  const [mutationError, setMutationError] = useState<string | null>(null);
  const [isSavePendingLocally, setIsSavePendingLocally] = useState(false);
  const [isReloading, setIsReloading] = useState(false);
  const draftContentRef = useRef(draftContent);
  const mutationLockRef = useRef<"save" | "reload" | null>(null);
  const snapshotVersionId = presenter.snapshot?.versionId ?? null;
  const isMutating = presenter.isSaving || isSavePendingLocally || isReloading || mutationLockRef.current !== null;
  const isDraftHydrating = snapshotVersionId !== draftVersionId;

  useEffect(() => {
    setDraftContent(presenter.content);
    draftContentRef.current = presenter.content;
    setDraftVersionId(snapshotVersionId);
  }, [presenter.content, snapshotVersionId]);

  if (!projectId || !docId) {
    return (
      <main className="page-shell">
        <header className="page-header">
          <p className="page-kicker">Manuscript studio · versioned drafting · citation traceability</p>
          <h1 className="page-title">Writing</h1>
          <p className="page-description">
            Select a visible project document before opening the shared writing surface.
          </p>
        </header>

        <section className="panel-grid" aria-label="writing route errors">
          <article className="panel">
            <h2 className="panel-title">Project document route missing</h2>
            <p className="quiet-copy">
              The canonical writing route is `/projects/:projectId/writing/:docId` and cannot be fabricated in the browser.
            </p>
            <Link className="panel-link" to="/projects">
              Back to projects
            </Link>
          </article>
        </section>
      </main>
    );
  }

  async function handleSave(): Promise<void> {
    if (!presenter.document || mutationLockRef.current) {
      return;
    }

    mutationLockRef.current = "save";
    setIsSavePendingLocally(true);
    setMutationError(null);

    try {
      await presenter.save({
        citations: presenter.citations.map((citation) => ({
          evidenceSpan: citation.evidenceSpan,
          paperAssetId: citation.paperAssetId,
        })),
        content: draftContentRef.current,
      });
    } catch (error) {
      setMutationError(
        error instanceof Error ? error.message : "Failed to save the writer draft.",
      );
    } finally {
      mutationLockRef.current = null;
      setIsSavePendingLocally(false);
    }
  }

  async function handleReload(): Promise<void> {
    if (mutationLockRef.current) {
      return;
    }

    mutationLockRef.current = "reload";
    setIsReloading(true);
    setMutationError(null);

    try {
      await presenter.refresh();
    } catch (error) {
      setMutationError(
        error instanceof Error ? error.message : "Failed to reload the writer draft.",
      );
    } finally {
      mutationLockRef.current = null;
      setIsReloading(false);
    }
  }

  const activeDocument = presenter.document;
  const publishStateLabel = activeDocument?.publishState ?? "draft";
  const contextDocumentId = activeDocument?.id ?? docId;
  const projectLabel = presenter.project?.project.name ?? projectId;
  const spaceId = presenter.project?.project.spaceId ?? "No governance space";
  const pageError = presenter.projectError ?? presenter.error;

  return (
    <main className="page-shell">
      <header className="page-header">
        <p className="page-kicker">Manuscript studio · versioned drafting · citation traceability</p>
        <h1 className="page-title">Writing</h1>
        <p className="page-description">
          Draft the shared document while keeping versions, citations, and
          publish state visible but quiet.
        </p>
        <p className="quiet-copy">
          Mature content path · AI 对话 → 私人笔记 → 共享评论 → Writer 文稿
        </p>
      </header>

      <section aria-label="context bar" className="context-bar">
        <span>Space context · {spaceId}</span>
        <span>Project context · {projectLabel} · {contextDocumentId}</span>
        <span className="status-badge">{publishStateLabel}</span>
        <span className="status-badge">
          {presenter.citations.length} citations
        </span>
        <span className="status-badge">governed citations</span>
      </section>

      {pageError ? (
        <section className="panel-grid" aria-label="writing errors">
          <article className="panel">
            <h2 className="panel-title">Writing runtime error</h2>
            <p className="quiet-copy">{pageError}</p>
          </article>
        </section>
      ) : null}

      <section className="panel-grid" aria-label="writing layout">
        <article className="panel">
          {presenter.isProjectLoading || presenter.isLoading || isDraftHydrating ? (
            <>
              <h2 className="panel-title">Loading writer draft…</h2>
              <p className="quiet-copy">Pulling the latest saved project document from the server-owned project-doc runtime.</p>
            </>
          ) : activeDocument && !pageError ? (
            <div className="stack-sm">
              <h2 className="panel-title">{activeDocument.title}</h2>
              <p className="quiet-copy">
                Project context · {projectLabel} · {contextDocumentId}
              </p>
              <p className="quiet-copy">
                Latest snapshot · {presenter.snapshot?.capturedAt ?? "Not saved yet"}
              </p>
              <label className="quiet-copy" htmlFor="draft-content">
                Draft content
              </label>
              <textarea
                id="draft-content"
                className="draft-editor"
                disabled={isMutating}
                rows={12}
                value={draftContent}
                onChange={(event) => {
                  draftContentRef.current = event.target.value;
                  setDraftContent(event.target.value);
                }}
              />
              <div className="button-row">
                <button
                  type="button"
                  className="action-button"
                  disabled={isMutating}
                  onClick={() => void handleSave()}
                >
                  {presenter.isSaving || isSavePendingLocally ? "Saving draft…" : "Save draft"}
                </button>
                <button
                  type="button"
                  className="action-button action-button-secondary"
                  disabled={isMutating}
                  onClick={() => void handleReload()}
                >
                  {isReloading ? "Reloading…" : "Reload draft"}
                </button>
              </div>
              {mutationError ? <p className="quiet-copy">{mutationError}</p> : null}
            </div>
          ) : (
            <>
              <h2 className="panel-title">Draft canvas</h2>
              <p className="quiet-copy">
                Project context · {projectLabel} · {docId}
              </p>
              <p className="quiet-copy">Promote an insight from Reader to start this document.</p>
              {mutationError ? <p className="quiet-copy">{mutationError}</p> : null}
            </>
          )}
        </article>
        <aside className="panel">
          <h2 className="panel-title">Versions and references</h2>
          <p className="quiet-copy">review path · published target · citation links</p>
          <p className="quiet-copy">将成熟内容整理进入 Writer</p>
          <p className="quiet-copy">Publish state path</p>
          <p className="quiet-copy">draft · review · published</p>
          <p className="quiet-copy">
            Latest content size · {draftContent.length} characters
          </p>
        </aside>
      </section>
    </main>
  );
}
