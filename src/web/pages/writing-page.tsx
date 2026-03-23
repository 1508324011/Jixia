import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';

import type { WritingDocumentView } from '@shared/contracts/writing';

import { createDemoApi } from '../lib/demo-api';

const demoApi = createDemoApi();

export function WritingPage() {
  const {
    spaceId = 'personal-space-user-alice',
    projectId = 'project-1',
    docId = 'doc-1',
  } = useParams();
  const [document, setDocument] = useState<WritingDocumentView | null>(null);
  const [draftContent, setDraftContent] = useState('');
  const [loadError, setLoadError] = useState<string | null>(null);
  const [mutationError, setMutationError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isReloading, setIsReloading] = useState(false);

  useEffect(() => {
    let isCancelled = false;

    async function loadDocument(): Promise<void> {
      setIsLoading(true);
      setLoadError(null);

      try {
        const response = await demoApi.getWritingDocument(spaceId, projectId);

        if (!isCancelled) {
          setDocument(response.document);
          setDraftContent(response.document.latestSnapshot?.content ?? '');
        }
      } catch (error) {
        if (!isCancelled) {
          setDocument(null);
          setLoadError(
            error instanceof Error ? error.message : 'Failed to load the writer draft.',
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
  }, [projectId, spaceId]);

  async function handleSave(): Promise<void> {
    if (!document) {
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
        projectId,
        spaceId,
        title: document.title,
      });

      setDocument(response.document);
      setDraftContent(response.document.latestSnapshot?.content ?? '');
    } catch (error) {
      setMutationError(
        error instanceof Error ? error.message : 'Failed to save the writer draft.',
      );
    } finally {
      setIsSaving(false);
    }
  }

  async function handleReload(): Promise<void> {
    setIsReloading(true);
    setMutationError(null);

    try {
      const response = await demoApi.getWritingDocument(spaceId, projectId);
      setDocument(response.document);
      setDraftContent(response.document.latestSnapshot?.content ?? '');
      setLoadError(null);
    } catch (error) {
      setMutationError(
        error instanceof Error ? error.message : 'Failed to reload the writer draft.',
      );
    } finally {
      setIsReloading(false);
    }
  }

  const activeDocument = document;
  const publishStateLabel = activeDocument?.publishState ?? 'draft';

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
        <span>Project context · {projectId} · {activeDocument?.documentId ?? docId}</span>
        <span className="status-badge">{publishStateLabel}</span>
        <span className="status-badge">
          {activeDocument?.latestSnapshot?.citations.length ?? 0} citations
        </span>
      </section>

      <section className="panel-grid" aria-label="writing layout">
        <article className="panel">
          {isLoading ? (
            <>
              <h2 className="panel-title">Loading writer draft…</h2>
              <p className="quiet-copy">Pulling the latest saved project document.</p>
            </>
          ) : loadError ? (
            <>
              <h2 className="panel-title">Writer unavailable</h2>
              <p className="quiet-copy">{loadError}</p>
            </>
          ) : activeDocument ? (
            <div className="stack-sm">
              <h2 className="panel-title">{activeDocument.title}</h2>
              <p className="quiet-copy">
                Latest snapshot · {activeDocument.latestSnapshot?.capturedAt ?? 'Not saved yet'}
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
                  {isSaving ? 'Saving draft…' : 'Save draft'}
                </button>
                <button
                  type="button"
                  className="action-button action-button-secondary"
                  disabled={isSaving || isReloading}
                  onClick={() => void handleReload()}
                >
                  {isReloading ? 'Reloading…' : 'Reload draft'}
                </button>
              </div>
              {mutationError ? <p className="quiet-copy">{mutationError}</p> : null}
            </div>
          ) : (
            <>
              <h2 className="panel-title">No Writer draft found</h2>
              <p className="quiet-copy">Promote an insight from Reader to start this document.</p>
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
