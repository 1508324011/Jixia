import { NavLink } from 'react-router-dom';

import { workbenchNavigationItems } from '../lib/workbench-navigation';

export function SidebarNav() {
  return (
    <nav aria-label="workbench navigation" className="sidebar-nav">
      <div className="sidebar-nav__brand">
        <span className="sidebar-nav__eyebrow">Jixia</span>
        <h1 className="sidebar-nav__title">研究工作台</h1>
      </div>

      <div className="sidebar-nav__links">
        {workbenchNavigationItems.map((link) => (
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
