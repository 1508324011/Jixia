import { SidebarNav } from './sidebar-nav';

export function WorkbenchSidebar() {
  return (
    <section className="workbench-sidebar" data-testid="workbench-compact-sidebar">
      <div className="workbench-sidebar__header stack-xs">
        <span className="workbench-sidebar__eyebrow">IDE Classic Lite</span>
        <p className="workbench-sidebar__summary">
          Keep primary navigation compact while the center canvas carries the active reading and writing flow.
        </p>
      </div>

      <SidebarNav compact />
    </section>
  );
}
