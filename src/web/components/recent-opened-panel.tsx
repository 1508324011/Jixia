import { getRecentOpenedItems } from '../lib/recent-opened-store';

export function RecentOpenedPanel() {
  const items = getRecentOpenedItems();

  return (
    <aside className="panel recent-opened-panel" aria-labelledby="recent-opened-title">
      <div className="recent-opened-panel__header">
        <h2 className="panel-title" id="recent-opened-title">
          最近打开
        </h2>
        <p className="quiet-copy">快速回到最近看的 paper、项目和文档。</p>
      </div>

      <ul className="recent-opened-panel__list">
        {items.length > 0 ? (
          items.map((item) => (
            <li key={item.id} className="recent-opened-panel__item">
              <span className="status-badge">{item.kind}</span>
              <strong>{item.title}</strong>
              <span className="quiet-copy">{item.context}</span>
            </li>
          ))
        ) : (
          <li className="recent-opened-panel__item">
            <span className="quiet-copy">
              No recent items yet. Open a project, paper, or Writer draft to populate this list.
            </span>
          </li>
        )}
      </ul>
    </aside>
  );
}
