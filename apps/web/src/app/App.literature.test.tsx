import type { ListLiteratureResponse } from "@jixia/shared";
import { act, cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { App, libraryPath, routeFromLocation } from "./App";

describe("App literature routes", () => {
  beforeEach(() => {
    Object.defineProperty(window, "matchMedia", {
      configurable: true,
      value: vi.fn().mockImplementation((query: string) => ({
        matches: false,
        media: query,
        onchange: null,
        addEventListener: vi.fn(),
        removeEventListener: vi.fn(),
        addListener: vi.fn(),
        removeListener: vi.fn(),
        dispatchEvent: vi.fn()
      })),
      writable: true
    });
  });

  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
    window.history.replaceState(null, "", "/");
    document.documentElement.lang = "en";
  });

  it("renders /search as the real literature discovery surface", () => {
    window.history.replaceState(null, "", "/search");
    const fetchMock = vi.fn<typeof fetch>();
    vi.stubGlobal("fetch", fetchMock);

    render(<App />);

    expect(screen.getByRole("heading", { level: 1, name: "Search the literature" })).toBeTruthy();
    expect(screen.getByTestId("literature-search-query")).toBeTruthy();
    expect(screen.getByTestId("literature-target-personal")).toBeTruthy();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it("renders /library as the real personal literature surface", async () => {
    window.history.replaceState(null, "", "/library");
    const fetchMock = vi.fn<typeof fetch>().mockImplementation(async (input, init) => {
      if (input === "/api/literature?scope=personal&limit=25" && (init?.method ?? "GET") === "GET") {
        return jsonResponse({ literature: [], nextCursor: null } satisfies ListLiteratureResponse);
      }
      throw new Error(`Unexpected request: ${init?.method ?? "GET"} ${String(input)}`);
    });
    vi.stubGlobal("fetch", fetchMock);

    render(<App />);

    expect(screen.getByRole("heading", { level: 1, name: "Personal literature" })).toBeTruthy();
    expect(await screen.findByText("No personal literature")).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/literature?scope=personal&limit=25",
      expect.objectContaining({ credentials: "include" })
    );
  });

  it("round-trips a project library target and selected literature through the URL", () => {
    const path = libraryPath("literature/alpha", { scope: "project", projectId: "project/alpha" });

    expect(path).toBe("/library?scope=project&projectId=project%2Falpha&literatureId=literature%2Falpha");
    expect(routeFromLocation(new URL(path, "https://jixia.test"))).toEqual({
      name: "library",
      initialLiteratureId: "literature/alpha",
      target: { scope: "project", projectId: "project/alpha" }
    });
  });

  it("keeps a personal selection and ignores unrelated project parameters", () => {
    expect(routeFromLocation(new URL("https://jixia.test/library?scope=personal&projectId=ignored&literatureId=lit-1"))).toEqual({
      name: "library",
      initialLiteratureId: "lit-1"
    });
    expect(routeFromLocation(new URL(libraryPath("lit-1", { scope: "personal" }), "https://jixia.test"))).toEqual({
      name: "library",
      initialLiteratureId: "lit-1"
    });
  });

  it("falls back to personal Library when project route parameters are malformed", () => {
    expect(routeFromLocation(new URL("https://jixia.test/library?scope=project&projectId=", "https://jixia.test"))).toEqual({
      name: "library"
    });
    expect(routeFromLocation(new URL("https://jixia.test/library?scope=unknown&projectId=project-1&literatureId=lit-1", "https://jixia.test"))).toEqual({
      name: "library"
    });
  });

  it("reconstructs a project Library target from popstate", async () => {
    window.history.replaceState(null, "", "/search");
    const fetchMock = vi.fn<typeof fetch>().mockImplementation(async (input, init) => {
      if (input === "/api/literature?scope=project&projectId=project%2Falpha&limit=25" && (init?.method ?? "GET") === "GET") {
        return jsonResponse({ literature: [], nextCursor: null } satisfies ListLiteratureResponse);
      }
      throw new Error(`Unexpected request: ${init?.method ?? "GET"} ${String(input)}`);
    });
    vi.stubGlobal("fetch", fetchMock);
    render(<App />);

    act(() => {
      window.history.pushState(null, "", "/library?scope=project&projectId=project%2Falpha");
      window.dispatchEvent(new PopStateEvent("popstate"));
    });

    expect(await screen.findByRole("heading", { level: 1, name: "Project literature" })).toBeTruthy();
    expect(await screen.findByText("No project literature")).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/literature?scope=project&projectId=project%2Falpha&limit=25",
      expect.objectContaining({ credentials: "include" })
    );
  });
});

function jsonResponse(payload: unknown): Response {
  return new Response(JSON.stringify(payload), {
    status: 200,
    headers: { "Content-Type": "application/json" }
  });
}
