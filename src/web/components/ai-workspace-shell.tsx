import type { AiWorkspaceSessionView, AiWorkspaceView } from '@shared/contracts/ai-workspace';

import { AiContextAttachments } from './ai-context-attachments';

interface AiWorkspaceShellProps {
  description: string;
  headingLevel?: 'h1' | 'h2';
  showHeading?: boolean;
  variant?: 'default' | 'docked';
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
  variant = 'default',
  workspace,
}: AiWorkspaceShellProps) {
  const HeadingTag = headingLevel;
  const activeSession = resolveActiveSession(workspace);
  const headingClassName = headingLevel === 'h1' ? 'page-title' : 'panel-title';
  const descriptionClassName = headingLevel === 'h1' ? 'page-description' : 'quiet-copy';
  const rootClassName =
    variant === 'docked' ? 'ai-workspace-shell ai-workspace-shell--docked stack-sm' : 'ai-workspace-shell stack-sm';
  const sessionsClassName =
    variant === 'docked'
      ? 'ai-workspace-shell__sessions ai-workspace-shell__sessions--docked stack-sm'
      : 'ai-workspace-shell__sessions stack-sm';
  const sessionGridClassName =
    variant === 'docked' ? 'ai-workspace-shell__session-grid ai-workspace-shell__session-grid--docked' : 'panel-grid';
  const sessionCardClassName =
    variant === 'docked'
      ? 'ai-workspace-shell__session-card ai-workspace-shell__session-card--docked stack-sm'
      : 'panel stack-sm';
  const emptyStateClassName =
    variant === 'docked'
      ? 'ai-workspace-shell__empty-state ai-workspace-shell__empty-state--docked stack-xs'
      : 'panel stack-xs';

  return (
    <section className={rootClassName} aria-label="AI workspace shell">
      {showHeading ? (
        <div className="stack-xs">
          <HeadingTag className={headingClassName}>AI Workspace</HeadingTag>
          <p className={descriptionClassName}>{description}</p>
        </div>
      ) : null}

      <section className={sessionsClassName} aria-label="AI sessions">
        <div className="stack-xs">
          <h2 className="panel-title">AI sessions</h2>
          <p className="quiet-copy">
            Session state stays in the AI workspace even when Reader docks the active conversation.
          </p>
        </div>

        {workspace.sessions.length > 0 ? (
          <div className={sessionGridClassName}>
            {workspace.sessions.map((session) => (
              <article key={session.id} className={sessionCardClassName}>
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
          <section className={emptyStateClassName}>
            <h3 className="panel-title">No AI sessions yet</h3>
            <p className="quiet-copy">
              Start a governed conversation from AI Workspace when you need cross-paper synthesis.
            </p>
          </section>
        )}
      </section>

      <AiContextAttachments attachments={activeSession?.attachedEntries ?? []} variant={variant} />
    </section>
  );
}
