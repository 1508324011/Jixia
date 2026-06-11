import { useEffect, useMemo, useRef, useState } from "react";
import type { CommandSearchResult } from "@shared/contracts/command-search";

import { apiClient } from "../lib/http-client";

interface CommandPaletteProps {
  onNavigate(route: string): void;
  projectId?: string;
}

const SEARCH_DEBOUNCE_MS = 180;

const KIND_LABELS: Record<CommandSearchResult["kind"], string> = {
  "ai-result": "AI Result",
  job: "Job",
  "library-entry": "Library",
  notebook: "Notebook",
  project: "Project",
  "project-doc": "Project Doc",
};

function resultScopeLabel(result: CommandSearchResult): string {
  if (result.scope.type === "project") {
    return result.scope.projectId ?? result.scope.id;
  }

  return "Personal";
}

export function CommandPalette({ onNavigate, projectId }: CommandPaletteProps) {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [results, setResults] = useState<CommandSearchResult[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const inputRef = useRef<HTMLInputElement | null>(null);

  const scopeLabel = useMemo(
    () => (projectId ? `Project ${projectId}` : "All visible objects"),
    [projectId],
  );

  useEffect(() => {
    function handleShortcut(event: KeyboardEvent) {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === "k") {
        event.preventDefault();
        setIsOpen(true);
      }

      if (event.key === "Escape") {
        setIsOpen(false);
        setResults([]);
      }
    }

    window.addEventListener("keydown", handleShortcut);
    return () => window.removeEventListener("keydown", handleShortcut);
  }, []);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    const timeout = window.setTimeout(() => {
      inputRef.current?.focus();
    }, 0);

    return () => window.clearTimeout(timeout);
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) {
      return;
    }

    let isCurrent = true;
    setIsLoading(true);
    setError(null);
    setResults([]);

    const timeout = window.setTimeout(() => {
      void apiClient
        .searchCommands({ projectId, query })
        .then((response) => {
          if (!isCurrent) {
            return;
          }

          setResults(response.results);
        })
        .catch((caughtError: unknown) => {
          if (!isCurrent) {
            return;
          }

          setResults([]);
          setError(
            caughtError instanceof Error
              ? caughtError.message
              : "Command search failed.",
          );
        })
        .finally(() => {
          if (isCurrent) {
            setIsLoading(false);
          }
        });
    }, SEARCH_DEBOUNCE_MS);

    return () => {
      isCurrent = false;
      window.clearTimeout(timeout);
    };
  }, [isOpen, projectId, query]);

  function openPalette() {
    setIsOpen(true);
  }

  function closePalette() {
    setIsOpen(false);
    setResults([]);
  }

  function handleSelect(result: CommandSearchResult) {
    closePalette();
    onNavigate(result.route);
  }

  return (
    <>
      <button
        type="button"
        className="inline-flex min-w-[220px] items-center justify-between gap-3 rounded-lg border border-notion-border bg-notion-sidebar-hover/70 px-3 py-1.5 text-left text-sm text-notion-text-secondary transition-colors hover:border-notion-accent/30 hover:text-notion-text"
        onClick={openPalette}
        aria-haspopup="dialog"
        aria-expanded={isOpen}
      >
        <span>Search workspace objects</span>
        <kbd className="rounded border border-notion-border bg-white px-1.5 py-0.5 text-[10px] font-semibold text-notion-text-tertiary">
          Ctrl/Cmd K
        </kbd>
      </button>

      {isOpen ? (
        <div
          className="command-palette__backdrop"
          role="presentation"
          onMouseDown={(event) => {
            if (event.target === event.currentTarget) {
              closePalette();
            }
          }}
        >
          <section
            aria-label="Command palette"
            aria-modal="true"
            className="command-palette"
            role="dialog"
          >
            <div className="command-palette__header">
              <div>
                <p className="command-palette__kicker">Server-owned object index</p>
                <h2 className="command-palette__title">Open Jixia objects</h2>
                <p className="command-palette__scope">{scopeLabel}</p>
              </div>
              <button
                type="button"
                className="command-palette__close"
                onClick={closePalette}
              >
                Close
              </button>
            </div>

            <label className="sr-only" htmlFor="command-palette-search">
              Search server-visible Jixia objects
            </label>
            <input
              ref={inputRef}
              id="command-palette-search"
              className="command-palette__input"
              placeholder="Search projects, docs, library entries, notebooks, jobs, AI results…"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
            />

            <div className="command-palette__status" aria-live="polite">
              {isLoading ? "Searching server-visible objects…" : null}
              {!isLoading && error ? error : null}
              {!isLoading && !error ? `${results.length} result${results.length === 1 ? "" : "s"}` : null}
            </div>

            <div className="command-palette__results" role="listbox">
              {results.length === 0 && !isLoading ? (
                <div className="command-palette__empty">
                  No visible objects matched this query.
                </div>
              ) : null}

              {results.map((result) => (
                <button
                  key={result.id}
                  type="button"
                  className="command-palette__result"
                  onClick={() => handleSelect(result)}
                  role="option"
                >
                  <span className="command-palette__result-kind">
                    {KIND_LABELS[result.kind]}
                  </span>
                  <span className="command-palette__result-main">
                    <span className="command-palette__result-title">
                      {result.title}
                    </span>
                    <span className="command-palette__result-subtitle">
                      {result.subtitle ?? result.route}
                    </span>
                  </span>
                  <span className="command-palette__result-scope">
                    {resultScopeLabel(result)}
                  </span>
                </button>
              ))}
            </div>
          </section>
        </div>
      ) : null}
    </>
  );
}
