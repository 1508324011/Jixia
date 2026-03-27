import { ContextualSidebarContent } from './contextual-sidebar-content';

export function WorkbenchSidebar() {
  return (
    <section className="workbench-sidebar" data-testid="workbench-compact-sidebar">
      <ContextualSidebarContent />
    </section>
  );
}
