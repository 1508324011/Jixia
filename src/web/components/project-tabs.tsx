interface ProjectTabsProps {
  tabs: string[];
}

export function ProjectTabs({ tabs }: ProjectTabsProps) {
  return (
    <div aria-label="project workspace sections" className="project-tabs" role="tablist">
      {tabs.map((tab, index) => (
        <button
          key={tab}
          aria-selected={index === 0}
          className={index === 0 ? 'project-tabs__tab project-tabs__tab--active' : 'project-tabs__tab'}
          role="tab"
          type="button"
        >
          {tab}
        </button>
      ))}
    </div>
  );
}
