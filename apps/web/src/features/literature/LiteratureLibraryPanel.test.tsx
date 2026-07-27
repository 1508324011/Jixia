import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import type { GetLiteratureResponse } from "@jixia/shared";
import { Profiler, type ProfilerOnRenderCallback } from "react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { LiteratureLibraryPanel } from "./LiteratureLibraryPanel";
import { deferred, jsonResponse, literatureDetail, listResponse, personalSummary, secondPersonalSummary } from "./literature-library.test-fixtures";

describe("LiteratureLibraryPanel", () => {
  afterEach(() => {
    cleanup();
    vi.restoreAllMocks();
  });

  it("renders an empty personal library from the scoped list response", async () => {
    // Given: the personal library endpoint returns no records.
    const fetchMock = vi.fn<typeof fetch>().mockResolvedValueOnce(jsonResponse(listResponse([])));
    vi.stubGlobal("fetch", fetchMock);

    // When: the personal library panel loads.
    render(<LiteratureLibraryPanel scope="personal" />);

    // Then: the empty state and personal request are observable.
    expect(await screen.findByRole("heading", { name: "No personal literature" })).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledWith(
      "/api/literature?scope=personal&limit=25",
      expect.objectContaining({ credentials: "include" })
    );
  });

  it("renders selected detail with server provenance, typed history, and explicit conflicts", async () => {
    // Given: a conflict-free list row and a server-owned detail response with DOI and open-access conflicts.
    const listSummary = { ...personalSummary, conflictKinds: [] };
    const fetchMock = vi.fn<typeof fetch>((input) => {
      return Promise.resolve(String(input).startsWith("/api/literature?")
        ? jsonResponse(listResponse([listSummary]))
        : jsonResponse(literatureDetail));
    });
    vi.stubGlobal("fetch", fetchMock);

    // When: the user selects the returned literature row.
    render(<LiteratureLibraryPanel scope="personal" />);
    fireEvent.click(await screen.findByRole("button", { name: personalSummary.title ?? "" }));

    // Then: the inspector leaves its selection prompt and renders only server-owned detail data.
    const selectedRow = screen.getByRole("button", { name: personalSummary.title ?? "" });
    expect(selectedRow.getAttribute("aria-pressed")).toBe("true");
    expect(await screen.findByRole("heading", { name: "Literature details" })).toBeTruthy();
    expect(screen.queryByRole("heading", { name: "Select literature" })).toBeNull();
    const projection = await screen.findByRole("region", { name: "Current metadata" });
    for (const field of [
      "Title",
      "Abstract",
      "Publication year",
      "DOI",
      "Publication date",
      "Venue",
      "Publication type",
      "Authors",
      "Identifiers",
      "Open access",
      "Publisher"
    ]) {
      expect(within(projection).getByRole("heading", { name: field })).toBeTruthy();
    }
    expect(within(projection).getByText("A server-provided abstract.")).toBeTruthy();
    expect(within(projection).getByText("2026-06-18")).toBeTruthy();
    expect(within(projection).getByText("Jixia Journal")).toBeTruthy();
    expect(within(projection).getByText("journal-article")).toBeTruthy();
    expect(within(projection).getByText("Ada Lovelace (0000-0001-0000-0001)")).toBeTruthy();
    expect(within(projection).getByText("doi: 10.1000/evidence-synthesis, pmid: 12345678")).toBeTruthy();
    expect(within(projection).getByText("Open access · https://example.test/open/evidence-synthesis · License: CC BY 4.0 · Version: published · Host type: publisher")).toBeTruthy();
    expect(within(projection).getByText("Open access · https://example.test/open/evidence-synthesis · License: CC BY-NC 4.0 · Version: accepted · Host type: repository")).toBeTruthy();
    expect(within(projection).getByText("Jixia Press · https://example.test/jixia-press")).toBeTruthy();
    expect(screen.getAllByText("openalex · W1234567890").length).toBeGreaterThan(0);
    const conflictSummary = within(projection).getByRole("status", { name: "conflicts" });
    expect(within(conflictSummary).getByText("2 conflicts")).toBeTruthy();
    expect(within(conflictSummary).getByText("DOI, Open access")).toBeTruthy();
    expect(screen.getByText("DOI conflicts")).toBeTruthy();
    expect(screen.getByText("10.1000/conflicting-doi")).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Open access conflicts" })).toBeTruthy();
    expect(screen.getByRole("heading", { name: "Assertion history" })).toBeTruthy();
    expect(screen.getAllByText("Publication type").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Identifiers").length).toBeGreaterThan(0);
    expect(screen.getAllByText("Open access").length).toBeGreaterThan(0);
  });

  it("opens the route-provided literature selection in the scoped library", async () => {
    // Given: the library route provides a record to inspect immediately.
    const fetchMock = vi.fn<typeof fetch>((input) => {
      return Promise.resolve(String(input).startsWith("/api/literature?")
        ? jsonResponse(listResponse([personalSummary]))
        : jsonResponse(literatureDetail));
    });
    vi.stubGlobal("fetch", fetchMock);

    // When: the scoped library panel loads with that initial record.
    render(<LiteratureLibraryPanel initialLiteratureId={personalSummary.id} scope="personal" />);

    // Then: the provided record is selected and its server detail is visible.
    expect((await screen.findByRole("button", { name: personalSummary.title ?? "" })).getAttribute("aria-pressed")).toBe("true");
    expect(await screen.findByRole("heading", { name: "Literature details" })).toBeTruthy();
  });

  it("localizes open-access assertion values in Simplified Chinese", async () => {
    const closedAccessDetail: GetLiteratureResponse = {
      ...literatureDetail,
      assertions: literatureDetail.assertions?.map((assertion) => assertion.kind === "openAccess"
        ? { ...assertion, value: { isOpenAccess: false } }
        : assertion)
    };
    const fetchMock = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse(listResponse([personalSummary])))
      .mockResolvedValueOnce(jsonResponse(closedAccessDetail));
    vi.stubGlobal("fetch", fetchMock);

    render(<LiteratureLibraryPanel scope="personal" locale="zh-CN" />);
    fireEvent.click(await screen.findByRole("button", { name: personalSummary.title ?? "" }));

    expect(await screen.findByText("非开放获取")).toBeTruthy();
  });

  it("removes stale detail synchronously when the selected literature changes", async () => {
    // Given: the first detail resolves while the second detail request remains pending.
    const pendingSecondDetail = deferred<Response>();
    const commits: string[] = [];
    let panelContainer: HTMLElement | null = null;
    const recordCommit: ProfilerOnRenderCallback = () => {
      commits.push(panelContainer?.textContent ?? "");
    };
    const fetchMock = vi.fn<typeof fetch>((input) => {
      const path = String(input);
      if (path.startsWith("/api/literature?")) {
        return Promise.resolve(jsonResponse(listResponse([personalSummary, secondPersonalSummary])));
      }
      if (path === `/api/literature/${personalSummary.id}`) {
        return Promise.resolve(jsonResponse(literatureDetail));
      }
      if (path === `/api/literature/${secondPersonalSummary.id}`) {
        return pendingSecondDetail.promise;
      }
      return Promise.reject(new Error(`Unexpected request: ${path}`));
    });
    vi.stubGlobal("fetch", fetchMock);

    // When: the user opens the first record, then selects the second record.
    const view = render(
      <Profiler id="literature-library" onRender={recordCommit}>
        <LiteratureLibraryPanel scope="personal" />
      </Profiler>
    );
    panelContainer = view.container;
    fireEvent.click(await screen.findByRole("button", { name: personalSummary.title ?? "" }));
    expect((await screen.findAllByText("A server-provided abstract.")).length).toBeGreaterThan(0);
    commits.length = 0;
    fireEvent.click(screen.getByRole("button", { name: secondPersonalSummary.title ?? "" }));

    // Then: the previous detail is absent while the new request is still pending.
    expect(commits[0]).not.toContain("A server-provided abstract.");
    expect(commits[0]).toContain("Loading literature details...");
    expect(screen.queryAllByText("A server-provided abstract.")).toHaveLength(0);
    expect(screen.getByText("Loading literature details...")).toBeTruthy();
  });

  it("appends the next cursor page without replacing the selected list page", async () => {
    // Given: the first page advertises a next cursor and the second page returns another row.
    const fetchMock = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse(listResponse([personalSummary], "next-cursor")))
      .mockResolvedValueOnce(jsonResponse(listResponse([secondPersonalSummary])));
    vi.stubGlobal("fetch", fetchMock);

    // When: the user requests the next page.
    render(<LiteratureLibraryPanel scope="personal" />);
    fireEvent.click(await screen.findByRole("button", { name: "Load more literature" }));

    // Then: both pages are present and the cursor is sent to the API.
    expect(await screen.findByRole("button", { name: secondPersonalSummary.title ?? "" })).toBeTruthy();
    expect(fetchMock).toHaveBeenLastCalledWith(
      "/api/literature?scope=personal&limit=25&cursor=next-cursor",
      expect.objectContaining({ credentials: "include" })
    );
  });

  it("shows a retryable list error and recovers through the same scoped request", async () => {
    // Given: the initial list request fails before a successful retry response.
    const fetchMock = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse({ error: "Library unavailable" }, 503))
      .mockResolvedValueOnce(jsonResponse(listResponse([])));
    vi.stubGlobal("fetch", fetchMock);

    // When: the user retries after the visible error.
    render(<LiteratureLibraryPanel scope="personal" />);
    fireEvent.click(await screen.findByRole("button", { name: "Retry library load" }));

    // Then: the error is replaced by the resolved empty state.
    expect(await screen.findByRole("heading", { name: "No personal literature" })).toBeTruthy();
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
  });
});
