import { useEffect, useMemo, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';

import type {
  NotebookDocumentView,
  NotebookSummaryView,
} from '@shared/contracts/notebook';
import type {
  NoteRecord,
  NoteVisibility,
  ReadingDetailView,
} from '@shared/contracts/reading';
import { metadataOnlyReadingRetrievalState } from '@shared/contracts/reading';

import { DocumentEditor } from '../components/document-editor';
import {
  createProjectReference,
  createDemoApi,
  createReadingNote as createLegacyReadingNote,
  getReadingDetail as getLegacyReadingDetail,
} from '../lib/demo-api';

const demoApi = createDemoApi();
const DEFAULT_PROJECT_SPACE_ID = 'shared-space';
const DEFAULT_PROJECT_DOCUMENT_ID = 'doc-1';

function extractDocumentId(projectDocsPath?: string): string {
  if (!projectDocsPath) {
    return DEFAULT_PROJECT_DOCUMENT_ID;
  }

  const pathname = projectDocsPath.split('?')[0] ?? projectDocsPath;
  const segments = pathname.split('/').filter(Boolean);

  return segments.at(-1) ?? DEFAULT_PROJECT_DOCUMENT_ID;
}

function buildProjectDocsPath(
  projectId: string | undefined,
  documentId: string,
  spaceId: string,
  preserveSpaceContext = false,
): string {
  if (!projectId) {
    return '';
  }

  const pathname = `/projects/${projectId}/writing/${documentId}`;

  if (!preserveSpaceContext && spaceId === DEFAULT_PROJECT_SPACE_ID) {
    return pathname;
  }

  return `${pathname}?spaceId=${encodeURIComponent(spaceId)}`;
}

function buildProjectPath(
  projectId: string | undefined,
  spaceId: string,
  preserveSpaceContext = false,
): string {
  if (!projectId) {
    return '';
  }

  const pathname = `/projects/${projectId}`;

  if (!preserveSpaceContext && spaceId === DEFAULT_PROJECT_SPACE_ID) {
    return pathname;
  }

  return `${pathname}?spaceId=${encodeURIComponent(spaceId)}`;
}

function buildReaderPath(
  projectId: string | undefined,
  entryId: string,
  spaceId: string,
  preserveSpaceContext = false,
): string {
  if (!projectId) {
    return `/library/${entryId}/reader`;
  }

  const pathname = `/projects/${projectId}/library/${entryId}/reader`;

  if (!preserveSpaceContext && spaceId === DEFAULT_PROJECT_SPACE_ID) {
    return pathname;
  }

  return `${pathname}?spaceId=${encodeURIComponent(spaceId)}`;
}

function appendNoteToDetail(detail: ReadingDetailView, note: NoteRecord): ReadingDetailView {
  return {
    ...detail,
    notes: [...detail.notes, note],
    workspace: {
      ...detail.workspace,
      sharedComments:
        note.visibility === 'space_shared'
          ? [...detail.workspace.sharedComments, note]
          : detail.workspace.sharedComments,
    },
  };
}

export function NotesPage() {
  const [searchParams] = useSearchParams();
  const {
    spaceId: routeSpaceId,
    projectId: routeProjectId,
    entryId: routeEntryId,
    notebookId: routeNotebookId,
  } = useParams();
  const isNotebookRoute = typeof routeNotebookId === 'string' && routeNotebookId.length > 0;
  const routeSpaceContext = routeSpaceId ?? searchParams.get('spaceId') ?? undefined;
  const hasExplicitSpaceContext =
    typeof routeSpaceContext === 'string' && routeSpaceContext.length > 0;

  const [detail, setDetail] = useState<ReadingDetailView | null>(null);
  const [notebookSummary, setNotebookSummary] = useState<NotebookSummaryView | null>(null);
  const [notebookDocument, setNotebookDocument] = useState<NotebookDocumentView | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [mutationError, setMutationError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isProjecting, setIsProjecting] = useState(false);
  const [isSaving, setIsSaving] = useState(false);
  const [documentContent, setDocumentContent] = useState('');
  const [projectionMessage, setProjectionMessage] = useState<string | null>(null);

  const entryId = routeEntryId ?? notebookSummary?.entryId ?? 'entry-1';
  const projectId = routeProjectId ?? notebookSummary?.projectId;
  const isPersonalMode = !projectId;
  const defaultSpaceId = routeProjectId
    ? DEFAULT_PROJECT_SPACE_ID
    : notebookSummary?.spaceId ?? DEFAULT_PROJECT_SPACE_ID;
  const resolvedSpaceId = routeSpaceContext ?? defaultSpaceId;
  const privateNotes = useMemo(
    () => detail?.notes.filter((note) => note.visibility === 'private') ?? [],
    [detail],
  );
  const latestPrivateNote = privateNotes.at(-1) ?? null;
  const retrievalState = detail?.retrieval ?? metadataOnlyReadingRetrievalState;

  useEffect(() => {
    let isCancelled = false;

    async function loadNotebookSurface(): Promise<void> {
      setIsLoading(true);
      setLoadError(null);

      try {
        if (isNotebookRoute && routeNotebookId) {
          const summaryResponse = await demoApi.getNotebook(routeNotebookId);
          const resolvedNotebook = summaryResponse.notebook;
          const requiresExplicitNotebookSpace =
            Boolean(resolvedNotebook.projectId) &&
            resolvedNotebook.spaceId !== DEFAULT_PROJECT_SPACE_ID;
          const [readingDetail, documentResponse] = await Promise.all([
            requiresExplicitNotebookSpace
              ? getLegacyReadingDetail(resolvedNotebook.entryId, resolvedNotebook.spaceId)
              : demoApi.getReadingDetail(resolvedNotebook.entryId),
            demoApi.getNotebookDocument(resolvedNotebook.notebookId),
          ]);

          if (!isCancelled) {
            setDetail(readingDetail);
            setNotebookSummary(resolvedNotebook);
            setNotebookDocument(documentResponse.document);
            setDocumentContent(documentResponse.document.latestSnapshot?.content ?? '');
          }

          return;
        }

        const fallbackEntryId = routeEntryId ?? 'entry-1';
        const readingDetail = hasExplicitSpaceContext
          ? await getLegacyReadingDetail(
              fallbackEntryId,
              routeSpaceContext ?? DEFAULT_PROJECT_SPACE_ID,
            )
          : await demoApi.getReadingDetail(fallbackEntryId);
        const summaryResponse = await demoApi.getNotebook(readingDetail.workspace.notebookId);
        const documentResponse = await demoApi.getNotebookDocument(
          summaryResponse.notebook.notebookId,
        );

        if (!isCancelled) {
          setDetail(readingDetail);
          setNotebookSummary(summaryResponse.notebook);
          setNotebookDocument(documentResponse.document);
          setDocumentContent(documentResponse.document.latestSnapshot?.content ?? '');
        }
      } catch (error) {
        if (!isCancelled) {
          setDetail(null);
          setNotebookSummary(null);
          setNotebookDocument(null);
          setDocumentContent('');
          setLoadError(
            error instanceof Error ? error.message : 'Failed to load the private notebook document.',
          );
        }
      } finally {
        if (!isCancelled) {
          setIsLoading(false);
        }
      }
    }

    void loadNotebookSurface();

    return () => {
      isCancelled = true;
    };
  }, [hasExplicitSpaceContext, isNotebookRoute, routeEntryId, routeNotebookId, routeSpaceContext]);

  async function handleSaveNotebook(): Promise<void> {
    if (!notebookSummary) {
      return;
    }

    setIsSaving(true);
    setMutationError(null);
    setProjectionMessage(null);

    try {
      const response = await demoApi.saveNotebookDocument({
        content: documentContent,
        notebookId: notebookSummary.notebookId,
        title: notebookSummary.title,
      });

      setNotebookDocument(response.document);
      setNotebookSummary((current) =>
        current
          ? {
              ...current,
              title: response.document.title,
              updatedAt: response.document.latestSnapshot?.capturedAt ?? current.updatedAt,
            }
          : current,
      );
      setDocumentContent(response.document.latestSnapshot?.content ?? '');
    } catch (error) {
      setMutationError(
        error instanceof Error ? error.message : 'Failed to save the notebook document.',
      );
    } finally {
      setIsSaving(false);
    }
  }

  async function handleInsertIntoProjectDocs(): Promise<void> {
    const resolvedProjectId = projectId;

    if (!resolvedProjectId || !detail || !notebookSummary || !documentContent.trim()) {
      return;
    }

    const requiresExplicitApiSpaceContext = isNotebookRoute
      ? Boolean(notebookSummary.projectId) && notebookSummary.spaceId !== DEFAULT_PROJECT_SPACE_ID
      : hasExplicitSpaceContext;

    setIsProjecting(true);
    setMutationError(null);
    setProjectionMessage(null);

    try {
      const selectedText = documentContent.trim();
      let projectionSource = latestPrivateNote;

      if (!projectionSource || projectionSource.body !== selectedText) {
        const noteResponse = requiresExplicitApiSpaceContext
          ? await createLegacyReadingNote({
              body: selectedText,
              entryId,
              spaceId: resolvedSpaceId,
              visibility: 'private' satisfies NoteVisibility,
            })
          : await demoApi.createReadingNote({
              body: selectedText,
              entryId,
              visibility: 'private',
            });

        projectionSource = noteResponse.note;
        setDetail((current) => (current ? appendNoteToDetail(current, noteResponse.note) : current));
      }

      await createProjectReference({
        docId: extractDocumentId(notebookSummary.projectDocsPath),
        noteId: projectionSource.id,
        notebookId: notebookSummary.notebookId,
        paperAssetId: detail.asset.id,
        projectId: resolvedProjectId,
        selectedText,
        spaceId: resolvedSpaceId,
      });
      setProjectionMessage('Project-owned reference created.');
    } catch (error) {
      setMutationError(
        error instanceof Error ? error.message : 'Failed to create the project-owned reference.',
      );
    } finally {
      setIsProjecting(false);
    }
  }

  const projectDocsPath = buildProjectDocsPath(
    projectId,
    DEFAULT_PROJECT_DOCUMENT_ID,
    resolvedSpaceId,
    hasExplicitSpaceContext,
  );
  const projectPath = isNotebookRoute
    ? notebookSummary?.workspacePath ??
      buildProjectPath(projectId, resolvedSpaceId, hasExplicitSpaceContext)
    : detail?.workspace.companion?.projectPath ??
      buildProjectPath(projectId, resolvedSpaceId, hasExplicitSpaceContext);
  const resolvedProjectDocsPath = isNotebookRoute
    ? notebookSummary?.projectDocsPath ?? projectDocsPath
    : detail?.workspace.companion?.projectDocsPath ?? projectDocsPath;
  const readerPath = isNotebookRoute
    ? notebookSummary?.readerPath ??
      buildReaderPath(projectId, entryId, resolvedSpaceId, hasExplicitSpaceContext)
    : detail?.workspace.companion?.readerPath ??
      buildReaderPath(projectId, entryId, resolvedSpaceId, hasExplicitSpaceContext);
  const notebookTitle = notebookSummary?.title ?? detail?.asset.title ?? 'Notebook';
  const latestSnapshotLabel = notebookDocument?.latestSnapshot
    ? `Latest snapshot · ${notebookDocument.latestSnapshot.capturedAt}`
    : 'No notebook snapshot saved yet.';

  return (
    <main className="page-shell">
      <header className="page-header">
        <p className="page-kicker">Private notebook document</p>
        <h1 className="page-title">Notebook</h1>
        <p className="page-description">
          Keep the private notebook document separate from Reader and project docs until you decide
          what should become a project-owned reference.
        </p>
      </header>

      <section aria-label="context bar" className="context-bar">
        <span>{isPersonalMode ? 'Personal context' : `Project context · ${projectId}`}</span>
        <span>Entry · {entryId}</span>
        {!isPersonalMode ? <span>Space context · {resolvedSpaceId}</span> : null}
        <span className="status-badge">{privateNotes.length} private notes</span>
      </section>

      <section className="panel-grid" aria-label="notes workspace layout">
        <article className="panel">
          {isLoading ? (
            <>
              <h2 className="panel-title">Loading notebook…</h2>
              <p className="quiet-copy">Gathering the notebook document and current paper context.</p>
            </>
          ) : loadError ? (
            <>
              <h2 className="panel-title">Notebook unavailable</h2>
              <p className="quiet-copy">{loadError}</p>
            </>
          ) : detail && notebookSummary && notebookDocument ? (
            <div className="stack-sm">
              <DocumentEditor
                textareaId="notebook-document"
                label="Private notebook document"
                title={notebookTitle}
                lastSavedLabel={latestSnapshotLabel}
                description={`Notebook stays private until you deliberately create a project-owned reference. Current reading boundary · ${retrievalState.detail}`}
                rows={10}
                value={documentContent}
                onChange={setDocumentContent}
                actions={
                  <button
                    type="button"
                    className="action-button"
                    onClick={() => void handleSaveNotebook()}
                    disabled={isSaving}
                  >
                    {isSaving ? 'Saving notebook…' : 'Save notebook'}
                  </button>
                }
              />
              {mutationError ? <p className="quiet-copy">{mutationError}</p> : null}

              {detail.workspace.sharedComments.length > 0 ? (
                <div className="stack-xs">
                  <h3 className="panel-title">Reader-owned shared comments</h3>
                  {detail.workspace.sharedComments.map((note) => (
                    <p key={note.id} className="quiet-copy">
                      {note.body}
                    </p>
                  ))}
                </div>
              ) : null}

              {!isPersonalMode ? (
                <div className="stack-xs">
                  <h3 className="panel-title">Project projection</h3>
                  <p className="quiet-copy">
                    Promote a deliberate excerpt into Project Docs without leaking the notebook body
                    into notebook metadata routes.
                  </p>
                  <button
                    type="button"
                    className="action-button action-button-secondary"
                    disabled={isProjecting || !documentContent.trim()}
                    onClick={() => void handleInsertIntoProjectDocs()}
                  >
                    {isProjecting ? 'Creating project-owned reference…' : 'Insert into project docs'}
                  </button>
                  {projectionMessage ? <p className="quiet-copy">{projectionMessage}</p> : null}
                </div>
              ) : null}
            </div>
          ) : null}
        </article>
      </section>

      <div className="button-row">
        {isNotebookRoute ? (
          <Link className="panel-link" to="/notebooks">
            Back to notebooks
          </Link>
        ) : null}
        {!isPersonalMode && projectPath ? (
          <Link className="panel-link" to={projectPath}>
            Back to project
          </Link>
        ) : null}
        <Link className="panel-link" to={readerPath}>
          Back to reader
        </Link>
        {!isPersonalMode && resolvedProjectDocsPath ? (
          <Link className="panel-link" to={resolvedProjectDocsPath}>
            Open project docs
          </Link>
        ) : null}
      </div>
    </main>
  );
}
