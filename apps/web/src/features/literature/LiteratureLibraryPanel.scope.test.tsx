import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { Profiler, type ProfilerOnRenderCallback } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { LiteratureLibraryPanel } from "./LiteratureLibraryPanel";
import { deferred, jsonResponse, listResponse, personalSummary, projectSummary } from "./literature-library.test-fixtures";

describe("LiteratureLibraryPanel scope lifecycle", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("requests a project scope and aborts independent list and detail work after a scope switch", async () => {
    // Given: a selected personal detail request remains pending while the project list is available.
    const pendingDetail = deferred<Response>();
    const pendingProjectList = deferred<Response>();
    const commits: string[] = [];
    let panelContainer: HTMLElement | null = null;
    const recordCommit: ProfilerOnRenderCallback = () => {
      commits.push(panelContainer?.textContent ?? "");
    };
    const signals = new Map<string, AbortSignal>();
    const fetchMock = vi.fn<typeof fetch>((input, init) => {
      const path = String(input);
      if (init?.signal instanceof AbortSignal) signals.set(path, init.signal);
      if (path === "/api/literature?scope=personal&limit=25") return Promise.resolve(jsonResponse(listResponse([personalSummary])));
      if (path === `/api/literature/${personalSummary.id}`) return pendingDetail.promise;
      if (path === "/api/literature?scope=project&projectId=project-2&limit=25") {
        return pendingProjectList.promise;
      }
      return Promise.reject(new Error(`Unexpected request: ${path}`));
    });
    vi.stubGlobal("fetch", fetchMock);

    // When: selection starts detail work and the parent switches to a project source.
    const view = render(
      <Profiler id="literature-library" onRender={recordCommit}>
        <LiteratureLibraryPanel scope="personal" />
      </Profiler>
    );
    panelContainer = view.container;
    fireEvent.click(await screen.findByRole("button", { name: personalSummary.title ?? "" }));
    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(
      `/api/literature/${personalSummary.id}`,
      expect.objectContaining({ signal: expect.any(AbortSignal) })
    ));
    expect(await screen.findByTestId("personal-library-list")).toBeTruthy();
    commits.length = 0;
    view.rerender(
      <Profiler id="literature-library" onRender={recordCommit}>
        <LiteratureLibraryPanel projectId="project-2" scope="project" />
      </Profiler>
    );

    // Then: stale personal rows disappear synchronously before the project request resolves.
    expect(commits[0]).not.toContain(personalSummary.title);
    expect(commits[0]).toContain("Loading literature...");
    expect(screen.queryByRole("button", { name: personalSummary.title ?? "" })).toBeNull();
    expect(screen.getByText("Loading literature...")).toBeTruthy();
    await act(async () => {
      pendingProjectList.resolve(jsonResponse(listResponse([projectSummary])));
      await Promise.resolve();
    });

    // And: both personal operations are aborted and the project request replaces the visible source.
    expect(await screen.findByRole("button", { name: projectSummary.title ?? "" })).toBeTruthy();
    expect(signals.get("/api/literature?scope=personal&limit=25")?.aborted).toBe(true);
    expect(signals.get(`/api/literature/${personalSummary.id}`)?.aborted).toBe(true);
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/literature?scope=project&projectId=project-2&limit=25",
      expect.objectContaining({ credentials: "include" })
    );
  });
});
