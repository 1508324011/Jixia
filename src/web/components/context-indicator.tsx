import { Link } from 'react-router-dom';

interface ContextIndicatorAction {
  label: string;
  to: string;
}

interface ContextIndicatorProps {
  actions: ContextIndicatorAction[];
  label: string;
  variant?: 'personal' | 'project';
}

export function ContextIndicator({ actions, label, variant = 'personal' }: ContextIndicatorProps) {
  const eyebrow = variant === 'project' ? 'Project alignment' : 'Workbench context';
  const summary =
    variant === 'project'
      ? 'Project-owned docs stay shared while notebook evidence is promoted deliberately.'
      : 'Keep the right rail focused on current context and recent work instead of duplicating the primary navigation.';

  return (
    <section
      aria-label="current context"
      className={`context-indicator context-indicator--${variant}`}
    >
      <div className="context-indicator__header stack-xs">
        <span className="context-indicator__eyebrow">{eyebrow}</span>
        <span className="context-indicator__label">{label}</span>
      </div>
      <p className="quiet-copy">{summary}</p>
      {actions.length > 0 ? (
        <div className="context-indicator__facts">
          {actions.map((action) => (
            <Link className="status-badge context-indicator__action" key={action.label} to={action.to}>
              {action.label}
            </Link>
          ))}
        </div>
      ) : null}
    </section>
  );
}
