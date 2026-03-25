import type { AiWorkspaceSessionView, AiWorkspaceView } from '@shared/contracts/ai-workspace';

import { AiContextAttachments } from './ai-context-attachments';

interface AiWorkspaceShellProps {
  description: string;
  headingLevel?: 'h1' | 'h2';
  showHeading?: boolean;
  workspace: AiWorkspaceView;
}

function resolveActiveSession(workspace: AiWorkspaceView): AiWorkspaceSessionView | null {
  if (workspace.sessions.length === 0) {
    return null;
  }

  return (
    workspace.sessions.find((session) => session.id === workspace.activeSessionId) ?? workspace.sessions[0]
  );
}

export function AiWorkspaceShell({
  description,
  headingLevel = 'h2',
  showHeading = true,
  workspace,
}: AiWorkspaceShellProps) {
  const HeadingTag = headingLevel;
  const activeSession = resolveActiveSession(workspace);
  const headingClassName = headingLevel === 'h1' ? 'page-title' : 'panel-title';
  const descriptionClassName = headingLevel === 'h1' ? 'page-description' : 'quiet-copy';

  return (
    <section className="stack-sm" aria-label="AI workspace shell">
      {showHeading ? (
        <div className="stack-xs">
          <HeadingTag className={headingClassName}>AI Workspace</HeadingTag>
          <p className={descriptionClassName}>{description}</p>
        </div>
      ) : null}

      <section className="stack-sm" aria-label="AI sessions">
        <div className="stack-xs">
          <h2 className="panel-title">AI sessions</h2>
          <p className="quiet-copy">
            Session state stays in the AI workspace even when Reader docks the active conversation.
          </p>
        </div>

        {workspace.sessions.length > 0 ? (
          <div className="panel-grid">
            {workspace.sessions.map((session) => (
              <article key={session.id} className="panel stack-sm">
                <div className="stack-xs">
                  <span className="status-badge">
                    {session.id === activeSession?.id ? 'Active session' : 'Session'}
                  </span>
                  <h3 className="panel-title">{session.title}</h3>
                  <p className="quiet-copy">{session.summary}</p>
                </div>
                <p className="quiet-copy">
                  Updated {session.updatedAt} · {session.attachedEntries.length} attached papers
                </p>
              </article>
            ))}
          </div>
        ) : (
          <section className="panel stack-xs">
            <h3 className="panel-title">No AI sessions yet</h3>
            <p className="quiet-copy">
              Start a governed conversation from AI Workspace when you need cross-paper synthesis.
            </p>
          </section>
        )}
      </section>

      <AiContextAttachments attachments={activeSession?.attachedEntries ?? []} />
    </section>
  );
}
