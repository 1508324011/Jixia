import { useState } from "react";
import { Link, useParams } from "react-router-dom";

import { useReaderPresenter } from "../presenters/reader-presenter";

export function ReaderPage() {
  const {
    projectId = "",
    entryId = "",
  } = useParams();
  const {
    asset,
    entry,
    error,
    insights,
    isLoading,
    isMutating,
    notes,
    project,
    refresh,
    saveGeneratedInsight,
    saveNote,
  } = useReaderPresenter(projectId, entryId);
  const spaceId = project?.project.spaceId ?? "No governance space";
  const projectLabel = project?.project.name ?? (projectId || "No project");
  const contextProjectId = project?.project.id ?? projectId;
  const [noteBody, setNoteBody] = useState(
    "This paper matters for the shared review.",
  );

  return (
    <main className="page-shell">
      <header className="page-header">
        <p className="page-kicker">
          Reading desk · notes · evidence-linked insight
        </p>
        <h1 className="page-title">Reader</h1>
        <p className="page-description">
          Read the paper asset while keeping notes, evidence spans, and
          generated insights in view.
        </p>
      </header>

      <section aria-label="context bar" className="context-bar">
        <span>Space context · {spaceId}</span>
        <span>Project context · {projectLabel}</span>
        <span>Entry · {entryId}</span>
        <span className="status-badge">quoted evidence</span>
        <span className="status-badge">governed AI</span>
        <button
          className="panel-link"
          type="button"
          onClick={() => void refresh()}
        >
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
            {asset?.title ??
              "No paper asset loaded from the server for this project entry."}
          </p>
          <p className="quiet-copy">
            Canonical id · {asset?.canonicalId ?? "No asset"}
          </p>
          <p className="quiet-copy">
            Visibility · {entry?.visibility ?? "No entry"}
          </p>
          <p className="quiet-copy">
            {asset?.abstractText ??
              "Use project library imports before opening reader detail."}
          </p>
          {isLoading ? (
            <p className="quiet-copy">
              Loading reader detail from the browser-facing runtime.
            </p>
          ) : null}
        </article>
        <aside className="panel">
          <h2 className="panel-title">Workbench</h2>
          <p className="quiet-copy">
            <span className="status-badge">space_shared note</span> · quoted
            evidence · governed AI summary
          </p>
          <p className="quiet-copy">
            Governed action source · queued → running → succeeded
          </p>
          <label className="quiet-copy" htmlFor="reader-note-input">
            Shared note draft
          </label>
          <textarea
            id="reader-note-input"
            value={noteBody}
            onChange={(event) => setNoteBody(event.target.value)}
          />
          <button
            className="panel-link"
            type="button"
            disabled={isMutating || noteBody.trim().length === 0}
            onClick={() => void saveNote(noteBody.trim(), "space_shared")}
          >
            {isMutating ? "Saving…" : "Save note"}
          </button>
          <button
            className="panel-link"
            type="button"
            disabled={isMutating}
            onClick={() => void saveGeneratedInsight()}
          >
            {isMutating ? "Generating…" : "Generate insight"}
          </button>
          <div className="shell-grid">
            {notes.map((note) => (
              <div key={note.id} className="hero-card">
                <h3 className="panel-title">Note · {note.visibility}</h3>
                <p className="quiet-copy">{note.body}</p>
              </div>
            ))}
            {insights.map((insight) => (
              <div key={insight.id} className="hero-card">
                <h3 className="panel-title">Insight</h3>
                <p className="quiet-copy">{insight.summary}</p>
                <p className="quiet-copy">
                  Evidence spans · {insight.evidenceSpans.length}
                </p>
              </div>
            ))}
          </div>
        </aside>
      </section>

      <Link
        className="panel-link"
        to={`/projects/${contextProjectId}/writing/doc-1`}
      >
        Open writing
      </Link>
    </main>
  );
}
