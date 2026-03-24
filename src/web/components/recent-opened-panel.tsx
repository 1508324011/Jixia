import { getRecentOpenedItems } from '../lib/recent-opened-store';

export function RecentOpenedPanel() {
  const items = getRecentOpenedItems();

  return (
    <aside className="panel recent-opened-panel" aria-labelledby="recent-opened-title">
      <div className="recent-opened-panel__header">
        <span className="intake-source-board__eyebrow">Context rail</span>
        <h2 className="panel-title" id="recent-opened-title">
          最近打开
        </h2>
        <p className="quiet-copy">把最近碰过的 paper、project、document 收回到同一条证据轨道里。</p>
      </div>

      <ul className="recent-opened-panel__list">
        {items.map((item) => (
          <li key={item.id} className="recent-opened-panel__item">
            <div className="recent-opened-panel__meta">
              <span className="status-badge">{item.kind}</span>
              <strong>{item.title}</strong>
            </div>
            <span className="quiet-copy">{item.context}</span>
          </li>
        ))}
      </ul>
    </aside>
  );
}
