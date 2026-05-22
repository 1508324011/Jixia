import { useMemo, useState, type ReactNode } from "react";
import { Link, useLocation, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import { ChevronRight, PanelLeftClose, PanelLeftOpen } from "lucide-react";

import { CommandPalette } from "./command-palette";
import { useSessionAuth } from "../lib/session-auth";
import { ShellProjectContext } from "../lib/shell-project-context";
import {
  deriveWorkbenchRouteContext,
  isWorkbenchNavigationItemActive,
  resolveWorkbenchNavigationTarget,
  resolveWorkbenchSectionTitle,
  workbenchNavigationItems,
} from "../lib/workbench-navigation";
import { useProjectContext } from "../presenters/project-context";

const SIDEBAR_COLLAPSED_KEY = "jixia-sidebar-collapsed";

function readCollapsedPreference(): boolean {
  if (typeof window === "undefined") {
    return false;
  }

  return window.localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === "true";
}

function AuthenticatedAppShell({ children }: { children: ReactNode }) {
  const location = useLocation();
  const navigate = useNavigate();
  const { logout, user } = useSessionAuth();
  const [isCollapsed, setIsCollapsed] = useState(readCollapsedPreference);

  const context = useMemo(
    () => deriveWorkbenchRouteContext(location.pathname),
    [location.pathname],
  );
  const projectContext = useProjectContext(context.projectId, {
    selectDefaultProject: false,
  });
  const visibleProject = projectContext.project;
  const navigationContext = useMemo(
    () => ({
      ...context,
      projectId: visibleProject?.project.id,
      spaceId: visibleProject?.project.spaceId,
    }),
    [context, visibleProject],
  );
  const resolvedProjectLabel = (() => {
    if (projectContext.isLoading) {
      return "Loading project context";
    }

    if (!context.projectId) {
      if (projectContext.error) {
        return projectContext.error;
      }

      return projectContext.projects.length === 0 && !projectContext.isLoading
        ? "No visible projects"
        : "No project selected";
    }

    if (visibleProject) {
      return visibleProject.project.name;
    }

    return projectContext.error ?? `Project ${context.projectId} is not visible to the current actor.`;
  })();
  const resolvedSpaceLabel = (() => {
    if (projectContext.isLoading) {
      return "Loading governance context";
    }

    if (!context.projectId) {
      return "No governance space";
    }

    if (visibleProject) {
      return visibleProject.project.spaceId;
    }

    return "Project context unavailable";
  })();

  const shellLinks = useMemo(
    () =>
      workbenchNavigationItems.map((item) => ({
        ...item,
        to: resolveWorkbenchNavigationTarget(item, navigationContext),
      })),
    [navigationContext],
  );

  function toggleSidebar() {
    const next = !isCollapsed;
    setIsCollapsed(next);
    if (typeof window !== "undefined") {
      window.localStorage.setItem(SIDEBAR_COLLAPSED_KEY, String(next));
    }
  }

  function handleGoBack() {
    if (window.history.length > 1) {
      navigate(-1);
      return;
    }

    navigate("/projects");
  }

  async function handleLogout() {
    try {
      await logout();
    } finally {
      navigate("/login", { replace: true });
    }
  }

  return (
    <ShellProjectContext.Provider value={projectContext}>
      <div
        data-testid="app-shell"
        className="app-shell flex h-screen overflow-hidden bg-[var(--jixia-app-bg)] text-[var(--jixia-text)]"
      >
      <aside
        aria-label="jixia-app-sidebar"
        className={`flex shrink-0 flex-col border-r border-notion-border bg-notion-sidebar transition-[width] duration-150 ease-out ${
          isCollapsed ? "w-[72px]" : "w-60"
        }`}
      >
        <div
          className={`flex items-center border-b border-notion-border px-3 py-3 ${isCollapsed ? "justify-center" : "justify-between"}`}
        >
          {!isCollapsed && (
            <div className="flex min-w-0 items-center gap-2">
              <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-notion-accent-light text-sm font-semibold text-notion-accent shadow-sm">
                JX
              </div>
              <div className="min-w-0">
                <div className="truncate text-sm font-semibold text-notion-text">
                  Jixia
                </div>
                <div className="truncate text-xs text-notion-text-tertiary">
                  Server-first project workspace
                </div>
              </div>
            </div>
          )}
          <button
            type="button"
            onClick={toggleSidebar}
            className="flex h-8 w-8 items-center justify-center rounded-lg text-notion-text-tertiary transition-colors hover:bg-notion-sidebar-hover hover:text-notion-text"
            aria-label={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
            title={isCollapsed ? "Expand sidebar" : "Collapse sidebar"}
          >
            {isCollapsed ? (
              <PanelLeftOpen size={18} strokeWidth={1.8} />
            ) : (
              <PanelLeftClose size={18} strokeWidth={1.8} />
            )}
          </button>
        </div>

        <nav
          aria-label="jixia-primary-navigation"
          className="flex flex-1 flex-col gap-5 px-2 py-4"
        >
          <div className="flex flex-col gap-1">
            {shellLinks.map((item) => {
              const isActive = isWorkbenchNavigationItemActive(location.pathname, item.key);
              const Icon = item.icon;
              return (
                <Link
                  key={item.key}
                  aria-label={item.label}
                  to={item.to}
                  aria-current={isActive ? "page" : undefined}
                  title={isCollapsed ? item.label : undefined}
                  className={`group relative flex items-center rounded-lg text-sm no-underline transition-colors hover:bg-notion-sidebar-hover/70 ${
                    isCollapsed
                      ? "justify-center px-0 py-2.5"
                      : "gap-3 px-3 py-2.5"
                  }`}
                >
                  {isActive && (
                    <motion.div
                      layoutId="jixia-sidebar-indicator"
                      className="absolute inset-0 rounded-lg bg-notion-accent-light"
                      transition={{
                        type: "spring",
                        stiffness: 500,
                        damping: 30,
                      }}
                    />
                  )}
                  <Icon
                    size={isCollapsed ? 20 : 18}
                    strokeWidth={isActive ? 2.2 : 1.8}
                    className={`relative z-10 shrink-0 ${
                      isActive
                        ? "text-notion-text"
                        : "text-notion-text-tertiary group-hover:text-notion-text-secondary"
                    }`}
                  />
                  {!isCollapsed && (
                    <div className="relative z-10 min-w-0">
                      <div
                        className={`truncate ${
                          isActive
                            ? "font-medium text-notion-text"
                            : "text-notion-text-secondary group-hover:text-notion-text"
                        }`}
                      >
                        {item.label}
                      </div>
                      <div className="truncate text-xs text-notion-text-tertiary">
                        {item.subtitle}
                      </div>
                    </div>
                  )}
                </Link>
              );
            })}
          </div>

          {!isCollapsed && (
            <div className="rounded-xl border border-notion-border bg-white p-3 shadow-notion">
              <div className="mb-2 text-[11px] font-medium uppercase tracking-[0.16em] text-notion-text-tertiary">
                Current lane
              </div>
              <div className="space-y-1 text-sm text-notion-text-secondary">
                <div className="flex items-center gap-2">
                  <span className="inline-flex rounded-full bg-notion-accent-light px-2 py-0.5 text-[11px] font-medium text-notion-accent">
                    space
                  </span>
                  <span className="truncate">
                    {resolvedSpaceLabel}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="inline-flex rounded-full bg-notion-sidebar-hover px-2 py-0.5 text-[11px] font-medium text-notion-text-secondary">
                    project
                  </span>
                  <span className="truncate">
                    {resolvedProjectLabel}
                  </span>
                </div>
              </div>
            </div>
          )}

          <div className="mt-auto border-t border-notion-border/80 pt-3" aria-hidden="true" />
        </nav>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <header className="flex h-[56px] shrink-0 items-center justify-between border-b border-notion-border bg-white/90 px-5 backdrop-blur-sm">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-[0.16em] text-notion-text-tertiary">
              <span>Jixia</span>
              <ChevronRight size={12} />
              <span>{resolveWorkbenchSectionTitle(context.currentSection)}</span>
            </div>
            <div className="mt-1 truncate text-sm text-notion-text-secondary">
              {resolvedSpaceLabel} · {resolvedProjectLabel}
            </div>
          </div>

          <div className="flex items-center gap-2">
            <CommandPalette
              projectId={visibleProject?.project.id}
              onNavigate={(route) => navigate(route)}
            />
            {user ? (
              <span className="inline-flex items-center rounded-full bg-notion-sidebar-hover px-2.5 py-1 text-xs font-medium text-notion-text-secondary">
                {user.displayName}
              </span>
            ) : null}
            <button
              type="button"
              onClick={handleGoBack}
              className="inline-flex items-center rounded-lg border border-notion-border bg-white px-3 py-1.5 text-sm text-notion-text-secondary transition-colors hover:border-notion-accent/30 hover:text-notion-accent"
            >
              Back
            </button>
            <button
              type="button"
              onClick={() => void handleLogout()}
              className="inline-flex items-center rounded-lg border border-notion-border bg-white px-3 py-1.5 text-sm text-notion-text-secondary transition-colors hover:border-notion-accent/30 hover:text-notion-accent"
            >
              Logout
            </button>
            <span className="inline-flex items-center rounded-full bg-notion-accent-light px-2.5 py-1 text-xs font-medium text-notion-accent">
              server-first shell
            </span>
          </div>
        </header>

        <main className="min-h-0 flex-1 overflow-y-auto px-6 py-8">
          {children}
        </main>
        </div>
      </div>
    </ShellProjectContext.Provider>
  );
}

export function AppShell({ children }: { children: ReactNode }) {
  const location = useLocation();
  const { isAuthenticated, isLoading } = useSessionAuth();

  if (location.pathname === "/login" || isLoading || !isAuthenticated) {
    return <>{children}</>;
  }

  return <AuthenticatedAppShell>{children}</AuthenticatedAppShell>;
}
