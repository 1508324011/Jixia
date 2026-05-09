import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";

import type { WritingDocumentView } from "@shared/contracts/writing";

import { createDemoApi } from "../lib/demo-api";
import { useProjectContext } from "../presenters/project-context";

const demoApi = createDemoApi();

export function WritingPage() {
  const { projectId = "", docId = "", spaceId: routeSpaceId } = useParams();
  const { error: projectError, isLoading: projectIsLoading, project } = useProjectContext(projectId);
  const [document, setDocument] = useState<WritingDocumentView | null>(null);
  const [draftContent, setDraftContent] = useState("");
  const [loadError, setLoadError] = useState<string | null>(null);
  const [mutationError, setMutationError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isReloading, setIsReloading] = useState(false);

  useEffect(() => {
    if (!projectId) {
      setDocument(null);
      setDraftContent("");
      setLoadError("No project route was provided for Writer.");
      setIsLoading(false);
      return;
    }

    if (projectIsLoading) {
      setIsLoading(true);
      return;
    }

    if (projectError || !project) {
      setDocument(null);
      setDraftContent("");
      setLoadError(projectError ?? `Project ${projectId} is not visible to the current actor.`);
      setIsLoading(false);
      return;
    }

    const resolvedProject = project;
    const resolvedProjectId = resolvedProject.project.id;
    const resolvedProjectSpaceId = resolvedProject.project.spaceId;

    let isCancelled = false;

    async function loadDocument(): Promise<void> {
      setIsLoading(true);
      setLoadError(null);

      try {
        const response = await demoApi.getWritingDocument(resolvedProjectSpaceId, resolvedProjectId);

        if (!isCancelled) {
          setDocument(response.document);
          setDraftContent(response.document.latestSnapshot?.content ?? "");
        }
      } catch (error) {
        if (!isCancelled) {
          setDocument(null);
          setDraftContent("");
          setLoadError(
            error instanceof Error ? error.message : "Failed to load the writer draft.",
          );
        }
      } finally {
        if (!isCancelled) {
          setIsLoading(false);
        }
      }
    }

    void loadDocument();

    return () => {
      isCancelled = true;
    };
  }, [project, projectError, projectId, projectIsLoading]);

  async function handleSave(): Promise<void> {
    if (!document || !project) {
      return;
    }

    setIsSaving(true);
    setMutationError(null);

    try {
      const response = await demoApi.saveWritingDocument({
        citations:
          document.latestSnapshot?.citations.map((citation) => ({
            evidenceSpan: citation.evidenceSpan,
            paperAssetId: citation.paperAssetId,
          })) ?? [],
        content: draftContent,
        projectId: project.project.id,
        spaceId: project.project.spaceId,
        title: document.title,
      });

      setDocument(response.document);
      setDraftContent(response.document.latestSnapshot?.content ?? "");
      setLoadError(null);
    } catch (error) {
      setMutationError(
        error instanceof Error ? error.message : "Failed to save the writer draft.",
      );
    } finally {
      setIsSaving(false);
    }
  }

  async function handleReload(): Promise<void> {
    if (!project) {
      return;
    }

    setIsReloading(true);
    setMutationError(null);

    try {
      const response = await demoApi.getWritingDocument(project.project.spaceId, project.project.id);
      setDocument(response.document);
      setDraftContent(response.document.latestSnapshot?.content ?? "");
      setLoadError(null);
    } catch (error) {
      setMutationError(
        error instanceof Error ? error.message : "Failed to reload the writer draft.",
      );
    } finally {
      setIsReloading(false);
    }
  }

  const activeDocument = document;
  const resolvedSpaceId = activeDocument?.spaceId ?? routeSpaceId ?? project?.project.spaceId ?? "No governance space";
  const projectLabel = project?.project.name ?? (projectId ? projectId : "No project");
  const publishStateLabel = activeDocument?.publishState ?? "draft";
  const contextDocumentId = activeDocument?.documentId ?? docId;

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
        <span>Space context · {resolvedSpaceId}</span>
        <span>Project context · {projectLabel} · {contextDocumentId}</span>
        <span className="status-badge">{publishStateLabel}</span>
        <span className="status-badge">
          {activeDocument?.latestSnapshot?.citations.length ?? 0} citations
        </span>
        <span className="status-badge">governed citations</span>
      </section>

      {loadError ? (
        <section className="panel-grid" aria-label="writing errors">
          <article className="panel">
            <h2 className="panel-title">Writing runtime error</h2>
            <p className="quiet-copy">{loadError}</p>
          </article>
        </section>
      ) : null}

      <section className="panel-grid" aria-label="writing layout">
        <article className="panel">
          {isLoading ? (
            <>
              <h2 className="panel-title">Loading writer draft…</h2>
              <p className="quiet-copy">Pulling the latest saved project document.</p>
            </>
          ) : activeDocument ? (
            <div className="stack-sm">
              <h2 className="panel-title">{activeDocument.title}</h2>
              <p className="quiet-copy">
                Project context · {activeDocument.projectId} · {contextDocumentId}
              </p>
              <p className="quiet-copy">
                Latest snapshot · {activeDocument.latestSnapshot?.capturedAt ?? "Not saved yet"}
              </p>
              <label className="quiet-copy" htmlFor="draft-content">
                Draft content
              </label>
              <textarea
                id="draft-content"
                className="draft-editor"
                rows={12}
                value={draftContent}
                onChange={(event) => setDraftContent(event.target.value)}
              />
              <div className="button-row">
                <button
                  type="button"
                  className="action-button"
                  disabled={isSaving || isReloading}
                  onClick={() => void handleSave()}
                >
                  {isSaving ? "Saving draft…" : "Save draft"}
                </button>
                <button
                  type="button"
                  className="action-button action-button-secondary"
                  disabled={isSaving || isReloading}
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
