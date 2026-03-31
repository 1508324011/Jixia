import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';

import type { NotebookSummaryView } from '@shared/contracts/notebook';

import { createDemoApi } from '../lib/demo-api';

const demoApi = createDemoApi();

function toNotebookActionLabel(notebook: NotebookSummaryView): string {
  return notebook.projectId ? 'Open project notebook document' : 'Open notebook document';
}

function toNotebookTitleActionLabel(notebook: NotebookSummaryView): string {
  return `Open ${notebook.title.toLowerCase()}`;
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
    <main className="workbench-route workbench-route--notebooks">
      <header className="page-header">
        <h1 className="page-title">Notebooks</h1>
      </header>

      <div className="panel-grid top-level-surface-grid">
        {isLoading ? (
          <div className="workbench-row">
            <p className="quiet-copy">Loading notebooks…</p>
          </div>
        ) : errorMessage ? (
          <div className="workbench-row">
            <p className="quiet-copy">{errorMessage}</p>
          </div>
        ) : notebooks.length > 0 ? (
          notebooks.map((notebook) => (
            <section key={notebook.notebookId} className="workbench-surface--section">
              <p className="workbench-eyebrow">{notebook.workspaceLabel}</p>
              <h2 className="panel-title">{notebook.title}</h2>
              <p className="quiet-copy">{notebook.paperTitle}</p>
              <p className="quiet-copy">
                {notebook.noteCount} private notes · Updated {notebook.updatedAt}
              </p>
              <div className="button-row">
                <Link className="panel-link" to={notebook.notesPath}>
                  {toNotebookActionLabel(notebook)}
                </Link>
                {!notebook.projectId ? (
                  <Link className="panel-link" to={notebook.notesPath}>
                    {toNotebookTitleActionLabel(notebook)}
                  </Link>
                ) : null}
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
          <div className="workbench-row">
            <p className="quiet-copy">
              Notebook routes become active as soon as imported evidence is ready for synthesis.
            </p>
          </div>
        )}
      </div>
    </main>
  );
}
