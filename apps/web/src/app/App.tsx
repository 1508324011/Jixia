import type {
  CurrentSessionView,
  LiteratureImportWarningCode,
  LiteratureTargetScope,
  LoginResponse
} from "@jixia/shared";
import { useEffect, useMemo, useState } from "react";

import { AIChatDialog } from "../features/ai/chat/AIChatDialog";
import { AIUsagePage } from "../features/ai/AIUsagePage";
import { AcceptInvitationPage } from "../features/auth/AcceptInvitationPage";
import { LoginPage } from "../features/auth/LoginPage";
import { DocumentEditorPage } from "../features/documents/DocumentEditorPage";
import { browserDefaultLocale, synchronizeDocumentLanguage, type Locale } from "../features/i18n/locale";
import { AppShell, type AppSurface } from "../features/layout/AppShell";
import { LiteratureRouteSurface } from "../features/literature/LiteratureRouteSurface";
import { NotebookPage } from "../features/notebook/NotebookPage";
import { ProjectDetailPage } from "../features/projects/ProjectDetailPage";
import { ProjectListPage } from "../features/projects/ProjectListPage";
import {
  isPlaceholderRoute,
  libraryPath,
  routeFromLocation,
  settingsPath,
  surfacePath,
  surfaceRoute,
  type AppRoute,
  type SettingsSection
} from "./app-route";
import { DeferredSurface, SettingsSurface } from "./AppSupportingSurfaces";

export { libraryPath, routeFromLocation } from "./app-route";

export function App() {
  const initialRoute = useMemo(() => routeFromLocation(window.location), []);
  const [route, setRoute] = useState<AppRoute>(initialRoute);
  const [currentSession, setCurrentSession] = useState<CurrentSessionView | null>(null);
  const [locale, setLocale] = useState<Locale>(browserDefaultLocale);

  useEffect(() => {
    synchronizeDocumentLanguage(locale);
  }, [locale]);

  useEffect(() => {
    function synchronizeRoute(): void {
      setRoute(routeFromLocation(window.location));
    }

    window.addEventListener("popstate", synchronizeRoute);
    return () => window.removeEventListener("popstate", synchronizeRoute);
  }, []);

  function handleAuthenticated(response: LoginResponse): void {
    setCurrentSession(response.currentSession);
    window.history.replaceState(window.history.state, "", "/workspace");
    setRoute({ name: "projects" });
  }

  function navigateSurface(surface: AppSurface): void {
    window.history.pushState(window.history.state, "", surfacePath(surface));
    setRoute(surfaceRoute(surface));
  }

  function openLiterature(
    literatureId: string,
    target: LiteratureTargetScope,
    importWarnings?: readonly LiteratureImportWarningCode[]
  ): void {
    window.history.pushState(window.history.state, "", libraryPath(literatureId, target));
    setRoute(importWarnings !== undefined && importWarnings.length > 0
      ? { name: "library", initialLiteratureId: literatureId, target, importWarnings }
      : { name: "library", initialLiteratureId: literatureId, target });
  }

  function navigateAIUsage(): void {
    window.history.pushState(window.history.state, "", "/settings/ai/usage");
    setRoute({ name: "ai-usage" });
  }

  function navigateAI(): void {
    navigateSurface("ai");
  }

  function navigateProjects(): void {
    navigateSurface("projects");
  }

  function navigateSettingsSection(section: SettingsSection): void {
    window.history.pushState(window.history.state, "", settingsPath(section));
    setRoute({ name: "settings", section });
  }
  function navigateAISettings(): void {
    navigateSettingsSection("ai");
  }

  function changeLocale(nextLocale: Locale): void {
    setLocale(nextLocale);
  }

  function openProject(projectId: string): void {
    window.history.pushState(window.history.state, "", `/projects/${encodeURIComponent(projectId)}`);
    setRoute({ name: "project", projectId });
  }
  function openProjectDocument(projectId: string, documentId: string): void {
    window.history.pushState(
      window.history.state,
      "",
      `/projects/${encodeURIComponent(projectId)}/documents/${encodeURIComponent(documentId)}`
    );
    setRoute({ name: "document", projectId, documentId });
  }

  function openNotebookDocument(documentId: string): void {
    window.history.pushState(window.history.state, "", `/notebook/documents/${encodeURIComponent(documentId)}`);
    setRoute({ name: "notebook-document", documentId });
  }

  if (route.name === "accept-invitation") {
    return <AcceptInvitationPage onAccepted={handleAuthenticated} />;
  }

  if (route.name === "login") {
    return <LoginPage locale={locale} onLocaleChange={changeLocale} onLoginSuccess={handleAuthenticated} />;
  }

  if (route.name === "project") {
    return (
      <AppShell activeSurface="projects" currentSession={currentSession} locale={locale} onLocaleChange={changeLocale} onNavigate={navigateSurface}>
        <ProjectDetailPage
          locale={locale}
          onBack={navigateProjects}
          onOpenDocument={(documentId) => openProjectDocument(route.projectId, documentId)}
          projectId={route.projectId}
        />
      </AppShell>
    );
  }

  if (route.name === "document") {
    return (
      <AppShell activeSurface="projects" currentSession={currentSession} locale={locale} onLocaleChange={changeLocale} onNavigate={navigateSurface}>
        <DocumentEditorPage
          documentId={route.documentId}
          locale={locale}
          onOpenAISettings={navigateAISettings}
          onBack={() => openProject(route.projectId)}
        />
      </AppShell>
    );
  }

  if (route.name === "notebook") {
    return (
      <AppShell activeSurface="notebook" currentSession={currentSession} locale={locale} onLocaleChange={changeLocale} onNavigate={navigateSurface}>
        <NotebookPage locale={locale} onOpenDocument={openNotebookDocument} />
      </AppShell>
    );
  }

  if (route.name === "notebook-document") {
    return (
      <AppShell activeSurface="notebook" currentSession={currentSession} locale={locale} onLocaleChange={changeLocale} onNavigate={navigateSurface}>
        <DocumentEditorPage
          backLabel="Notebook"
          documentId={route.documentId}
          locale={locale}
          onBack={() => navigateSurface("notebook")}
          onOpenAISettings={navigateAISettings}
        />
      </AppShell>
    );
  }

  if (route.name === "ai-usage") {
    return (
      <AppShell
        activeSettingsSection="usage"
        activeSurface="settings"
        currentSession={currentSession}
        locale={locale}
        onNavigate={navigateSurface}
        onNavigateAIUsage={navigateAIUsage}
        onLocaleChange={changeLocale}
        onNavigateSettingsSection={navigateSettingsSection}
      >
        <AIUsagePage onBackToSettings={navigateAISettings} />
      </AppShell>
    );
  }

  if (route.name === "settings") {
    return (
      <AppShell
        activeSettingsSection={route.section}
        activeSurface="settings"
        currentSession={currentSession}
        locale={locale}
        onNavigate={navigateSurface}
        onNavigateAIUsage={navigateAIUsage}
        onLocaleChange={changeLocale}
        onNavigateSettingsSection={navigateSettingsSection}
      >
        <SettingsSurface
          currentSession={currentSession}
          locale={locale}
          onOpenChat={navigateAI}
          onOpenUsage={navigateAIUsage}
          section={route.section}
        />
      </AppShell>
    );
  }

  if (route.name === "ai") {
    return (
      <AppShell activeSurface="ai" currentSession={currentSession} locale={locale} onLocaleChange={changeLocale} onNavigate={navigateSurface}>
        <AIChatDialog onOpenSettings={navigateAISettings} />
      </AppShell>
    );
  }

  if (route.name === "search" || route.name === "library") {
    const literatureRouteContext =
      route.name === "library"
        ? {
            ...(route.initialLiteratureId === undefined ? {} : { initialLiteratureId: route.initialLiteratureId }),
            ...(route.target === undefined ? {} : { target: route.target }),
            ...(route.importWarnings === undefined ? {} : { importWarnings: route.importWarnings })
          }
        : {};

    return (
      <AppShell activeSurface={route.name} currentSession={currentSession} locale={locale} onLocaleChange={changeLocale} onNavigate={navigateSurface}>
        <LiteratureRouteSurface
          locale={locale}
          onOpenLiterature={openLiterature}
          surface={route.name}
          {...literatureRouteContext}
        />
      </AppShell>
    );
  }

  if (isPlaceholderRoute(route)) {
    return (
      <AppShell activeSurface={route.name} currentSession={currentSession} locale={locale} onLocaleChange={changeLocale} onNavigate={navigateSurface}>
        <DeferredSurface locale={locale} surface={route.name} onOpenProjects={navigateProjects} />
      </AppShell>
    );
  }

  return (
    <AppShell activeSurface="projects" currentSession={currentSession} locale={locale} onLocaleChange={changeLocale} onNavigate={navigateSurface}>
      <ProjectListPage onOpenProject={openProject} />
    </AppShell>
  );
}
