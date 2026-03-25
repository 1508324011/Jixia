import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

import type { NotebookSummaryView } from '@shared/contracts/notebook';

import { createDemoApi } from '../lib/demo-api';

const demoApi = createDemoApi();

function toNotebookActionLabel(title: string): string {
  return `Open ${title.toLowerCase()}`;
}

export function NotebooksPage() {
  const [notebooks, setNotebooks] = useState<NotebookSummaryView[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    async function loadNotebooks(): Promise<void> {
      setIsLoading(true);
      setErrorMessage(null);

      try {
        const response = await demoApi.getNotebooks();

        if (isMounted) {
          setNotebooks(response.notebooks);
        }
      } catch (error) {
        if (isMounted) {
          setNotebooks([]);
          setErrorMessage(
            error instanceof Error ? error.message : 'Failed to load notebook inventory.',
          );
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }

    void loadNotebooks();

    return () => {
      isMounted = false;
    };
  }, []);

  return (
    <main className="page-shell">
      <header className="page-header">
        <p className="page-kicker">Notebook workbench</p>
        <h1 className="page-title">Notebooks</h1>
        <p className="page-description">
          Re-open question-driven synthesis work directly, then jump back into related library entries or project surfaces when needed.
        </p>
      </header>

      <div className="panel-grid top-level-surface-grid">
        {isLoading ? (
          <section className="panel">
            <h2 className="panel-title">Loading notebooks…</h2>
            <p className="quiet-copy">Collecting notebook contexts across personal and project work.</p>
          </section>
        ) : errorMessage ? (
          <section className="panel">
            <h2 className="panel-title">Notebook inventory unavailable</h2>
            <p className="quiet-copy">{errorMessage}</p>
          </section>
        ) : notebooks.length > 0 ? (
          notebooks.map((notebook) => (
            <section key={notebook.notebookId} className="panel stack-sm">
              <div className="stack-xs">
                <p className="page-kicker">{notebook.workspaceLabel}</p>
                <h2 className="panel-title">{notebook.title}</h2>
                <p className="quiet-copy">{notebook.paperTitle}</p>
                <p className="quiet-copy">
                  {notebook.noteCount} private notes · Updated {notebook.updatedAt}
                </p>
              </div>
              <div className="button-row">
                <Link className="panel-link" to={notebook.notesPath}>
                  {toNotebookActionLabel(notebook.title)}
                </Link>
                <Link className="panel-link" to={notebook.readerPath}>
                  {notebook.projectId ? 'Open related reader' : 'Open notebook reader'}
                </Link>
                <Link className="panel-link" to={notebook.workspacePath}>
                  Open workspace
                </Link>
                {notebook.projectDocsPath ? (
                  <Link className="panel-link" to={notebook.projectDocsPath}>
                    Open project docs
                  </Link>
                ) : null}
              </div>
            </section>
          ))
        ) : (
          <section className="panel">
            <h2 className="panel-title">No notebooks yet</h2>
            <p className="quiet-copy">
              Notebook routes become active as soon as imported evidence is ready for synthesis.
            </p>
          </section>
        )}
      </div>
    </main>
  );
}
