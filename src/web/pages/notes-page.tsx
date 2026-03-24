import { useEffect, useMemo, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';

import type {
  NoteRecord,
  NoteVisibility,
  NotebookQuestionView,
  ReadingDetailView,
  ReadingWorkspaceView,
} from '@shared/contracts/reading';
import {
  defaultNotebookQuestionPrompts,
  metadataOnlyReadingRetrievalState,
} from '@shared/contracts/reading';

import { NotebookQuestionList } from '../components/notebook-question-list';
import {
  createProjectReference,
  createDemoApi,
  createReadingNote as createLegacyReadingNote,
  getReadingDetail as getLegacyReadingDetail,
} from '../lib/demo-api';

const demoApi = createDemoApi();
const DEFAULT_PROJECT_SPACE_ID = 'shared-space';
const DEFAULT_PROJECT_DOCUMENT_ID = 'doc-1';

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

function resolveNotesWorkspace(detail: ReadingDetailView): ReadingWorkspaceView {
  if (detail.workspace?.notebookId) {
    return detail.workspace;
  }

  const notebookId = `notebook-${detail.entry.id}`;

  return {
    notebookId,
    privateNotes: detail.notes.filter((note) => note.visibility === 'private'),
    questions: defaultNotebookQuestionPrompts.map((prompt, index) => ({
      id: `${notebookId}-question-${index + 1}`,
      prompt,
    })),
    sharedComments: detail.notes.filter((note) => note.visibility === 'space_shared'),
  };
}

function appendNoteToDetail(detail: ReadingDetailView, note: NoteRecord): ReadingDetailView {
  const workspace = resolveNotesWorkspace(detail);

  return {
    ...detail,
    notes: [...detail.notes, note],
    workspace: {
      ...workspace,
      privateNotes:
        note.visibility === 'private'
          ? [...workspace.privateNotes, note]
          : workspace.privateNotes,
      sharedComments:
        note.visibility === 'space_shared'
          ? [...workspace.sharedComments, note]
          : workspace.sharedComments,
    },
  };
}

export function NotesPage() {
  const [searchParams] = useSearchParams();
  const { spaceId: routeSpaceId, projectId, entryId = 'entry-1' } = useParams();
  const isPersonalMode = !projectId;
  const spaceId = routeSpaceId ?? searchParams.get('spaceId') ?? undefined;
  const hasExplicitSpaceContext = typeof spaceId === 'string' && spaceId.length > 0;
  const resolvedSpaceId = spaceId ?? DEFAULT_PROJECT_SPACE_ID;

  const [detail, setDetail] = useState<ReadingDetailView | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [mutationError, setMutationError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [isProjecting, setIsProjecting] = useState(false);
  const [privateNoteBody, setPrivateNoteBody] = useState('');
  const [activeQuestionId, setActiveQuestionId] = useState('');
  const [projectionMessage, setProjectionMessage] = useState<string | null>(null);

  useEffect(() => {
    let isCancelled = false;

    async function loadDetail(): Promise<void> {
      setIsLoading(true);
      setLoadError(null);

      try {
        const readingDetail = hasExplicitSpaceContext
          ? await getLegacyReadingDetail(entryId, resolvedSpaceId)
          : await demoApi.getReadingDetail(entryId);

        if (!isCancelled) {
          setDetail(readingDetail);
        }
      } catch (error) {
        if (!isCancelled) {
          setDetail(null);
          setLoadError(
            error instanceof Error ? error.message : 'Failed to load the private notebook lane.',
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
  }, [entryId, hasExplicitSpaceContext, resolvedSpaceId]);

  const privateNotes = useMemo(
    () => (detail ? resolveNotesWorkspace(detail).privateNotes : []),
    [detail],
  );
  const workspace = useMemo(() => (detail ? resolveNotesWorkspace(detail) : null), [detail]);
  const retrievalState = detail?.retrieval ?? metadataOnlyReadingRetrievalState;
  const activeQuestion = useMemo(() => {
    if (!workspace) {
      return null;
    }

    return (
      workspace.questions.find((question) => question.id === activeQuestionId) ??
      workspace.questions[0] ??
      null
    );
  }, [activeQuestionId, workspace]);
  const latestPrivateNote = workspace?.privateNotes.at(-1) ?? null;

  useEffect(() => {
    if (!workspace?.questions.length) {
      setActiveQuestionId('');
      return;
    }

    setActiveQuestionId((current) =>
      workspace.questions.some((question) => question.id === current)
        ? current
        : workspace.questions[0].id,
    );
  }, [workspace]);

  async function handleSavePrivateNote(): Promise<void> {
    if (!privateNoteBody.trim()) {
      return;
    }

    setIsSaving(true);
    setMutationError(null);
    setProjectionMessage(null);

    try {
      const response = hasExplicitSpaceContext
        ? await createLegacyReadingNote({
            body: privateNoteBody.trim(),
            entryId,
            spaceId: resolvedSpaceId,
            visibility: 'private' satisfies NoteVisibility,
          })
        : await demoApi.createReadingNote({
            body: privateNoteBody.trim(),
            entryId,
            visibility: 'private',
          });

      setDetail((current) =>
        current ? appendNoteToDetail(current, response.note) : current,
      );
      setPrivateNoteBody('');
    } catch (error) {
      setMutationError(
        error instanceof Error ? error.message : 'Failed to save the private notebook note.',
      );
    } finally {
      setIsSaving(false);
    }
  }

  async function handleInsertIntoProjectDocs(): Promise<void> {
    if (!projectId || !detail || !workspace || !latestPrivateNote) {
      return;
    }

    setIsProjecting(true);
    setMutationError(null);
    setProjectionMessage(null);

    try {
      await createProjectReference({
        docId: DEFAULT_PROJECT_DOCUMENT_ID,
        noteId: latestPrivateNote.id,
        notebookId: workspace.notebookId,
        paperAssetId: detail.asset.id,
        projectId,
        selectedText: latestPrivateNote.body,
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
  const readerPath = buildReaderPath(projectId, entryId, resolvedSpaceId, hasExplicitSpaceContext);

  return (
    <main className="page-shell">
      <header className="page-header">
        <p className="page-kicker">Private notebook · question-driven synthesis</p>
        <h1 className="page-title">Notes workspace</h1>
        <p className="page-description">
          Keep private thinking separate from deep reading and project docs while you decide what
          should graduate into shared references.
        </p>
      </header>

      <section aria-label="context bar" className="context-bar">
        <span>{isPersonalMode ? 'Personal context' : `Project context · ${projectId}`}</span>
        <span>Entry · {entryId}</span>
        {!isPersonalMode ? <span>Space context · {resolvedSpaceId}</span> : null}
        <span className="status-badge">{privateNotes.length} private notes</span>
      </section>

        <section className="panel-grid" aria-label="notes workspace layout">
        <NotebookQuestionList
          activeQuestionId={activeQuestion?.id ?? ''}
          noteCount={privateNotes.length}
          notebookId={workspace?.notebookId ?? `notebook-${entryId}`}
          onSelectQuestion={setActiveQuestionId}
          paperTitle={detail?.asset.title ?? 'this paper'}
          questions={workspace?.questions ?? []}
          retrievalSummary={retrievalState.summary}
        />

        <article className="panel">
          {isLoading ? (
            <>
              <h2 className="panel-title">Loading private notebook…</h2>
              <p className="quiet-copy">Gathering the current paper context and private notes.</p>
            </>
          ) : loadError ? (
            <>
              <h2 className="panel-title">Notes workspace unavailable</h2>
              <p className="quiet-copy">{loadError}</p>
            </>
          ) : detail ? (
            <div className="stack-sm">
              <h2 className="panel-title">{detail.asset.title}</h2>
              <p className="quiet-copy">Notebook stays private until you explicitly project material.</p>
              <p className="quiet-copy">Current reading boundary · {retrievalState.detail}</p>
              {activeQuestion ? (
                <div className="stack-xs notes-workspace__active-question">
                  <span className="status-badge">Active question</span>
                  <p className="quiet-copy">{activeQuestion.prompt}</p>
                </div>
              ) : null}
              <label className="quiet-copy" htmlFor="notes-workspace-private-note">
                {activeQuestion
                  ? `Private note for “${activeQuestion.prompt}”`
                  : 'Private note'}
              </label>
              <textarea
                id="notes-workspace-private-note"
                className="draft-editor"
                rows={6}
                value={privateNoteBody}
                onChange={(event) => setPrivateNoteBody(event.target.value)}
              />
              <button
                type="button"
                className="action-button"
                onClick={() => void handleSavePrivateNote()}
                disabled={isSaving}
              >
                {isSaving ? 'Saving private note…' : 'Save private note'}
              </button>
              {mutationError ? <p className="quiet-copy">{mutationError}</p> : null}

              <div className="stack-xs">
                <h3 className="panel-title">Private notebook notes</h3>
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

              {workspace && workspace.sharedComments.length > 0 ? (
                <div className="stack-xs">
                  <h3 className="panel-title">Reader-owned shared comments</h3>
                  {workspace.sharedComments.map((note) => (
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
                    Create a project-owned reference from a deliberate notebook insert. The notebook
                    stays private until you project material into Project Docs.
                  </p>
                  <button
                    type="button"
                    className="action-button action-button-secondary"
                    disabled={isProjecting || !latestPrivateNote}
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
        <Link className="panel-link" to={readerPath}>
          Back to reader
        </Link>
        {!isPersonalMode ? (
          <Link className="panel-link" to={projectDocsPath}>
            Open project docs
          </Link>
        ) : null}
      </div>
    </main>
  );
}
