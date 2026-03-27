import { useLocation } from 'react-router-dom';

interface ContextualSidebarItem {
  label: string;
  meta: string;
}

interface ContextualSidebarSection {
  eyebrow: string;
  title: string;
  items: ContextualSidebarItem[];
}

function getContextualSidebarSection(pathname: string): ContextualSidebarSection {
  if (pathname.includes('/reader')) {
    return {
      eyebrow: 'Reader mode',
      title: 'Reading tools',
      items: [
        { label: 'Document lane', meta: 'Full-text reading stays in the center canvas.' },
        { label: 'Note handoff', meta: 'Private and shared note surfaces stay beside the paper.' },
        { label: 'Docked reasoning', meta: 'AI context stays adjacent without taking over the route.' },
      ],
    };
  }

  if (pathname.includes('/notes')) {
    return {
      eyebrow: 'Notebook mode',
      title: 'Notebook handoff',
      items: [
        { label: 'Active note lane', meta: 'Continue annotation without leaving the current work surface.' },
        { label: 'Linked evidence', meta: 'Paper context stays connected to the notebook draft.' },
        { label: 'Shared exit path', meta: 'Jump back to project docs only when you need the shared draft.' },
      ],
    };
  }

  if (pathname === '/projects' || pathname.startsWith('/projects')) {
    return {
      eyebrow: 'Projects mode',
      title: 'Project workspaces',
      items: [
        { label: 'Active shared workspace', meta: 'Resume the current tumor-board collaboration lane.' },
        { label: 'Evidence shelf shortcut', meta: 'Keep shared project evidence one step away from the canvas.' },
        { label: 'Draft handoff', meta: 'Project docs stay close without duplicating the shell navigation.' },
      ],
    };
  }

  if (pathname.startsWith('/search')) {
    return {
      eyebrow: 'Search mode',
      title: 'Search scopes',
      items: [
        { label: 'Discovery queue', meta: 'Focus on intake boards and unresolved evidence first.' },
        { label: 'Imported evidence', meta: 'Compare fresh candidates against the current working shelf.' },
        { label: 'Query history', meta: 'Resume the last evidence question without leaving the shell.' },
      ],
    };
  }

  if (pathname.startsWith('/library')) {
    return {
      eyebrow: 'Library mode',
      title: 'Library slices',
      items: [
        { label: 'Personal evidence', meta: 'Keep private shelf work separate from shared project lanes.' },
        { label: 'Shared shelf', meta: 'Surface the active project shelf when collaboration is in play.' },
        { label: 'Reader exits', meta: 'Move into reading and notes only after you choose the evidence row.' },
      ],
    };
  }

  if (pathname.startsWith('/notebooks')) {
    return {
      eyebrow: 'Notebooks mode',
      title: 'Notebook stack',
      items: [
        { label: 'Private note lane', meta: 'Resume the current personal synthesis trail.' },
        { label: 'Shared handoff', meta: 'Project-facing notebook exits stay visible but secondary.' },
        { label: 'Evidence mirrors', meta: 'Keep linked papers connected without repeating global navigation.' },
      ],
    };
  }

  if (pathname.startsWith('/ai')) {
    return {
      eyebrow: 'AI mode',
      title: 'AI sessions',
      items: [
        { label: 'Active reasoning lane', meta: 'Keep the live synthesis thread close to the current evidence set.' },
        { label: 'Attached evidence', meta: 'Review supporting papers without bloating the main shell chrome.' },
        { label: 'Session history', meta: 'Return to recent reasoning threads from here instead of the rail.' },
      ],
    };
  }

  if (pathname.startsWith('/settings')) {
    return {
      eyebrow: 'Settings mode',
      title: 'Shell preferences',
      items: [
        { label: 'Provider readiness', meta: 'See whether the current AI provider is configured.' },
        { label: 'Import defaults', meta: 'Keep target defaults visible while adjusting settings.' },
        { label: 'Governance handoff', meta: 'Treat configuration as shell support, not a separate app.' },
      ],
    };
  }

  if (pathname.startsWith('/today')) {
    return {
      eyebrow: 'Today mode',
      title: 'Today queue',
      items: [
        { label: 'Intake board', meta: 'Focus on unresolved intake cards first.' },
        { label: 'Fresh imports', meta: 'See what moved into the workbench most recently.' },
        { label: 'Resume prompts', meta: 'Use the queue to restart the current evidence story quickly.' },
      ],
    };
  }

  return {
    eyebrow: 'Home mode',
    title: 'Recent work surfaces',
    items: [
      { label: 'Resume targets', meta: 'Surface the next best notebook or project continuation point.' },
      { label: 'Shared work pulse', meta: 'Keep active collaboration lanes close without repeating the mode rail.' },
      { label: 'Import handoff', meta: 'Track the latest evidence arrivals feeding the current workbench.' },
    ],
  };
}

export function ContextualSidebarContent() {
  const { pathname } = useLocation();
  const section = getContextualSidebarSection(pathname);

  return (
    <section
      aria-label={section.title}
      className="workbench-contextual-sidebar"
      data-testid="workbench-contextual-sidebar"
    >
      <div className="workbench-contextual-sidebar__header stack-xs">
        <span className="workbench-contextual-sidebar__eyebrow">{section.eyebrow}</span>
        <h2 className="workbench-contextual-sidebar__title">{section.title}</h2>
      </div>

      <div className="workbench-contextual-sidebar__list" role="list">
        {section.items.map((item) => (
          <article className="workbench-contextual-sidebar__item" key={item.label} role="listitem">
            <strong className="workbench-contextual-sidebar__item-label">{item.label}</strong>
            <p className="workbench-contextual-sidebar__item-meta">{item.meta}</p>
          </article>
        ))}
      </div>
    </section>
  );
}
