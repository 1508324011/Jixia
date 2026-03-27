import { NavLink, useLocation } from 'react-router-dom';

import { getOpenWorkbenchViews } from '../lib/workbench-view-state';

export function WorkbenchOpenViewStrip() {
  const location = useLocation();
  const views = getOpenWorkbenchViews(location.pathname);

  return (
    <nav
      aria-label="open workbench views"
      className="workbench-open-view-strip"
      data-strip-variant="open-views"
      data-testid="workbench-open-view-strip"
    >
      <div className="workbench-open-view-strip__items">
        {views.map((view) => (
          <NavLink
            key={`${view.to}:${view.label}`}
            aria-current={view.current ? 'page' : undefined}
            className={({ isActive }) =>
              isActive || view.current
                ? 'workbench-open-view-strip__item workbench-open-view-strip__item--active'
                : 'workbench-open-view-strip__item'
            }
            to={view.to}
          >
            <span className="workbench-open-view-strip__item-label">Open · {view.label}</span>
          </NavLink>
        ))}
      </div>
    </nav>
  );
}
