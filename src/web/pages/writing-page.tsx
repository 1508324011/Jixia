import { useEffect, useState } from 'react';
import { useParams } from 'react-router-dom';

import type { GovernedJobView } from '@shared/contracts/jobs';
import type { WritingDocumentResponse, WritingDocumentView } from '@shared/contracts/writing';

import {
  getGovernedSummary,
  getWritingDocument,
  publishWritingDocument,
  runGovernedSummary,
  saveWritingDocument,
} from '../lib/demo-api';

export function WritingPage() {
  const {
    spaceId = 'shared-space',
    projectId = 'tumor-board',
    docId = 'doc-1',
  } = useParams();

  const [data, setData] = useState<WritingDocumentResponse | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [document, setDocument] = useState<WritingDocumentView | null>(null);
  const [draftContent, setDraftContent] = useState('');
  const [mutationError, setMutationError] = useState<string | null>(null);
  const [isSaving, setIsSaving] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);
  const [isReloading, setIsReloading] = useState(false);
  const [governedJob, setGovernedJob] = useState<GovernedJobView | null>(null);
  const [governedJobError, setGovernedJobError] = useState<string | null>(null);
  const [isRunningGovernedJob, setIsRunningGovernedJob] = useState(false);

  useEffect(() => {
    let isCancelled = false;

    async function loadDocument(): Promise<void> {
      setIsLoading(true);
      setLoadError(null);

      try {
        const response = await getWritingDocument(spaceId, projectId);

        if (!isCancelled) {
          setData(response);
        }
      } catch (error) {
        if (!isCancelled) {
          setLoadError(
            error instanceof Error ? error.message : 'Failed to load the writing document.',
          );
          setData(null);
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

  useEffect(() => {
    let isCancelled = false;

    async function loadGovernedSummary(): Promise<void> {
      try {
        const response = await getGovernedSummary(spaceId);

        if (!isCancelled) {
          setGovernedJob(response.governedJob);
        }
      } catch (error) {
        if (!isCancelled) {
          setGovernedJob(null);
          setGovernedJobError(
            error instanceof Error
              ? error.message
              : 'Failed to load the governed summary state.',
          );
        }
      }
    }

    void loadGovernedSummary();

    return () => {
      isCancelled = true;
    };
  }, [spaceId]);

  useEffect(() => {
    if (!data) {
      return;
    }

    setDocument(data.document);
    setDraftContent(data.document.latestSnapshot?.content ?? '');
  }, [data]);

  async function handleSave(): Promise<void> {
    if (!document) {
      return;
    }

    setIsSaving(true);
    setMutationError(null);

    try {
      const response = await saveWritingDocument({
        content: draftContent,
        projectId,
        spaceId,
        title: document.title,
      });

      setData(response);
      setDocument(response.document);
      setDraftContent(response.document.latestSnapshot?.content ?? '');
    } catch (error) {
      setMutationError(
        error instanceof Error ? error.message : 'Failed to save the writing draft.',
      );
    } finally {
      setIsSaving(false);
    }
  }

  async function handlePublish(): Promise<void> {
    if (!document) {
      return;
    }

    setIsPublishing(true);
    setMutationError(null);

    try {
      const response = await publishWritingDocument(document.documentId);

      setData(response);
      setDocument(response.document);
      setDraftContent(response.document.latestSnapshot?.content ?? '');
    } catch (error) {
      setMutationError(
        error instanceof Error ? error.message : 'Failed to publish the document.',
      );
    } finally {
      setIsPublishing(false);
    }
  }

  async function handleReload(): Promise<void> {
    setIsReloading(true);
    setMutationError(null);

    try {
      const response = await getWritingDocument(spaceId, projectId);

      setData(response);
      setDocument(response.document);
      setDraftContent(response.document.latestSnapshot?.content ?? '');
      setLoadError(null);

      const governedSummary = await getGovernedSummary(spaceId);
      setGovernedJob(governedSummary.governedJob);
      setGovernedJobError(null);
    } catch (error) {
      setMutationError(
        error instanceof Error ? error.message : 'Failed to reload the writing document.',
      );
    } finally {
      setIsReloading(false);
    }
  }

  async function handleRunGovernedSummary(): Promise<void> {
    setIsRunningGovernedJob(true);
    setGovernedJobError(null);

    try {
      const response = await runGovernedSummary(spaceId);

      setGovernedJob(response.governedJob);
    } catch (error) {
      setGovernedJobError(
        error instanceof Error
          ? error.message
          : 'Failed to run the governed summary finale.',
      );
    } finally {
      setIsRunningGovernedJob(false);
    }
  }

  const activeDocument = document;
  const publishStateLabel = activeDocument?.publishState ?? 'draft';
  const citationCount = activeDocument?.latestSnapshot?.citations.length ?? 0;
  const capturedAt = activeDocument?.latestSnapshot?.capturedAt ?? 'No version saved yet';

  return (
    <main className="page-shell">
      <header className="page-header">
        <p className="page-kicker">Manuscript studio · versioned drafting · citation traceability</p>
        <h1 className="page-title">Writing</h1>
        <p className="page-description">
          Draft the shared document while keeping versions, citations, and
          publish state visible but quiet.
        </p>
      </header>

      <section aria-label="context bar" className="context-bar">
        <span>Space context · {spaceId}</span>
        <span>Project context · {projectId} · {activeDocument?.documentId ?? docId}</span>
        <span className="status-badge">{publishStateLabel}</span>
        <span className="status-badge">{citationCount} citations</span>
      </section>

      <section className="panel-grid" aria-label="writing layout">
        <article className="panel">
          {isLoading && !activeDocument ? (
            <>
              <h2 className="panel-title">Loading document…</h2>
              <p className="quiet-copy">
                Pulling the current shared draft and its latest snapshot.
              </p>
            </>
          ) : loadError && !activeDocument ? (
            <>
              <h2 className="panel-title">Writing unavailable</h2>
              <p className="quiet-copy">
                The shared document could not be loaded for this project.
              </p>
            </>
          ) : activeDocument ? (
            <div className="stack-sm">
              <h2 className="panel-title">{activeDocument.title}</h2>
              <p className="quiet-copy">Latest snapshot · {capturedAt}</p>
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
                  onClick={() => void handleSave()}
                  disabled={isSaving || isPublishing || isReloading}
                >
                  {isSaving ? 'Saving draft…' : 'Save draft'}
                </button>
                <button
                  type="button"
                  className="action-button"
                  onClick={() => void handleReload()}
                  disabled={isSaving || isPublishing || isReloading}
                >
                  {isReloading ? 'Reloading…' : 'Reload draft'}
                </button>
                <button
                  type="button"
                  className="action-button action-button-secondary"
                  onClick={() => void handlePublish()}
                  disabled={isSaving || isPublishing || isReloading}
                >
                  {isPublishing ? 'Publishing…' : 'Publish'}
                </button>
              </div>
              {mutationError ? <p className="quiet-copy">{mutationError}</p> : null}
            </div>
          ) : (
            <>
              <h2 className="panel-title">No writing record found</h2>
              <p className="quiet-copy">
                This project does not have a shared writing document yet.
              </p>
            </>
          )}
        </article>
        <aside className="panel">
          <h2 className="panel-title">Versions, references, and governed jobs</h2>
          <div className="stack-sm">
            <p className="quiet-copy">review path · published target · citation links</p>
            <p className="quiet-copy">Publish state path</p>
            <p className="quiet-copy">draft · review · published</p>
            <p className="quiet-copy">Citations linked · {citationCount}</p>
            <p className="quiet-copy">
              Current publish state · {publishStateLabel}
            </p>
            <button
              type="button"
              className="action-button action-button-secondary"
              onClick={() => void handleRunGovernedSummary()}
              disabled={isRunningGovernedJob}
            >
              {isRunningGovernedJob ? 'Running governed summary…' : 'Run governed summary'}
            </button>
            {governedJob ? (
              <div className="stack-sm">
                <p className="quiet-copy">Event timeline</p>
                {governedJob.events.map((event) => (
                  <div key={event.id} className="stack-xs">
                    <span className="status-badge">{event.status}</span>
                    <p className="quiet-copy">{event.message}</p>
                  </div>
                ))}
                <p className="quiet-copy">Audit trail</p>
                {governedJob.audits.map((audit) => (
                  <div key={audit.id} className="stack-xs">
                    <p className="quiet-copy">{audit.action}</p>
                    <p className="quiet-copy">{audit.detail}</p>
                  </div>
                ))}
              </div>
            ) : (
              <p className="quiet-copy">
                No governed summary run yet. The finale remains optional until you need an
                audit-visible AI summary.
              </p>
            )}
            {governedJobError ? <p className="quiet-copy">{governedJobError}</p> : null}
          </div>
        </aside>
      </section>
    </main>
  );
}
