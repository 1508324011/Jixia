import { useEffect, useState } from 'react';
import { useParams, useSearchParams } from 'react-router-dom';

import type { GovernedJobView } from '@shared/contracts/jobs';
import type { WritingDocumentView } from '@shared/contracts/writing';

import { ProjectDocumentTree } from '../components/project-document-tree';
import { RequestError } from '../lib/http-client';
import {
  getGovernedSummary,
  getWritingDocument,
  publishWritingDocument,
  runGovernedSummary,
  saveWritingDocument,
} from '../lib/demo-api';

export function WritingPage() {
  const [searchParams] = useSearchParams();
  const {
    spaceId: routeSpaceId,
    projectId = 'project-1',
    docId = 'doc-1',
  } = useParams();
  const spaceId = routeSpaceId ?? searchParams.get('spaceId') ?? 'shared-space';
  const [document, setDocument] = useState<WritingDocumentView | null>(null);
  const [draftContent, setDraftContent] = useState('');
  const [loadError, setLoadError] = useState<string | null>(null);
  const [mutationError, setMutationError] = useState<string | null>(null);
  const [governedJobError, setGovernedJobError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isPublishing, setIsPublishing] = useState(false);
  const [isReloading, setIsReloading] = useState(false);
  const [isRunningGovernedJob, setIsRunningGovernedJob] = useState(false);
  const [governedJob, setGovernedJob] = useState<GovernedJobView | null>(null);

  function isMissingProjectDocument(error: unknown): boolean {
    return error instanceof RequestError && error.status === 404;
  }

  useEffect(() => {
    let isCancelled = false;

    async function loadDocument(): Promise<void> {
      setIsLoading(true);
      setLoadError(null);

      try {
        const response = await getWritingDocument(spaceId, projectId);

        if (!isCancelled) {
          setDocument(response.document);
          setDraftContent(response.document.latestSnapshot?.content ?? '');
        }
      } catch (error) {
        if (!isCancelled) {
          setDocument(null);

          if (isMissingProjectDocument(error)) {
            setDraftContent('');
            setLoadError(null);
          } else {
            setLoadError(
              error instanceof Error ? error.message : 'Failed to load the writer draft.',
            );
          }
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
          setGovernedJobError(null);
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

  async function handleSave(): Promise<void> {
    if (!document) {
      return;
    }

    setIsSaving(true);
    setMutationError(null);

    try {
      const response = await saveWritingDocument({
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

  async function handlePublish(): Promise<void> {
    if (!document) {
      return;
    }

    setIsPublishing(true);
    setMutationError(null);

    try {
      const response = await publishWritingDocument(spaceId, document.documentId);
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
      const [documentResponse, governedSummaryResponse] = await Promise.all([
        getWritingDocument(spaceId, projectId),
        getGovernedSummary(spaceId),
      ]);

      setDocument(documentResponse.document);
      setDraftContent(documentResponse.document.latestSnapshot?.content ?? '');
      setGovernedJob(governedSummaryResponse.governedJob);
      setGovernedJobError(null);
      setLoadError(null);
    } catch (error) {
      setMutationError(
        error instanceof Error ? error.message : 'Failed to reload the writer draft.',
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
        <p className="page-kicker">Project docs · versioned drafting · citation traceability</p>
        <h1 className="page-title">Project docs</h1>
        <p className="page-description">
          Work inside the shared project-owned document surface while references, publish state, and
          governed jobs stay visible but quiet.
        </p>
        <p className="quiet-copy">Reader and Notes Workspace stay separate from the shared document tree.</p>
      </header>

      <section aria-label="context bar" className="context-bar">
        <span>Space context · {spaceId}</span>
        <span>Project context · {projectId} · {activeDocument?.documentId ?? docId}</span>
        <span className="status-badge">{publishStateLabel}</span>
        <span className="status-badge">{citationCount} citations</span>
      </section>

      <section className="panel-grid" aria-label="writing layout">
        <article className="panel">
          {isLoading ? (
            <>
              <h2 className="panel-title">Loading project docs…</h2>
              <p className="quiet-copy">Pulling the latest saved project document.</p>
            </>
          ) : loadError ? (
            <>
              <h2 className="panel-title">Project docs unavailable</h2>
              <p className="quiet-copy">{loadError}</p>
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
                  disabled={isSaving || isPublishing || isReloading}
                  onClick={() => void handleSave()}
                >
                  {isSaving ? 'Saving draft…' : 'Save draft'}
                </button>
                <button
                  type="button"
                  className="action-button action-button-secondary"
                  disabled={isSaving || isPublishing || isReloading}
                  onClick={() => void handleReload()}
                >
                  {isReloading ? 'Reloading…' : 'Reload draft'}
                </button>
                <button
                  type="button"
                  className="action-button action-button-secondary"
                  disabled={isSaving || isPublishing || isReloading}
                  onClick={() => void handlePublish()}
                >
                  {isPublishing ? 'Publishing…' : 'Publish'}
                </button>
              </div>
              {mutationError ? <p className="quiet-copy">{mutationError}</p> : null}
            </div>
          ) : (
            <>
              <h2 className="panel-title">No project doc found</h2>
              <p className="quiet-copy">Create the shared project document when the team is ready.</p>
            </>
          )}
        </article>
        <aside className="panel">
          <h2 className="panel-title">References, publish state, and governed jobs</h2>
          <div className="stack-sm">
            <ProjectDocumentTree document={activeDocument} projectId={projectId} />
            <p className="quiet-copy">review path · published target · citation links</p>
            <p className="quiet-copy">Project-owned references move here after deliberate review.</p>
            <p className="quiet-copy">Publish state path</p>
            <p className="quiet-copy">draft · review · published</p>
            <p className="quiet-copy">Citations linked · {citationCount}</p>
            <p className="quiet-copy">Current publish state · {publishStateLabel}</p>
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
