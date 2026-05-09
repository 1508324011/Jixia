import { useMemo, useState, type ReactNode } from "react";
import { Link, matchPath, useLocation, useNavigate } from "react-router-dom";
import { motion } from "framer-motion";
import {
  Bot,
  BookOpen,
  ChevronRight,
  FileText,
  FolderKanban,
  PanelLeftClose,
  PanelLeftOpen,
  Search,
  Settings,
} from "lucide-react";

import { useSessionAuth } from "../lib/session-auth";
import { useProjectContext } from "../presenters/project-context";

const SIDEBAR_COLLAPSED_KEY = "jixia-sidebar-collapsed";

interface WorkflowContext {
  currentSection:
    | "spaces"
    | "projects"
    | "search"
    | "library"
    | "reader"
    | "writing"
    | "jobs"
    | "settings";
  docId?: string;
  entryId?: string;
  projectId?: string;
  spaceId?: string;
}

interface ShellLink {
  key: WorkflowContext["currentSection"];
  label: string;
  subtitle?: string;
  to: string;
  icon: React.ComponentType<{
    className?: string;
    size?: number;
    strokeWidth?: number;
  }>;
}

function readCollapsedPreference(): boolean {
  if (typeof window === "undefined") {
    return false;
  }

  return window.localStorage.getItem(SIDEBAR_COLLAPSED_KEY) === "true";
}

function deriveWorkflowContext(pathname: string): WorkflowContext {
  const projectReaderMatch = matchPath(
    "/projects/:projectId/library/:entryId/reader",
    pathname,
  );
  if (projectReaderMatch?.params.projectId && projectReaderMatch.params.entryId) {
    return {
      currentSection: "reader",
      entryId: projectReaderMatch.params.entryId,
      projectId: projectReaderMatch.params.projectId,
    };
  }

  const projectWritingMatch = matchPath(
    "/projects/:projectId/writing/:docId",
    pathname,
  );
  if (projectWritingMatch?.params.projectId && projectWritingMatch.params.docId) {
    return {
      currentSection: "writing",
      docId: projectWritingMatch.params.docId,
      projectId: projectWritingMatch.params.projectId,
    };
  }

  const projectLibraryMatch = matchPath(
    "/projects/:projectId/library",
    pathname,
  );
  if (projectLibraryMatch?.params.projectId) {
    return {
      currentSection: "library",
      projectId: projectLibraryMatch.params.projectId,
    };
  }

  if (pathname === "/search") {
    return {
      currentSection: "search",
    };
  }

  if (pathname === "/jobs") {
    return {
      currentSection: "jobs",
    };
  }

  if (pathname === "/settings") {
    return {
      currentSection: "settings",
    };
  }

  if (pathname === "/spaces") {
    return {
      currentSection: "spaces",
    };
  }

  return {
    currentSection: "projects",
  };
}

function currentSectionTitle(
  section: WorkflowContext["currentSection"],
): string {
  switch (section) {
    case "search":
      return "Search";
    case "projects":
      return "Projects";
    case "library":
      return "Library";
    case "reader":
      return "Reader";
    case "writing":
      return "Writing";
    case "jobs":
      return "Jobs";
    case "settings":
      return "Settings";
    case "spaces":
      return "Spaces";
    default:
      return "Projects";
  }
}

function isActiveSection(
  pathname: string,
  section: WorkflowContext["currentSection"],
): boolean {
  switch (section) {
    case "spaces":
      return pathname === "/spaces";
    case "projects":
      return pathname === "/projects" || pathname === "/";
    case "search":
      return pathname === "/search";
    case "library":
      return Boolean(
        matchPath("/projects/:projectId/library", pathname) ??
          false,
      );
    case "reader":
      return Boolean(
        matchPath("/projects/:projectId/library/:entryId/reader", pathname) ??
          false,
      );
    case "writing":
      return Boolean(
        matchPath("/projects/:projectId/writing/:docId", pathname) ??
          false,
      );
    case "jobs":
      return pathname === "/jobs";
    case "settings":
      return pathname === "/settings";
  }
}

function AuthenticatedAppShell({ children }: { children: ReactNode }) {
  const location = useLocation();
  const navigate = useNavigate();
  const { logout, user } = useSessionAuth();
  const [isCollapsed, setIsCollapsed] = useState(readCollapsedPreference);

  const context = useMemo(
    () => deriveWorkflowContext(location.pathname),
    [location.pathname],
  );
  const projectContext = useProjectContext(context.projectId);
  const resolvedProject = projectContext.project?.project ?? null;
  const resolvedProjectId = context.projectId ?? resolvedProject?.id;
  const resolvedSpaceId = context.spaceId ?? resolvedProject?.spaceId;

  const shellLinks = useMemo<ShellLink[]>(
    () => [
      {
        key: "projects",
        label: "Projects",
        subtitle: "Collaboration lanes",
        to: "/projects",
        icon: FolderKanban,
      },
      {
        key: "spaces",
        label: "Spaces",
        subtitle: "Governance settings",
        to: "/spaces",
        icon: Settings,
      },
      {
        key: "search",
        label: "Search",
        subtitle: "Discover and import",
        to: "/search",
        icon: Search,
      },
      {
        key: "library",
        label: "Library",
        subtitle: "Project assets",
        to: resolvedProjectId ? `/projects/${resolvedProjectId}/library` : "/projects",
        icon: FileText,
      },
      {
        key: "reader",
        label: "Reader",
        subtitle: "Read with evidence",
        to: resolvedProjectId && context.entryId
          ? `/projects/${resolvedProjectId}/library/${context.entryId}/reader`
          : resolvedProjectId
            ? `/projects/${resolvedProjectId}/library`
            : "/projects",
        icon: BookOpen,
      },
      {
        key: "writing",
        label: "Writing",
        subtitle: "Versioned drafting",
        to: resolvedProjectId && context.docId
          ? `/projects/${resolvedProjectId}/writing/${context.docId}`
          : resolvedProjectId
            ? `/projects/${resolvedProjectId}`
            : "/projects",
        icon: FileText,
      },
      {
        key: "jobs",
        label: "Jobs",
        subtitle: "Governed AI runtime",
        to: "/jobs",
        icon: Bot,
      },
    ],
    [context.docId, context.entryId, resolvedProjectId],
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
              const isActive = isActiveSection(location.pathname, item.key);
              const Icon = item.icon;
              return (
                <Link
                  key={item.key}
                  to={item.to}
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
                    {resolvedSpaceId ?? "No server project loaded"}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <span className="inline-flex rounded-full bg-notion-sidebar-hover px-2 py-0.5 text-[11px] font-medium text-notion-text-secondary">
                    project
                  </span>
                  <span className="truncate">
                    {resolvedProject?.name ?? resolvedProjectId ?? "No project selected"}
                  </span>
                </div>
                {projectContext.error ? (
                  <p className="pt-1 text-xs text-amber-700">
                    {projectContext.error}
                  </p>
                ) : null}
              </div>
            </div>
          )}

          <div className="mt-auto border-t border-notion-border/80 pt-3">
            <Link
              to="/settings"
              title={isCollapsed ? "Settings" : undefined}
              className={`group relative flex items-center rounded-lg text-sm no-underline transition-colors hover:bg-notion-sidebar-hover/70 ${
                isCollapsed ? "justify-center px-0 py-2.5" : "gap-3 px-3 py-2.5"
              }`}
            >
              {isActiveSection(location.pathname, "settings") && (
                <motion.div
                  layoutId="jixia-sidebar-indicator"
                  className="absolute inset-0 rounded-lg bg-notion-accent-light"
                  transition={{ type: "spring", stiffness: 500, damping: 30 }}
                />
              )}
              <Settings
                size={isCollapsed ? 20 : 18}
                strokeWidth={
                  isActiveSection(location.pathname, "settings") ? 2.2 : 1.8
                }
                className={`relative z-10 shrink-0 ${
                  isActiveSection(location.pathname, "settings")
                    ? "text-notion-text"
                    : "text-notion-text-tertiary group-hover:text-notion-text-secondary"
                }`}
              />
              {!isCollapsed && (
                <div className="relative z-10 min-w-0">
                  <div
                    className={`truncate ${
                      isActiveSection(location.pathname, "settings")
                        ? "font-medium text-notion-text"
                        : "text-notion-text-secondary group-hover:text-notion-text"
                    }`}
                  >
                    Settings
                  </div>
                  <div className="truncate text-xs text-notion-text-tertiary">
                    Credentials and governance
                  </div>
                </div>
              )}
            </Link>
          </div>
        </nav>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col overflow-hidden">
        <header className="flex h-[56px] shrink-0 items-center justify-between border-b border-notion-border bg-white/90 px-5 backdrop-blur-sm">
          <div className="min-w-0">
            <div className="flex items-center gap-2 text-xs font-medium uppercase tracking-[0.16em] text-notion-text-tertiary">
              <span>Jixia</span>
              <ChevronRight size={12} />
              <span>{currentSectionTitle(context.currentSection)}</span>
            </div>
            <div className="mt-1 truncate text-sm text-notion-text-secondary">
              {resolvedSpaceId ?? "No governance space"} ·{" "}
              {resolvedProject?.name ?? resolvedProjectId ?? "No project"}
            </div>
          </div>

          <div className="flex items-center gap-2">
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
