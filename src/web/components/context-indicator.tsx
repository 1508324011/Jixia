interface ContextIndicatorProps {
  label: string;
  variant?: 'personal' | 'project';
}

export function ContextIndicator({ label, variant = 'personal' }: ContextIndicatorProps) {
  const eyebrow = variant === 'project' ? 'Project alignment' : 'Personal lane';
  const summary =
    variant === 'project'
      ? 'Project-owned docs stay shared while notebook evidence is promoted deliberately.'
      : 'Private intake stays lightweight until a paper, note, or doc is mature enough to promote.';
  const facts =
    variant === 'project'
      ? ['Shared context', 'Project-owned docs', 'Evidence-first cutover']
      : ['Personal context', 'Private notebook', 'Imported inventory only'];

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
      <div className="context-indicator__facts">
        {facts.map((fact) => (
          <span className="status-badge" key={fact}>
            {fact}
          </span>
        ))}
      </div>
    </section>
  );
}
