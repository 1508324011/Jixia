import type { CurrentSessionView } from "@jixia/shared";
import { Bot, FolderKanban, House, Library, NotebookPen, Search, Settings, type LucideIcon } from "lucide-react";
import type { ReactNode, RefObject } from "react";
import { useEffect, useRef } from "react";

import { LocaleSwitcher } from "../i18n/LocaleSwitcher";
import { localeCatalog, type AppSurface, type ContextTone, type Locale } from "../i18n/locale";
import { Pill } from "./workbench";

export type { AppSurface } from "../i18n/locale";

type AppShellProps = {
  readonly activeSettingsSection?: SettingsContextSection | undefined;
  readonly activeSurface?: AppSurface;
  readonly children: ReactNode;
  readonly currentSession?: CurrentSessionView | null | undefined;
  readonly locale?: Locale;
  readonly onNavigate?: ((surface: AppSurface) => void) | undefined;
  readonly onNavigateAIUsage?: (() => void) | undefined;
  readonly onLocaleChange?: ((locale: Locale) => void) | undefined;
  readonly onNavigateSettingsSection?: ((section: SettingsDetailSection) => void) | undefined;
};

type SettingsDetailSection = "account" | "ai";
type SettingsContextSection = SettingsDetailSection | "usage";

const primaryNavigationItems = [
  { icon: House, surface: "home" },
  { icon: Search, surface: "search" },
  { icon: Library, surface: "library" },
  { icon: FolderKanban, surface: "projects" },
  { icon: NotebookPen, surface: "notebook" },
  { icon: Bot, surface: "ai" }
] as const satisfies readonly NavigationItem[];

const settingsNavigationItem = {
  icon: Settings,
  surface: "settings"
} as const satisfies NavigationItem;

type NavigationItem = {
  readonly icon: LucideIcon;
  readonly surface: AppSurface;
};

export function AppShell({
  activeSettingsSection,
  activeSurface = "projects",
  children,
  currentSession,
  locale = "en",
  onNavigate,
  onNavigateAIUsage,
  onLocaleChange,
  onNavigateSettingsSection
}: AppShellProps) {
  const copy = localeCatalog(locale).shell;
  const activeNavigationRef = useRef<HTMLButtonElement>(null);
  const primaryNavigationRef = useRef<HTMLElement>(null);

  useEffect(() => {
    if (!window.matchMedia?.("(max-width: 700px)").matches) {
      return;
    }

    if (activeSurface === "settings") {
      primaryNavigationRef.current?.scrollTo?.({ left: 0 });
      return;
    }

    activeNavigationRef.current?.scrollIntoView?.({ block: "nearest", inline: "start" });
  }, [activeSurface]);

  return (
    <main className="jixia-shell">
      <aside className="jixia-shell__activity-rail" aria-label={copy.activityRail}>
        <div className="jixia-shell__rail-brand" aria-label="Jixia">
          J
        </div>

        <nav className="jixia-shell__rail-nav" aria-label={copy.navigation} ref={primaryNavigationRef}>
          {primaryNavigationItems.map((item) => (
            <NavigationButton
              activeSurface={activeSurface}
              item={item}
              key={item.surface}
              locale={locale}
              {...(activeSurface === item.surface ? { buttonRef: activeNavigationRef } : {})}
              {...(onNavigate ? { onNavigate } : {})}
            />
          ))}
        </nav>

        <div className="jixia-shell__rail-bottom">
          {onLocaleChange ? (
            <LocaleSwitcher compact locale={locale} onLocaleChange={onLocaleChange} />
          ) : null}
          <NavigationButton
            activeSurface={activeSurface}
            item={settingsNavigationItem}
            locale={locale}
            {...(onNavigate ? { onNavigate } : {})}
          />
        </div>
      </aside>

      <aside className="jixia-shell__context-sidebar" aria-label={copy.contextSidebar}>
        <div className="jixia-shell__brand">
          <strong className="jixia-shell__brand-name">Jixia</strong>
          <p className="jixia-shell__brand-copy">{copy.brandCopy}</p>
        </div>

        <SurfaceContext
          activeSettingsSection={activeSettingsSection}
          locale={locale}
          onNavigateAIUsage={onNavigateAIUsage}
          onNavigateSettingsSection={onNavigateSettingsSection}
          surface={activeSurface}
        />

        <section className="jixia-shell__session" aria-label={copy.currentSession}>
          <span className="jixia-shell__session-avatar" aria-hidden="true">
            {sessionInitial(currentSession)}
          </span>
          <span className="jixia-shell__session-main">
            <strong className="jixia-shell__session-name">
              {currentSession?.user.displayName ?? copy.sessionNameFallback}
            </strong>
            <span className="jixia-shell__session-copy">
              {currentSession?.user.email ?? copy.sessionEmailFallback}
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
  readonly buttonRef?: RefObject<HTMLButtonElement | null>;
  readonly item: NavigationItem;
  readonly locale: Locale;
  readonly onNavigate?: ((surface: AppSurface) => void) | undefined;
};

function NavigationButton({ activeSurface, buttonRef, item, locale, onNavigate }: NavigationButtonProps) {
  const Icon = item.icon;
  const label = localeCatalog(locale).shell.navigationLabels[item.surface];

  return (
    <button
      aria-current={activeSurface === item.surface ? "page" : undefined}
      className="jixia-shell__rail-button"
      onClick={() => onNavigate?.(item.surface)}
      ref={buttonRef}
      type="button"
    >
      <Icon aria-hidden="true" className="jixia-shell__rail-icon" focusable="false" size={18} strokeWidth={1.8} />
      <span className="jixia-shell__rail-label">{label}</span>
    </button>
  );
}

type SurfaceContextProps = {
  readonly activeSettingsSection?: SettingsContextSection | undefined;
  readonly locale: Locale;
  readonly onNavigateAIUsage?: (() => void) | undefined;
  readonly onNavigateSettingsSection?: ((section: SettingsDetailSection) => void) | undefined;
  readonly surface: AppSurface;
};

function SurfaceContext({
  activeSettingsSection,
  locale,
  onNavigateAIUsage,
  onNavigateSettingsSection,
  surface
}: SurfaceContextProps) {
  const copy = localeCatalog(locale).shell;
  const rows =
    surface === "settings"
      ? settingsContextRows({ activeSettingsSection, copy, onNavigateAIUsage, onNavigateSettingsSection })
      : copy.surfaceContext[surface];

  return (
    <section className="jixia-shell__surface-context" aria-labelledby="surface-context-title">
      <div className="jixia-shell__context-header">
        <p className="jixia-eyebrow">{copy.context}</p>
        <h2 id="surface-context-title">{copy.surfaceTitles[surface]}</h2>
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
  readonly tone?: ContextTone;
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
  readonly copy: ReturnType<typeof localeCatalog>["shell"];
  readonly onNavigateAIUsage?: (() => void) | undefined;
  readonly onNavigateSettingsSection?: ((section: SettingsDetailSection) => void) | undefined;
};

function settingsContextRows({
  activeSettingsSection,
  copy,
  onNavigateAIUsage,
  onNavigateSettingsSection
}: SettingsContextRowsOptions): readonly ContextRowProps[] {
  return [
    {
      ...copy.settingsContext.account,
      onOpen: () => onNavigateSettingsSection?.("account"),
      selected: activeSettingsSection === "account"
    },
    {
      ...copy.settingsContext.ai,
      onOpen: () => onNavigateSettingsSection?.("ai"),
      selected: activeSettingsSection === "ai"
    },
    {
      ...copy.settingsContext.usage,
      onOpen: onNavigateAIUsage,
      selected: activeSettingsSection === "usage"
    }
  ];
}

function sessionInitial(currentSession: CurrentSessionView | null | undefined): string {
  const source = currentSession?.user.displayName ?? currentSession?.user.email ?? "J";
  return source.trim().slice(0, 1).toUpperCase() || "J";
}
