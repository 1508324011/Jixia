import type { LiteratureDiscoveryCandidateDTO } from "@jixia/shared";
import { cleanup, fireEvent, render, screen, waitFor, within } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { LiteratureSearchPage } from "./LiteratureSearchPage";
import {
  candidate,
  candidateWithoutOpenAccess,
  deferred,
  errorResponse,
  expiredRunningOperation,
  failedOperation,
  jsonResponse,
  mockFetchSequence,
  project,
  runningOperation,
  searchResponse,
  submitQuery,
  succeededOperation
} from "./LiteratureSearchPage.test-fixture";

describe("LiteratureSearchPage", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("shows initial, loading, empty, and error states through the native form", async () => {
    const pendingSearch = deferred<Response>();
    const fetchMock = vi.fn<typeof fetch>()
      .mockReturnValueOnce(pendingSearch.promise)
      .mockResolvedValueOnce(errorResponse("Discovery service unavailable"));
    vi.stubGlobal("fetch", fetchMock);

    render(<LiteratureSearchPage onOpenLiterature={vi.fn()} />);
    expect(screen.getByText("Start with a research question")).toBeTruthy();
    expect(screen.getByTestId("literature-target-personal")).toBeTruthy();

    fireEvent.change(screen.getByTestId("literature-search-query"), { target: { value: "evidence synthesis" } });
    fireEvent.submit(screen.getByTestId("literature-search-submit").closest("form") ?? document.createElement("form"));
    expect(await screen.findByText("Searching literature…")).toBeTruthy();

    pendingSearch.resolve(jsonResponse(searchResponse()));
    expect(await screen.findByText("No matching literature records")).toBeTruthy();
    submitQuery("unavailable");
    expect(await screen.findByText("Discovery service unavailable")).toBeTruthy();
  });

  it("keeps partial provider warnings visible while paging results", async () => {
    const nextCandidate = { ...candidate, title: "Next page result" };
    const fetchMock = mockFetchSequence(
      searchResponse({
        candidates: [candidate],
        nextCursor: "cursor-2",
        providerStatuses: [
          { providerKey: "openalex", status: "succeeded", resultCount: 1 },
          { providerKey: "crossref", status: "rate_limited", retryAfterSeconds: 30 }
        ]
      }),
      searchResponse({ candidates: [nextCandidate] })
    );

    render(<LiteratureSearchPage onOpenLiterature={vi.fn()} />);
    submitQuery("evidence synthesis");
    expect(await screen.findByText(candidate.title ?? "")).toBeTruthy();
    expect(screen.getByRole("status").textContent).toMatch(/Openalex returned 1 result/i);
    expect(screen.getAllByRole("alert").length).toBeGreaterThan(0);
    expect(screen.getByText(/Crossref is rate limited/i)).toBeTruthy();

    fireEvent.click(screen.getByRole("button", { name: "Next page" }));
    expect(await screen.findByText("Next page result")).toBeTruthy();
    expect(JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body))).toEqual({
      cursor: "cursor-2",
      limit: 20,
      query: "evidence synthesis"
    });
  });

  it("distinguishes open, closed, and unavailable access states", async () => {
    // Given: discovery returns explicit open, explicit closed, and unknown access metadata.
    const closedCandidate = {
      ...candidate,
      title: "Closed access result",
      openAccess: { isOpenAccess: false },
      sourceMatches: [{ providerKey: "crossref", recordKey: "10.1000/closed", providerRank: 1 }]
    } satisfies LiteratureDiscoveryCandidateDTO;
    const unknownCandidate = candidateWithoutOpenAccess();
    const fetchMock = mockFetchSequence(searchResponse({ candidates: [candidate, closedCandidate, unknownCandidate] }));

    // When: the user searches for the three records.
    render(<LiteratureSearchPage onOpenLiterature={vi.fn()} />);
    submitQuery("access states");

    // Then: each result communicates its actual access state without collapsing closed into unknown.
    expect(within(await screen.findByRole("button", { name: candidate.title ?? "" })).getByText("Open access")).toBeTruthy();
    expect(within(screen.getByRole("button", { name: closedCandidate.title ?? "" })).getByText("Not open access")).toBeTruthy();
    expect(within(screen.getByRole("button", { name: unknownCandidate.title ?? "" })).getByText("Access status unavailable")).toBeTruthy();
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  it("loads a project target and imports the selected source with one idempotency key", async () => {
    const onOpenLiterature = vi.fn();
    const fetchMock = mockFetchSequence(
      searchResponse({ candidates: [candidate] }),
      { projects: [project] },
      { operation: succeededOperation() }
    );

    render(<LiteratureSearchPage onOpenLiterature={onOpenLiterature} />);
    submitQuery("evidence synthesis");
    await screen.findByText(candidate.title ?? "");
    const result = screen.getByRole("button", { name: candidate.title ?? "" });
    result.focus();
    fireEvent.keyDown(result, { key: "Enter" });
    expect(result.getAttribute("aria-pressed")).toBe("true");
    fireEvent.click(screen.getByTestId("literature-target-project"));
    expect(await screen.findByText("Loading projects…")).toBeTruthy();
    expect(await screen.findByRole("option", { name: project.name })).toBeTruthy();
    fireEvent.change(screen.getByTestId("literature-project-selector"), { target: { value: project.id } });
    fireEvent.click(screen.getByTestId("literature-import-submit"));

    await waitFor(() => expect(onOpenLiterature).toHaveBeenCalledWith("literature-1", { scope: "personal" }));
    const importInit = fetchMock.mock.calls[2]?.[1];
    expect(JSON.parse(String(importInit?.body))).toEqual({
      seed: { providerKey: "openalex", recordKey: "W123" },
      target: { projectId: "project-1", scope: "project" }
    });
    expect(new Headers(importInit?.headers).get("Idempotency-Key")).toMatch(/^[0-9a-f-]{36}$/i);
  });

  it("reuses the import intent idempotency key after a transport failure", async () => {
    const onOpenLiterature = vi.fn();
    const fetchMock = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse(searchResponse({ candidates: [candidate] })))
      .mockRejectedValueOnce(new Error("Connection interrupted"))
      .mockResolvedValueOnce(jsonResponse({ operation: succeededOperation() }));
    vi.stubGlobal("fetch", fetchMock);

    render(<LiteratureSearchPage onOpenLiterature={onOpenLiterature} />);
    submitQuery("evidence synthesis");
    fireEvent.click(await screen.findByRole("button", { name: candidate.title ?? "" }));
    fireEvent.click(screen.getByTestId("literature-import-submit"));
    expect(await screen.findByText("Connection interrupted")).toBeTruthy();
    expect(screen.getByRole("alert").textContent).toContain("Connection interrupted");
    fireEvent.click(screen.getByTestId("literature-import-submit"));

    await waitFor(() => expect(onOpenLiterature).toHaveBeenCalledWith("literature-1", { scope: "personal" }));
    const firstKey = new Headers(fetchMock.mock.calls[1]?.[1]?.headers).get("Idempotency-Key");
    const replayKey = new Headers(fetchMock.mock.calls[2]?.[1]?.headers).get("Idempotency-Key");
    expect(firstKey).toMatch(/^[0-9a-f-]{36}$/i);
    expect(replayKey).toBe(firstKey);
  });

  it("passes successful partial-import warnings to destination navigation", async () => {
    // Given: the import succeeds after one enrichment provider becomes unavailable.
    const onOpenLiterature = vi.fn();
    mockFetchSequence(
      searchResponse({ candidates: [candidate] }),
      { operation: succeededOperation(["unpaywall_enrichment_unavailable"]) }
    );
    render(<LiteratureSearchPage onOpenLiterature={onOpenLiterature} />);
    submitQuery("partial enrichment");
    fireEvent.click(await screen.findByRole("button", { name: candidate.title ?? "" }));

    // When: the user imports the selected provider record.
    fireEvent.click(screen.getByTestId("literature-import-submit"));

    // Then: navigation receives the exact warning code with the imported record identity.
    await waitFor(() => expect(onOpenLiterature).toHaveBeenCalledWith(
      "literature-1",
      { scope: "personal" },
      ["unpaywall_enrichment_unavailable"]
    ));
  });

  it("shows running import progress and retries a failed operation without an idempotency key", async () => {
    const onOpenLiterature = vi.fn();
    const fetchMock = mockFetchSequence(
      searchResponse({ candidates: [candidate] }),
      { operation: runningOperation() },
      { operation: failedOperation() },
      { operation: succeededOperation() }
    );

    render(<LiteratureSearchPage onOpenLiterature={onOpenLiterature} />);
    submitQuery("evidence synthesis");
    await screen.findByText(candidate.title ?? "");
    fireEvent.click(screen.getByRole("button", { name: candidate.title ?? "" }));
    fireEvent.click(screen.getByTestId("literature-import-submit"));
    expect(await screen.findByText(/Importing selected literature/i)).toBeTruthy();
    expect(await screen.findByText(/Import failed: seed_not_found/i)).toBeTruthy();
    fireEvent.click(screen.getByTestId("literature-import-retry"));

    await waitFor(() => expect(onOpenLiterature).toHaveBeenCalledWith("literature-1", { scope: "personal" }));
    const retryInit = fetchMock.mock.calls[3]?.[1];
    expect(retryInit?.body).toBeUndefined();
    expect(new Headers(retryInit?.headers).has("Idempotency-Key")).toBe(false);
  });

  it("keeps polling a running import after a transient progress failure", async () => {
    const onOpenLiterature = vi.fn();
    const fetchMock = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse(searchResponse({ candidates: [candidate] })))
      .mockResolvedValueOnce(jsonResponse({ operation: runningOperation() }))
      .mockRejectedValueOnce(new Error("Temporary progress failure"))
      .mockResolvedValueOnce(jsonResponse({ operation: succeededOperation() }));
    vi.stubGlobal("fetch", fetchMock);

    render(<LiteratureSearchPage onOpenLiterature={onOpenLiterature} />);
    submitQuery("evidence synthesis");
    fireEvent.click(await screen.findByRole("button", { name: candidate.title ?? "" }));
    fireEvent.click(screen.getByTestId("literature-import-submit"));

    expect(await screen.findByText("Temporary progress failure")).toBeTruthy();
    await waitFor(() => expect(onOpenLiterature).toHaveBeenCalledWith("literature-1", { scope: "personal" }), { timeout: 1_500 });
  });

  it("offers explicit recovery when a running import lease has expired", async () => {
    const onOpenLiterature = vi.fn();
    const fetchMock = mockFetchSequence(
      searchResponse({ candidates: [candidate] }),
      { operation: expiredRunningOperation() },
      { operation: succeededOperation() }
    );

    render(<LiteratureSearchPage onOpenLiterature={onOpenLiterature} />);
    submitQuery("evidence synthesis");
    fireEvent.click(await screen.findByRole("button", { name: candidate.title ?? "" }));
    fireEvent.click(screen.getByTestId("literature-import-submit"));

    const retry = await screen.findByTestId("literature-import-retry");
    expect(screen.getAllByRole("alert")).toHaveLength(1);
    fireEvent.click(retry);

    await waitFor(() => expect(onOpenLiterature).toHaveBeenCalledWith("literature-1", { scope: "personal" }));
    expect(fetchMock.mock.calls[2]?.[0]).toBe("/api/literature/imports/operation-1/retry");
  });

  it("aborts a stale search and leaves only the newest result visible", async () => {
    const firstSearch = deferred<Response>();
    const fetchMock = vi.fn<typeof fetch>()
      .mockReturnValueOnce(firstSearch.promise)
      .mockResolvedValueOnce(jsonResponse(searchResponse({ candidates: [{ ...candidate, title: "Newest result" }] })));
    vi.stubGlobal("fetch", fetchMock);

    render(<LiteratureSearchPage onOpenLiterature={vi.fn()} />);
    submitQuery("first query");
    const firstSignal = fetchMock.mock.calls[0]?.[1]?.signal;
    submitQuery("second query");
    expect(await screen.findByText("Newest result")).toBeTruthy();
    expect(firstSignal?.aborted).toBe(true);

    firstSearch.resolve(jsonResponse(searchResponse({ candidates: [candidate] })));
    await waitFor(() => expect(screen.queryByText(candidate.title ?? "")).toBeNull());
  });
});
