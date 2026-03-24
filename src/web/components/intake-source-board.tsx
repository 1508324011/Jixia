import type { TodayRecommendation } from '@shared/contracts/discovery';

interface IntakeSourceBoardProps {
  actionLabel?: string;
  emptyCopy?: string;
  importingId?: string | null;
  items: TodayRecommendation[];
  onImport?: (item: TodayRecommendation) => void;
  subtitle?: string;
  title: string;
}

export function IntakeSourceBoard({
  actionLabel = '导入到个人 Library',
  emptyCopy = 'No intake candidates are available right now.',
  importingId = null,
  items,
  onImport,
  subtitle,
  title,
}: IntakeSourceBoardProps) {
  return (
    <section className="intake-source-board panel" aria-label={title}>
      <div className="intake-source-board__header stack-xs">
        <div className="intake-source-board__eyebrow">Intake lane</div>
        <h2 className="panel-title">{title}</h2>
        {subtitle ? <p className="quiet-copy">{subtitle}</p> : null}
      </div>

      {items.length === 0 ? <p className="quiet-copy">{emptyCopy}</p> : null}

      <div className="stack-sm">
        {items.map((item) => (
          <article className="intake-card" key={item.id}>
            <div className="intake-card__meta">
              <span className="status-badge">{item.sourceType}</span>
              <span className="status-badge">{item.state}</span>
            </div>
            <div className="stack-xs">
              <h3 className="panel-title">{item.title}</h3>
              <p className="quiet-copy">{item.reason}</p>
              <p className="quiet-copy">
                {item.sourceLabel} · {item.canonicalId}
              </p>
            </div>
            <div className="button-row">
              <button
                className="action-button"
                disabled={item.imported || importingId === item.id || !onImport}
                onClick={() => onImport?.(item)}
                type="button"
              >
                {item.imported
                  ? '已进入个人 Library'
                  : importingId === item.id
                    ? 'Importing…'
                    : actionLabel}
              </button>
            </div>
          </article>
        ))}
      </div>
    </section>
  );
}
