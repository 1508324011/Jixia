export type LibraryInventoryView = 'all' | 'private' | 'shared';

interface LibraryFiltersProps {
  activeView: LibraryInventoryView;
  onQueryChange: (value: string) => void;
  onViewChange: (view: LibraryInventoryView) => void;
  query: string;
}

const viewLabels: Record<LibraryInventoryView, string> = {
  all: 'All records',
  private: 'Private notes',
  shared: 'Shared evidence',
};

export function LibraryFilters({
  activeView,
  onQueryChange,
  onViewChange,
  query,
}: LibraryFiltersProps) {
  return (
    <section className="library-filters" aria-label="inventory filters">
      <div className="stack-xs">
        <div className="intake-source-board__eyebrow">Shelf lens</div>
        <h3 className="panel-title">Inventory view</h3>
        <p className="quiet-copy">Switch between a broad shelf view and the visibility slice you want to work through next.</p>
      </div>

      <div className="library-filters__controls">
        <div className="library-filters__buttons" role="toolbar" aria-label="inventory view">
          {(Object.keys(viewLabels) as LibraryInventoryView[]).map((view) => (
            <button
              aria-pressed={activeView === view}
              className={`library-filters__button${activeView === view ? ' library-filters__button--active' : ''}`}
              key={view}
              onClick={() => onViewChange(view)}
              type="button"
            >
              {viewLabels[view]}
            </button>
          ))}
        </div>

        <label className="field-label library-filters__search" htmlFor="library-filter-query">
          <span>Filter notes</span>
          <input
            className="text-input"
            id="library-filter-query"
            name="libraryFilterQuery"
            onChange={(event) => onQueryChange(event.target.value)}
            placeholder="Search title or canonical id"
            type="search"
            value={query}
          />
        </label>
      </div>
    </section>
  );
}
