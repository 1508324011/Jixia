import type { LiteratureImportWarningCode, LiteratureTargetScope } from "@jixia/shared";

import type { AppSurface } from "../features/layout/AppShell";

export type SettingsSection = "account" | "ai";

export type AppRoute =
  | { readonly name: "login" }
  | { readonly name: "accept-invitation" }
  | { readonly name: "home" }
  | { readonly name: "search" }
  | {
      readonly initialLiteratureId?: string;
      readonly importWarnings?: readonly LiteratureImportWarningCode[];
      readonly name: "library";
      readonly target?: LiteratureTargetScope;
    }
  | { readonly name: "projects" }
  | { readonly name: "notebook" }
  | { readonly name: "notebook-document"; readonly documentId: string }
  | { readonly name: "ai" }
  | { readonly name: "settings"; readonly section: SettingsSection }
  | { readonly name: "ai-usage" }
  | { readonly name: "project"; readonly projectId: string }
  | { readonly name: "document"; readonly projectId: string; readonly documentId: string };

export type PlaceholderSurface = Extract<AppSurface, "home">;

export function routeFromLocation(location: Pick<Location, "pathname" | "search">): AppRoute {
  if (location.pathname === "/accept-invitation") return { name: "accept-invitation" };
  if (location.pathname === "/login" || location.pathname === "/") return { name: "login" };
  if (location.pathname === "/home") return { name: "home" };
  if (location.pathname === "/search") return { name: "search" };
  if (location.pathname === "/library") return libraryRouteFromSearch(location.search);

  const notebookDocumentRouteMatch = location.pathname.match(/^\/notebook\/documents\/([^/]+)$/);
  if (notebookDocumentRouteMatch) {
    return {
      name: "notebook-document",
      documentId: decodeURIComponent(notebookDocumentRouteMatch[1] ?? "")
    };
  }

  if (location.pathname === "/notebook") return { name: "notebook" };
  if (location.pathname === "/ai") return { name: "ai" };
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

export function libraryPath(initialLiteratureId: string | undefined, target: LiteratureTargetScope | undefined): string {
  const parameters = new URLSearchParams();
  if (target?.scope === "project" && routeParameter(target.projectId) !== undefined) {
    parameters.set("scope", "project");
    parameters.set("projectId", routeParameter(target.projectId) ?? "");
  } else if (target?.scope === "personal") {
    parameters.set("scope", "personal");
  }
  const literatureId = routeParameter(initialLiteratureId);
  if (literatureId !== undefined) parameters.set("literatureId", literatureId);
  const query = parameters.toString();
  return query.length === 0 ? "/library" : `/library?${query}`;
}

function libraryRouteFromSearch(search: string): AppRoute {
  const parameters = new URLSearchParams(search);
  const literatureId = routeParameter(parameters.get("literatureId"));
  const scope = parameters.get("scope");

  if (scope === "project") {
    const projectId = routeParameter(parameters.get("projectId"));
    if (projectId === undefined) return { name: "library" };
    return {
      name: "library",
      ...(literatureId === undefined ? {} : { initialLiteratureId: literatureId }),
      target: { scope: "project", projectId }
    };
  }

  if (scope !== null && scope !== "personal") return { name: "library" };
  return {
    name: "library",
    ...(literatureId === undefined ? {} : { initialLiteratureId: literatureId })
  };
}

function routeParameter(value: string | null | undefined): string | undefined {
  const normalized = value?.trim();
  return normalized === undefined || normalized.length === 0 ? undefined : normalized;
}

export function settingsPath(section: SettingsSection): string {
  return section === "account" ? "/settings/account" : "/settings/ai";
}

export function surfacePath(surface: AppSurface): string {
  if (surface === "projects") return "/workspace";
  if (surface === "settings") return settingsPath("account");
  return `/${surface}`;
}

export function surfaceRoute(surface: AppSurface): AppRoute {
  if (surface === "projects") return { name: "projects" };
  if (surface === "settings") return { name: "settings", section: "account" };
  return { name: surface };
}

export function isPlaceholderRoute(route: AppRoute): route is { readonly name: PlaceholderSurface } {
  return route.name === "home";
}
