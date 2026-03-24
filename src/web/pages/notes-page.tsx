import { useEffect, useMemo, useState } from 'react';
import { Link, useParams, useSearchParams } from 'react-router-dom';

import type { NoteVisibility, ReadingDetailView } from '@shared/contracts/reading';

import { NotebookQuestionList } from '../components/notebook-question-list';
import {
  createDemoApi,
  createReadingNote as createLegacyReadingNote,
  getReadingDetail as getLegacyReadingDetail,
} from '../lib/demo-api';

const demoApi = createDemoApi();
const DEFAULT_PROJECT_SPACE_ID = 'shared-space';

function buildProjectDocsPath(
  projectId: string,
  documentId: string,
  spaceId: string,
  preserveSpaceContext = false,
): string {
  const pathname = `/projects/${projectId}/writing/${documentId}`;

  if (!preserveSpaceContext && spaceId === DEFAULT_PROJECT_SPACE_ID) {
    return pathname;
  }

  return `${pathname}?spaceId=${encodeURIComponent(spaceId)}`;
}

function buildReaderPath(
  projectId: string,
  entryId: string,
  spaceId: string,
  preserveSpaceContext = false,
): string {
  const pathname = `/projects/${projectId}/library/${entryId}/reader`;

  if (!preserveSpaceContext && spaceId === DEFAULT_PROJECT_SPACE_ID) {
    return pathname;
  }

  return `${pathname}?spaceId=${encodeURIComponent(spaceId)}`;
}

export function NotesPage() {
  const [searchParams] = useSearchParams();
  const { spaceId: routeSpaceId, projectId = 'project-1', entryId = 'entry-1' } = useParams();
  const spaceId = routeSpaceId ?? searchParams.get('spaceId') ?? undefined;
  const hasExplicitSpaceContext = typeof spaceId === 'string' && spaceId.length > 0;
  const resolvedSpaceId = spaceId ?? DEFAULT_PROJECT_SPACE_ID;

  const [detail, setDetail] = useState<ReadingDetailView | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [mutationError, setMutationError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [isSaving, setIsSaving] = useState(false);
  const [privateNoteBody, setPrivateNoteBody] = useState('');

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
    () => detail?.notes.filter((note) => note.visibility === 'private') ?? [],
    [detail],
  );

  async function handleSavePrivateNote(): Promise<void> {
    if (!privateNoteBody.trim()) {
      return;
    }

    setIsSaving(true);
    setMutationError(null);

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
        current
          ? {
              ...current,
              notes: [...current.notes, response.note],
            }
          : current,
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

  const projectDocsPath = buildProjectDocsPath(projectId, 'doc-1', resolvedSpaceId, hasExplicitSpaceContext);
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
        <span>Project context · {projectId}</span>
        <span>Entry · {entryId}</span>
        <span>Space context · {resolvedSpaceId}</span>
        <span className="status-badge">{privateNotes.length} private notes</span>
      </section>

      <section className="panel-grid" aria-label="notes workspace layout">
        <NotebookQuestionList
          noteCount={privateNotes.length}
          paperTitle={detail?.asset.title ?? 'this paper'}
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
              <label className="quiet-copy" htmlFor="notes-workspace-private-note">
                Private note
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
            </div>
          ) : null}
        </article>
      </section>

      <div className="button-row">
        <Link className="panel-link" to={readerPath}>
          Back to reader
        </Link>
        <Link className="panel-link" to={projectDocsPath}>
          Open project docs
        </Link>
      </div>
    </main>
  );
}
