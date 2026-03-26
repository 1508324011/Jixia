import { NavLink } from 'react-router-dom';

export const workbenchLinks = [
  { label: 'Home', to: '/home' },
  { label: 'Projects', to: '/projects' },
  { label: 'Search', to: '/search' },
  { label: 'Library', to: '/library' },
  { label: 'Notebooks', to: '/notebooks' },
  { label: 'AI', to: '/ai' },
  { label: 'Settings', to: '/settings' },
] as const;

interface SidebarNavProps {
  compact?: boolean;
}

export function SidebarNav({ compact = false }: SidebarNavProps) {
  const className = compact ? 'sidebar-nav sidebar-nav--compact' : 'sidebar-nav';

  return (
    <nav aria-label="workbench navigation" className={className}>
      <div className="sidebar-nav__brand">
        <span className="sidebar-nav__eyebrow">Jixia</span>
        <h1 className="sidebar-nav__title">研究工作台</h1>
      </div>

      <div className="sidebar-nav__links">
        {workbenchLinks.map((link) => (
          <NavLink
            key={link.to}
            className={({ isActive }) =>
              isActive ? 'sidebar-nav__link sidebar-nav__link--active' : 'sidebar-nav__link'
            }
            to={link.to}
          >
            {link.label}
          </NavLink>
        ))}
      </div>
    </nav>
  );
}
