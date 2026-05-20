import { useEffect, useRef, useState } from "react";
import { Link, useParams } from "react-router-dom";

import type { DocumentBlockDocument } from "@shared/contracts/document-content";

import { DocumentBlockEditor } from "../components/document-block-editor";
import { createLegacyTextProjection } from "../lib/document-blocks";
import { useProjectDocPresenter } from "../presenters/project-doc-presenter";

export function WritingPage() {
  const { projectId = "", docId = "" } = useParams();
  const presenter = useProjectDocPresenter(projectId, docId);
  const [draftDocumentContent, setDraftDocumentContent] = useState<DocumentBlockDocument>(
    presenter.documentContent,
  );
  const [draftVersionId, setDraftVersionId] = useState<string | null>(
    presenter.snapshot?.versionId ?? null,
  );
  const [mutationError, setMutationError] = useState<string | null>(null);
  const [isSavePendingLocally, setIsSavePendingLocally] = useState(false);
  const [isReloading, setIsReloading] = useState(false);
  const draftDocumentContentRef = useRef(draftDocumentContent);
  const mutationLockRef = useRef<"save" | "reload" | null>(null);
  const snapshotVersionId = presenter.snapshot?.versionId ?? null;
  const isMutating =
    presenter.isSaving ||
    isSavePendingLocally ||
    isReloading ||
    mutationLockRef.current !== null;
  const isDraftHydrating = snapshotVersionId !== draftVersionId;
  const draftProjection = createLegacyTextProjection(draftDocumentContent);
  const canEditProjectDoc = presenter.project?.membership.role === "owner" || presenter.project?.membership.role === "editor";

  useEffect(() => {
    setDraftDocumentContent(presenter.documentContent);
    draftDocumentContentRef.current = presenter.documentContent;
    setDraftVersionId(snapshotVersionId);
  }, [presenter.documentContent, snapshotVersionId]);

  if (!projectId || !docId) {
    return (
      <main className="page-shell">
        <header className="page-header">
          <p className="page-kicker">Project Docs · shared knowledge center · citation traceability</p>
          <h1 className="page-title">Project Doc editor</h1>
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
    if (!presenter.document || mutationLockRef.current || !canEditProjectDoc) {
      return;
    }

    mutationLockRef.current = "save";
    setIsSavePendingLocally(true);
    setMutationError(null);

    try {
      await presenter.save({
        citations: presenter.citations.map((citation) => ({
          evidenceSpan: citation.evidenceSpan,
          libraryEntryId: citation.libraryEntryId,
          paperAssetId: citation.paperAssetId,
          readerExcerptId: citation.readerExcerptId,
        })),
        documentContent: draftDocumentContentRef.current,
      });
    } catch (error) {
      setMutationError(
        error instanceof Error ? error.message : "Failed to save the Project Doc.",
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
        error instanceof Error ? error.message : "Failed to reload the Project Doc.",
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
  const resolvedSpaceId = presenter.project?.project.spaceId ?? "No governance space";
  const pageError = presenter.projectError ?? presenter.error;

  return (
    <main className="page-shell">
      <header className="page-header">
        <p className="page-kicker">Project Docs · shared knowledge center · citation traceability</p>
        <h1 className="page-title">Project Doc editor</h1>
        <p className="page-description">
          Maintain shared project background, evidence, rationale, conclusions, and formal drafts while keeping versions and citations server-owned.
        </p>
        <p className="quiet-copy">
          Reader evidence can inform this document only through explicit, project-scoped, citation-backed saves.
        </p>
      </header>

      <section aria-label="context bar" className="context-bar">
        <span>Space context · {resolvedSpaceId}</span>
        <span>Project context · {projectLabel} · {contextDocumentId}</span>
        <span className="status-badge">{publishStateLabel}</span>
        <span className="status-badge">{presenter.citations.length} citations</span>
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
              <h2 className="panel-title">Loading Project Doc…</h2>
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
              <DocumentBlockEditor
                disabled={isMutating || !canEditProjectDoc}
                label="Draft content"
                value={draftDocumentContent}
                onChange={(nextDocumentContent) => {
                  draftDocumentContentRef.current = nextDocumentContent;
                  setDraftDocumentContent(nextDocumentContent);
                }}
              />
              <div className="button-row">
                <button
                  type="button"
                  className="action-button"
                  disabled={isMutating || !canEditProjectDoc}
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
              {!canEditProjectDoc ? (
                <p className="quiet-copy">
                  Your project role can read this Project Doc, but only project owners and editors can save shared document versions.
                </p>
              ) : null}
              {mutationError ? <p className="quiet-copy">{mutationError}</p> : null}
            </div>
          ) : (
            <>
              <h2 className="panel-title">Draft canvas</h2>
              <p className="quiet-copy">
                Project context · {projectLabel} · {docId || "No document"}
              </p>
              <p className="quiet-copy">Promote an insight from Reader to start this document.</p>
              {mutationError ? <p className="quiet-copy">{mutationError}</p> : null}
            </>
          )}
        </article>
        <aside className="panel">
          <h2 className="panel-title">Versions and references</h2>
          <p className="quiet-copy">review path · published target · citation links</p>
          <p className="quiet-copy">将成熟内容整理进入 Project Docs</p>
          <p className="quiet-copy">Publish state path</p>
          <p className="quiet-copy">draft · review · published</p>
          <p className="quiet-copy">
            Latest content size · {draftProjection.length} characters
          </p>
        </aside>
      </section>
    </main>
  );
}
