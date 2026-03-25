import { NavLink } from 'react-router-dom';

const workbenchLinks = [
  { label: 'Home', to: '/home' },
  { label: 'Projects', to: '/projects' },
  { label: 'Search', to: '/search' },
  { label: 'Library', to: '/library' },
  { label: 'Notebooks', to: '/notebooks' },
  { label: 'Settings', to: '/settings' },
] as const;

export function SidebarNav() {
  return (
    <nav aria-label="workbench navigation" className="sidebar-nav">
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
