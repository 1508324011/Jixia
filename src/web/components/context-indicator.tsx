interface ContextIndicatorProps {
  label: string;
  variant?: 'personal' | 'project';
}

export function ContextIndicator({ label, variant = 'personal' }: ContextIndicatorProps) {
  return (
    <section
      aria-label="current context"
      className={`context-indicator context-indicator--${variant}`}
    >
      <span className="context-indicator__label">{label}</span>
    </section>
  );
}
