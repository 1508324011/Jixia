import type { CurrentSessionView, LoginResponse } from "@jixia/shared";
import { useMemo, useState } from "react";

import { AIChatDialog } from "../features/ai/chat/AIChatDialog";
import { AISettingsPage } from "../features/ai/AISettingsPage";
import { AIUsagePage } from "../features/ai/AIUsagePage";
import { AcceptInvitationPage } from "../features/auth/AcceptInvitationPage";
import { LoginPage } from "../features/auth/LoginPage";
import { DocumentEditorPage } from "../features/documents/DocumentEditorPage";
import { AppShell, type AppSurface } from "../features/layout/AppShell";
import { Button, EmptyState, MetaGrid, Notice, Pane, SurfaceHeader, WorkbenchSurface } from "../features/layout/workbench";
import { NotebookPage } from "../features/notebook/NotebookPage";
import { ProjectDetailPage } from "../features/projects/ProjectDetailPage";
import { ProjectListPage } from "../features/projects/ProjectListPage";

export function App() {
  const initialRoute = useMemo(() => routeFromLocation(window.location), []);
  const [route, setRoute] = useState<AppRoute>(initialRoute);
  const [currentSession, setCurrentSession] = useState<CurrentSessionView | null>(null);

  function handleAuthenticated(response: LoginResponse): void {
    setCurrentSession(response.currentSession);
    window.history.replaceState(window.history.state, "", "/workspace");
    setRoute({ name: "projects" });
  }

  function navigateSurface(surface: AppSurface): void {
    window.history.pushState(window.history.state, "", surfacePath(surface));
    setRoute(surfaceRoute(surface));
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
    return <LoginPage onLoginSuccess={handleAuthenticated} />;
  }

  if (route.name === "project") {
    return (
      <AppShell activeSurface="projects" currentSession={currentSession} onNavigate={navigateSurface}>
        <ProjectDetailPage
          onBack={navigateProjects}
          onOpenDocument={(documentId) => openProjectDocument(route.projectId, documentId)}
          projectId={route.projectId}
        />
      </AppShell>
    );
  }

  if (route.name === "document") {
    return (
      <AppShell activeSurface="projects" currentSession={currentSession} onNavigate={navigateSurface}>
        <DocumentEditorPage
          documentId={route.documentId}
          onBack={() => openProject(route.projectId)}
        />
      </AppShell>
    );
  }

  if (route.name === "notebook") {
    return (
      <AppShell activeSurface="notebook" currentSession={currentSession} onNavigate={navigateSurface}>
        <NotebookPage onOpenDocument={openNotebookDocument} />
      </AppShell>
    );
  }

  if (route.name === "notebook-document") {
    return (
      <AppShell activeSurface="notebook" currentSession={currentSession} onNavigate={navigateSurface}>
        <DocumentEditorPage backLabel="Notebook" documentId={route.documentId} onBack={() => navigateSurface("notebook")} />
      </AppShell>
    );
  }

  if (route.name === "ai-usage") {
    return (
      <AppShell
        activeSettingsSection="usage"
        activeSurface="settings"
        currentSession={currentSession}
        onNavigate={navigateSurface}
        onNavigateAIUsage={navigateAIUsage}
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
        onNavigate={navigateSurface}
        onNavigateAIUsage={navigateAIUsage}
        onNavigateSettingsSection={navigateSettingsSection}
      >
        <SettingsSurface
          currentSession={currentSession}
          onOpenChat={navigateAI}
          onOpenUsage={navigateAIUsage}
          section={route.section}
        />
      </AppShell>
    );
  }

  if (route.name === "ai") {
    return (
      <AppShell activeSurface="ai" currentSession={currentSession} onNavigate={navigateSurface}>
        <AIChatDialog onOpenSettings={navigateAISettings} />
      </AppShell>
    );
  }

  if (isPlaceholderRoute(route)) {
    return (
      <AppShell activeSurface={route.name} currentSession={currentSession} onNavigate={navigateSurface}>
        <DeferredSurface surface={route.name} onOpenProjects={navigateProjects} />
      </AppShell>
    );
  }

  return (
    <AppShell activeSurface="projects" currentSession={currentSession} onNavigate={navigateSurface}>
      <ProjectListPage onOpenProject={openProject} />
    </AppShell>
  );
}

type SettingsSection = "account" | "ai";

type AppRoute =
  | { readonly name: "login" }
  | { readonly name: "accept-invitation" }
  | { readonly name: "home" }
  | { readonly name: "search" }
  | { readonly name: "library" }
  | { readonly name: "projects" }
  | { readonly name: "notebook" }
  | { readonly name: "notebook-document"; readonly documentId: string }
  | { readonly name: "ai" }
  | { readonly name: "settings"; readonly section: SettingsSection }
  | { readonly name: "ai-usage" }
  | { readonly name: "project"; readonly projectId: string }
  | { readonly name: "document"; readonly projectId: string; readonly documentId: string };

type PlaceholderSurface = Extract<AppSurface, "home" | "search" | "library">;

function routeFromLocation(location: Location): AppRoute {
  if (location.pathname === "/accept-invitation") {
    return { name: "accept-invitation" };
  }

  if (location.pathname === "/login" || location.pathname === "/") {
    return { name: "login" };
  }

  if (location.pathname === "/home") {
    return { name: "home" };
  }

  if (location.pathname === "/search") {
    return { name: "search" };
  }

  if (location.pathname === "/library") {
    return { name: "library" };
  }

  const notebookDocumentRouteMatch = location.pathname.match(/^\/notebook\/documents\/([^/]+)$/);
  if (notebookDocumentRouteMatch) {
    return {
      name: "notebook-document",
      documentId: decodeURIComponent(notebookDocumentRouteMatch[1] ?? "")
    };
  }

  if (location.pathname === "/notebook") {
    return { name: "notebook" };
  }

  if (location.pathname === "/ai") {
    return { name: "ai" };
  }

  if (location.pathname === "/settings/ai/usage" || location.pathname === "/ai/usage") {
    return { name: "ai-usage" };
  }

  if (location.pathname === "/settings/ai" || location.pathname === "/ai/settings") {
    return { name: "settings", section: "ai" };
  }

  if (location.pathname === "/settings" || location.pathname === "/settings/account") {
    return { name: "settings", section: "account" };
  }

  const documentRouteMatch = location.pathname.match(/^\/projects\/([^/]+)\/documents\/([^/]+)$/);
  if (documentRouteMatch) {
    return {
      name: "document",
      projectId: decodeURIComponent(documentRouteMatch[1] ?? ""),
      documentId: decodeURIComponent(documentRouteMatch[2] ?? "")
    };
  }

  const projectRouteMatch = location.pathname.match(/^\/projects\/([^/]+)$/);
  if (projectRouteMatch) {
    return {
      name: "project",
      projectId: decodeURIComponent(projectRouteMatch[1] ?? "")
    };
  }

  return { name: "projects" };
}

function settingsPath(section: SettingsSection): string {
  return section === "account" ? "/settings/account" : "/settings/ai";
}

function surfacePath(surface: AppSurface): string {
  if (surface === "projects") {
    return "/workspace";
  }

  if (surface === "settings") {
    return settingsPath("account");
  }

  return `/${surface}`;
}

function surfaceRoute(surface: AppSurface): AppRoute {
  if (surface === "projects") {
    return { name: "projects" };
  }

  if (surface === "settings") {
    return { name: "settings", section: "account" };
  }

  return { name: surface };
}

function isPlaceholderRoute(route: AppRoute): route is { readonly name: PlaceholderSurface } {
  return route.name === "home" || route.name === "search" || route.name === "library";
}

type DeferredSurfaceProps = {
  readonly onOpenProjects: () => void;
  readonly surface: PlaceholderSurface;
};

const deferredSurfaceCopy: Record<PlaceholderSurface, { readonly description: string; readonly eyebrow: string; readonly title: string }> = {
  home: {
    eyebrow: "Daily cockpit",
    title: "Home will open when real work-state contracts exist.",
    description:
      "This surface is reserved for server-authorized recent work, document state, and job status. Projects remains the working object surface for this refactor."
  },
  search: {
    eyebrow: "External discovery",
    title: "Search is reserved for external literature discovery.",
    description:
      "Jixia will not fake Search with browser-local state. DOI, URL, and external literature discovery need server-owned contracts first."
  },
  library: {
    eyebrow: "Personal literature",
    title: "Library needs saved-asset contracts before opening.",
    description:
      "The future Library will manage personal literature assets and local library search, but it should not pretend to exist before storage and metadata APIs exist."
  },
};

function DeferredSurface({ onOpenProjects, surface }: DeferredSurfaceProps) {
  const copy = deferredSurfaceCopy[surface];

  return (
    <WorkbenchSurface aria-labelledby={`${surface}-placeholder-title`}>
      <SurfaceHeader
        description={copy.description}
        eyebrow={copy.eyebrow}
        title={copy.title}
        titleId={`${surface}-placeholder-title`}
      />
      <EmptyState
        actions={<Button onClick={onOpenProjects}>Open Projects</Button>}
        description="The browser remains a renderer of API-owned objects; no client-only object model is introduced here."
        title="Surface intentionally not opened yet"
      />
    </WorkbenchSurface>
  );
}

type SettingsSurfaceProps = {
  readonly currentSession: CurrentSessionView | null;
  readonly onOpenChat: () => void;
  readonly onOpenUsage: () => void;
  readonly section: SettingsSection;
};

function SettingsSurface({ currentSession, onOpenChat, onOpenUsage, section }: SettingsSurfaceProps) {
  return (
    <WorkbenchSurface aria-labelledby="settings-title" width="full">
      <SurfaceHeader
        description="Use the Context sidebar to choose a settings section, then edit only that detail surface. Account context and AI provider configuration no longer compete for the same pane."
        eyebrow="Global Setting"
        title="Settings"
        titleId="settings-title"
      />

      <div className="jixia-settings-detail">
        {section === "account" ? (
          <AccountSettingsPanel currentSession={currentSession} />
        ) : (
          <AISettingsPage embedded onOpenChat={onOpenChat} onOpenUsage={onOpenUsage} />
        )}
      </div>
    </WorkbenchSurface>
  );
}

function AccountSettingsPanel({ currentSession }: { readonly currentSession: CurrentSessionView | null }) {
  return (
    <Pane muted title="Account / Profile" titleId="settings-account-title">
      <Notice>
        Authentication is still owned by the API through HttpOnly session cookies. This panel renders the current session view only; it does not store auth tokens in browser state.
      </Notice>
      <MetaGrid
        items={[
          {
            label: "Name",
            value: currentSession?.user.displayName ?? "Unavailable until session is loaded"
          },
          {
            label: "Email",
            value: currentSession?.user.email ?? "Server cookie required"
          },
          {
            label: "Space",
            value: currentSession?.user.space.name ?? "Server-authorized session"
          }
        ]}
      />
    </Pane>
  );
}
