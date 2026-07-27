import type { CurrentSessionView } from "@jixia/shared";

import { AISettingsPage } from "../features/ai/AISettingsPage";
import { localeCatalog, type Locale } from "../features/i18n/locale";
import { Button, EmptyState, MetaGrid, Notice, Pane, SurfaceHeader, WorkbenchSurface } from "../features/layout/workbench";
import type { PlaceholderSurface, SettingsSection } from "./app-route";

type DeferredSurfaceProps = {
  readonly locale: Locale;
  readonly onOpenProjects: () => void;
  readonly surface: PlaceholderSurface;
};

export function DeferredSurface({ locale, onOpenProjects, surface }: DeferredSurfaceProps) {
  const workbenchCopy = localeCatalog(locale).workbench;
  const copy = workbenchCopy.deferred[surface];

  return (
    <WorkbenchSurface aria-labelledby={`${surface}-placeholder-title`}>
      <SurfaceHeader
        description={copy.description}
        eyebrow={copy.eyebrow}
        title={copy.title}
        titleId={`${surface}-placeholder-title`}
      />
      <EmptyState
        actions={<Button onClick={onOpenProjects}>{workbenchCopy.openProjects}</Button>}
        description={workbenchCopy.deferredDescription}
        title={workbenchCopy.deferredTitle}
      />
    </WorkbenchSurface>
  );
}

type SettingsSurfaceProps = {
  readonly currentSession: CurrentSessionView | null;
  readonly locale: Locale;
  readonly onOpenChat: () => void;
  readonly onOpenUsage: () => void;
  readonly section: SettingsSection;
};

export function SettingsSurface({ currentSession, locale, onOpenChat, onOpenUsage, section }: SettingsSurfaceProps) {
  const copy = localeCatalog(locale).workbench.settings;

  return (
    <WorkbenchSurface aria-labelledby="settings-title" width="full">
      <SurfaceHeader
        description={copy.description}
        eyebrow={copy.eyebrow}
        title={copy.title}
        titleId="settings-title"
      />

      <div className="jixia-settings-detail">
        {section === "account" ? (
          <AccountSettingsPanel currentSession={currentSession} locale={locale} />
        ) : (
          <AISettingsPage embedded locale={locale} onOpenChat={onOpenChat} onOpenUsage={onOpenUsage} />
        )}
      </div>
    </WorkbenchSurface>
  );
}

function AccountSettingsPanel({ currentSession, locale }: { readonly currentSession: CurrentSessionView | null; readonly locale: Locale }) {
  const copy = localeCatalog(locale).workbench.settings;

  return (
    <Pane muted title={copy.accountTitle} titleId="settings-account-title">
      <Notice>{copy.accountNotice}</Notice>
      <MetaGrid
        items={[
          { label: copy.name, value: currentSession?.user.displayName ?? copy.unavailable },
          { label: copy.email, value: currentSession?.user.email ?? copy.unavailable },
          { label: copy.space, value: currentSession?.user.space.name ?? copy.unavailable }
        ]}
      />
    </Pane>
  );
}
