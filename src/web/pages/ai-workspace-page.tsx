import { useEffect, useState } from 'react';

import type { AiWorkspaceView } from '@shared/contracts/ai-workspace';

import { AiWorkspaceShell } from '../components/ai-workspace-shell';
import { createDemoApi } from '../lib/demo-api';

const demoApi = createDemoApi();

export function AiWorkspacePage() {
  const [workspace, setWorkspace] = useState<AiWorkspaceView | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);

  useEffect(() => {
    let isMounted = true;

    async function loadWorkspace(): Promise<void> {
      setIsLoading(true);
      setErrorMessage(null);

      try {
        const response = await demoApi.getAiWorkspace();

        if (isMounted) {
          setWorkspace(response.workspace);
        }
      } catch (error) {
        if (isMounted) {
          setWorkspace(null);
          setErrorMessage(
            error instanceof Error ? error.message : 'Failed to load the AI workspace.',
          );
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }

    void loadWorkspace();

    return () => {
      isMounted = false;
    };
  }, []);

  return (
    <main className="workbench-route workbench-route--ai">
      <header className="page-header">
        <h1 className="page-title">AI Workspace</h1>
      </header>

      {isLoading ? (
        <section className="ai-workspace-state stack-sm" aria-label="ai workspace overview">
          <p className="quiet-copy">
            Loading active sessions and their attached reading context.
          </p>
        </section>
      ) : errorMessage ? (
        <section className="ai-workspace-state stack-sm" aria-label="ai workspace overview">
          <p className="quiet-copy">{errorMessage}</p>
        </section>
      ) : workspace ? (
        <AiWorkspaceShell
          description="Keep governed conversations, reading follow-ups, and cross-paper synthesis in one independent workspace instead of burying them inside Reader or Notebook routes."
          headingLevel="h2"
          showHeading={false}
          variant="docked"
          workspace={workspace}
        />
      ) : null}
    </main>
  );
}
