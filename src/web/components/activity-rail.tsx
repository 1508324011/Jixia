import { NavLink } from 'react-router-dom';

const activityActions = [
  { label: 'Home mode', monogram: 'HM', to: '/home' },
  { label: 'Projects mode', monogram: 'PJ', to: '/projects' },
  { label: 'Search mode', monogram: 'SR', to: '/search' },
  { label: 'Library mode', monogram: 'LB', to: '/library' },
  { label: 'Notebooks mode', monogram: 'NB', to: '/notebooks' },
  { label: 'AI mode', monogram: 'AI', to: '/ai' },
  { label: 'Settings mode', monogram: 'ST', to: '/settings' },
] as const;

export function ActivityRail() {
  return (
    <nav
      aria-label="workbench activity rail"
      className="workbench-activity-rail"
      data-rail-variant="activity"
      data-testid="workbench-activity-rail"
    >
      <div className="workbench-activity-rail__header">
        <span className="workbench-activity-rail__brand">JX</span>
      </div>

      <div className="workbench-activity-rail__actions">
        {activityActions.map((action) => (
          <NavLink
            key={action.to}
            aria-label={action.label}
            className={({ isActive }) =>
              isActive
                ? 'workbench-activity-rail__action workbench-activity-rail__action--active'
                : 'workbench-activity-rail__action'
            }
            to={action.to}
          >
            <span aria-hidden="true">{action.monogram}</span>
          </NavLink>
        ))}
      </div>
    </nav>
  );
}
