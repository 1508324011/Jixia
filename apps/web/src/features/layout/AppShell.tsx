import type { CurrentSessionView } from "@jixia/shared";
import type { ReactNode } from "react";

import { Pill } from "./workbench";

type AppShellProps = {
  readonly activeSettingsSection?: SettingsContextSection | undefined;
  readonly activeSurface?: AppSurface;
  readonly children: ReactNode;
  readonly currentSession?: CurrentSessionView | null | undefined;
  readonly onNavigate?: ((surface: AppSurface) => void) | undefined;
  readonly onNavigateAIUsage?: (() => void) | undefined;
  readonly onNavigateSettingsSection?: ((section: SettingsDetailSection) => void) | undefined;
};

export type AppSurface = "home" | "search" | "library" | "projects" | "notebook" | "ai" | "settings";

type SettingsDetailSection = "account" | "ai";
type SettingsContextSection = SettingsDetailSection | "usage";

const primaryNavigationItems = [
  { icon: "⌂", label: "Home", surface: "home" },
  { icon: "⌕", label: "Search", surface: "search" },
  { icon: "▣", label: "Library", surface: "library" },
  { icon: "◇", label: "Projects", surface: "projects" },
  { icon: "✎", label: "Notebook", surface: "notebook" },
  { icon: "AI", label: "AI", surface: "ai" }
] as const satisfies readonly NavigationItem[];

const settingsNavigationItem = {
  icon: "⚙",
  label: "Setting",
  surface: "settings"
} as const satisfies NavigationItem;

const surfaceTitles: Record<AppSurface, string> = {
  home: "Home",
  search: "External Search",
  library: "Library",
  projects: "Projects",
  notebook: "Notebook",
  ai: "AI Workspace",
  settings: "Setting"
};

type NavigationItem = {
  readonly icon: string;
  readonly label: string;
  readonly surface: AppSurface;
};

export function AppShell({
  activeSettingsSection,
  activeSurface = "projects",
  children,
  currentSession,
  onNavigate,
  onNavigateAIUsage,
  onNavigateSettingsSection
}: AppShellProps) {
  return (
    <main className="jixia-shell">
      <aside className="jixia-shell__activity-rail" aria-label="Activity rail">
        <div className="jixia-shell__rail-brand" aria-label="Jixia">
          J
        </div>

        <nav className="jixia-shell__rail-nav" aria-label="Workbench navigation">
          {primaryNavigationItems.map((item) => (
            <NavigationButton
              activeSurface={activeSurface}
              item={item}
              key={item.label}
              {...(onNavigate ? { onNavigate } : {})}
            />
          ))}
        </nav>

        <div className="jixia-shell__rail-bottom">
          <NavigationButton
            activeSurface={activeSurface}
            item={settingsNavigationItem}
            {...(onNavigate ? { onNavigate } : {})}
          />
        </div>
      </aside>

      <aside className="jixia-shell__context-sidebar" aria-label="Context sidebar">
        <div className="jixia-shell__brand">
          <strong className="jixia-shell__brand-name">Jixia</strong>
          <p className="jixia-shell__brand-copy">Server-first research workbench</p>
        </div>

        <SurfaceContext
          activeSettingsSection={activeSettingsSection}
          onNavigateAIUsage={onNavigateAIUsage}
          onNavigateSettingsSection={onNavigateSettingsSection}
          surface={activeSurface}
        />

        <section className="jixia-shell__session" aria-label="Current session">
          <span className="jixia-shell__session-avatar" aria-hidden="true">
            {sessionInitial(currentSession)}
          </span>
          <span className="jixia-shell__session-main">
            <strong className="jixia-shell__session-name">
              {currentSession?.user.displayName ?? "Cookie session"}
            </strong>
            <span className="jixia-shell__session-copy">
              {currentSession?.user.email ?? "API-owned auth"}
            </span>
          </span>
        </section>
      </aside>

      <section className="jixia-shell__workspace">
        <div className="jixia-shell__content">{children}</div>
      </section>
    </main>
  );
}

type NavigationButtonProps = {
  readonly activeSurface: AppSurface;
  readonly item: NavigationItem;
  readonly onNavigate?: ((surface: AppSurface) => void) | undefined;
};

function NavigationButton({ activeSurface, item, onNavigate }: NavigationButtonProps) {
  return (
    <button
      aria-current={activeSurface === item.surface ? "page" : undefined}
      className="jixia-shell__rail-button"
      onClick={() => onNavigate?.(item.surface)}
      type="button"
    >
      <span className="jixia-shell__rail-icon" aria-hidden="true">{item.icon}</span>
      <span className="jixia-shell__rail-label">{item.label}</span>
    </button>
  );
}

type SurfaceContextProps = {
  readonly activeSettingsSection?: SettingsContextSection | undefined;
  readonly onNavigateAIUsage?: (() => void) | undefined;
  readonly onNavigateSettingsSection?: ((section: SettingsDetailSection) => void) | undefined;
  readonly surface: AppSurface;
};

function SurfaceContext({
  activeSettingsSection,
  onNavigateAIUsage,
  onNavigateSettingsSection,
  surface
}: SurfaceContextProps) {
  const rows =
    surface === "settings"
      ? settingsContextRows({ activeSettingsSection, onNavigateAIUsage, onNavigateSettingsSection })
      : surfaceContextRows[surface];

  return (
    <section className="jixia-shell__surface-context" aria-labelledby="surface-context-title">
      <div className="jixia-shell__context-header">
        <p className="jixia-eyebrow">Context</p>
        <h2 id="surface-context-title">{surfaceTitles[surface]}</h2>
      </div>
      <div className="jixia-shell__context-list">{rows.map((row) => <ContextRow key={row.label} {...row} />)}</div>
    </section>
  );
}

type ContextRowProps = {
  readonly label: string;
  readonly meta: string;
  readonly onOpen?: (() => void) | undefined;
  readonly selected?: boolean;
  readonly tone?: "neutral" | "accent" | "success" | "warning";
};

function ContextRow({ label, meta, onOpen, selected = false, tone = "neutral" }: ContextRowProps) {
  const content = (
    <>
      <span>
        <strong>{label}</strong>
        <small>{meta}</small>
      </span>
      {tone !== "neutral" ? <Pill tone={tone}>{tone}</Pill> : null}
    </>
  );

  if (onOpen) {
    return (
      <button
        aria-current={selected ? "page" : undefined}
        className={`jixia-shell__context-row jixia-shell__context-row--button${selected ? " jixia-shell__context-row--selected" : ""}`}
        onClick={onOpen}
        type="button"
      >
        {content}
      </button>
    );
  }

  return <div className="jixia-shell__context-row">{content}</div>;
}

type SettingsContextRowsOptions = {
  readonly activeSettingsSection?: SettingsContextSection | undefined;
  readonly onNavigateAIUsage?: (() => void) | undefined;
  readonly onNavigateSettingsSection?: ((section: SettingsDetailSection) => void) | undefined;
};

function settingsContextRows({
  activeSettingsSection,
  onNavigateAIUsage,
  onNavigateSettingsSection
}: SettingsContextRowsOptions): readonly ContextRowProps[] {
  return [
    {
      label: "Account",
      meta: "HttpOnly cookie session",
      onOpen: () => onNavigateSettingsSection?.("account"),
      selected: activeSettingsSection === "account"
    },
    {
      label: "AI providers",
      meta: "Safe metadata only",
      onOpen: () => onNavigateSettingsSection?.("ai"),
      selected: activeSettingsSection === "ai",
      tone: "accent"
    },
    {
      label: "Usage",
      meta: "Aggregate-only summaries",
      onOpen: onNavigateAIUsage,
      selected: activeSettingsSection === "usage"
    }
  ];
}

function sessionInitial(currentSession: CurrentSessionView | null | undefined): string {
  const source = currentSession?.user.displayName ?? currentSession?.user.email ?? "J";
  return source.trim().slice(0, 1).toUpperCase() || "J";
}

const surfaceContextRows: Record<AppSurface, readonly ContextRowProps[]> = {
  home: [
    { label: "Recent work", meta: "Reserved for API-owned recents" },
    { label: "Draft queue", meta: "No browser-owned work state" },
    { label: "Jobs", meta: "Server job status will land later" }
  ],
  search: [
    { label: "External discovery", meta: "Not implemented in this task" },
    { label: "Filters", meta: "Awaiting server search contracts" },
    { label: "Saved queries", meta: "No client-only query model" }
  ],
  library: [
    { label: "Literature assets", meta: "Awaiting saved-asset APIs" },
    { label: "Collections", meta: "Placeholder only" },
    { label: "Imports", meta: "No local-only library state" }
  ],
  projects: [
    { label: "Project explorer", meta: "API-authorized objects", tone: "accent" },
    { label: "Documents", meta: "Drafts and revisions stay separate" },
    { label: "Conflicts", meta: "Manual review only" }
  ],
  notebook: [
    { label: "Notebook documents", meta: "Owner-authorized API list", tone: "accent" },
    { label: "Drafts", meta: "Shared document editor" },
    { label: "Attachments", meta: "Private document flow" }
  ],
  ai: [
    { label: "Standalone chat", meta: "No automatic document context", tone: "accent" },
    { label: "Provider configs", meta: "Keys stay server-owned" },
    { label: "Writeback", meta: "Disabled by product boundary" }
  ],
  settings: [
    { label: "Account", meta: "HttpOnly cookie session" },
    { label: "AI providers", meta: "Safe metadata only", tone: "accent" },
    { label: "Usage", meta: "Aggregate-only summaries" }
  ]
};
