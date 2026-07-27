import type {
  ImportOperationDTO,
  LiteratureDiscoveryCandidateDTO,
  LiteratureDiscoverySearchResponse,
  LiteratureTargetScope,
  ProjectDTO
} from "@jixia/shared";
import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";

import { LiteratureSearchPage } from "./LiteratureSearchPage";

const candidate: LiteratureDiscoveryCandidateDTO = {
  title: "Regression literature candidate",
  abstract: "A candidate used to lock literature workflow behavior.",
  publicationYear: 2026,
  publicationDate: "2026-07-20",
  venue: "Journal of Regression Evidence",
  publicationType: "article",
  doi: "10.1000/regression",
  authors: [{ displayName: "Test Researcher" }],
  identifiers: [{ scheme: "doi", value: "10.1000/regression" }],
  openAccess: { isOpenAccess: true },
  publisher: { name: "Jixia Press" },
  sourceMatches: [{ providerKey: "openalex", recordKey: "W-REGRESSION", providerRank: 1 }]
};

const project: ProjectDTO = {
  id: "project-regression",
  spaceId: "space-regression",
  name: "Regression project",
  createdByUserId: "user-1",
  createdAt: "2026-07-20T10:00:00.000Z",
  updatedAt: "2026-07-20T10:00:00.000Z"
};

describe("LiteratureSearchPage regressions", () => {
  afterEach(() => {
    cleanup();
    vi.unstubAllGlobals();
    vi.restoreAllMocks();
  });

  it("passes the project target with a successful import callback", async () => {
    // Given: a project target and a successful import response.
    const onOpenLiterature = vi.fn<(literatureId: string, target: LiteratureTargetScope) => void>();
    const fetchMock = mockFetchSequence(
      searchResponse({ candidates: [candidate] }),
      { projects: [project] },
        { operation: succeededOperation({ kind: "project", projectId: project.id }) }
    );

    // When: the selected candidate is imported into that project.
    render(<LiteratureSearchPage onOpenLiterature={onOpenLiterature} />);
    submitQuery("project import");
    fireEvent.click(await screen.findByRole("button", { name: candidate.title ?? "" }));
    fireEvent.click(screen.getByTestId("literature-target-project"));
    await screen.findByRole("option", { name: project.name });
    fireEvent.change(screen.getByTestId("literature-project-selector"), { target: { value: project.id } });
    fireEvent.click(screen.getByTestId("literature-import-submit"));

    // Then: navigation receives the authoritative target scope with the literature ID.
    await waitFor(() => expect(onOpenLiterature).toHaveBeenCalledWith("literature-1", { scope: "project", projectId: project.id }));
    expect(JSON.parse(String(fetchMock.mock.calls[2]?.[1]?.body))).toEqual({
      seed: { providerKey: "openalex", recordKey: "W-REGRESSION" },
      target: { scope: "project", projectId: project.id }
    });
  });

  it("cancels a retry when a new search resets the import intent", async () => {
    // Given: a failed import followed by a deferred retry response.
    const onOpenLiterature = vi.fn();
    const retryResponse = deferred<Response>();
    const fetchMock = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse(searchResponse({ candidates: [candidate] })))
      .mockResolvedValueOnce(jsonResponse({ operation: failedOperation() }))
      .mockReturnValueOnce(retryResponse.promise)
      .mockResolvedValueOnce(jsonResponse(searchResponse({ candidates: [{ ...candidate, title: "New search result" }] })));
    vi.stubGlobal("fetch", fetchMock);

    // When: the user retries and immediately submits a new search.
    render(<LiteratureSearchPage onOpenLiterature={onOpenLiterature} />);
    submitQuery("first search");
    fireEvent.click(await screen.findByRole("button", { name: candidate.title ?? "" }));
    fireEvent.click(screen.getByTestId("literature-import-submit"));
    await screen.findByTestId("literature-import-retry");
    fireEvent.click(screen.getByTestId("literature-import-retry"));
    const retrySignal = fetchMock.mock.calls[2]?.[1]?.signal;
    submitQuery("new search");

    // Then: the obsolete retry is aborted and cannot navigate after it resolves.
    expect(retrySignal).toBeDefined();
    expect(retrySignal?.aborted).toBe(true);
    retryResponse.resolve(jsonResponse({ operation: succeededOperation() }));
    await screen.findByText("New search result");
    expect(onOpenLiterature).not.toHaveBeenCalled();
  });

  it("keeps the first page visible when a next-page request fails", async () => {
    // Given: a first page with a cursor and a failed next-page request.
    const fetchMock = vi.fn<typeof fetch>()
      .mockResolvedValueOnce(jsonResponse(searchResponse({ candidates: [candidate], nextCursor: "cursor-2" })))
      .mockRejectedValueOnce(new Error("Next page unavailable"));
    vi.stubGlobal("fetch", fetchMock);

    // When: the user requests the next page.
    render(<LiteratureSearchPage onOpenLiterature={vi.fn()} />);
    submitQuery("paged search");
    await screen.findByRole("button", { name: candidate.title ?? "" });
    fireEvent.click(screen.getByRole("button", { name: "Next page" }));

    // Then: the page error is visible without destroying the existing candidate.
    expect(await screen.findByText("Next page unavailable")).toBeTruthy();
    expect(screen.getByRole("button", { name: candidate.title ?? "" })).toBeTruthy();
  });
});

function submitQuery(query: string): void {
  fireEvent.change(screen.getByTestId("literature-search-query"), { target: { value: query } });
  fireEvent.submit(screen.getByTestId("literature-search-submit").closest("form") ?? document.createElement("form"));
}

function searchResponse(overrides: Partial<LiteratureDiscoverySearchResponse> = {}): LiteratureDiscoverySearchResponse {
  return {
    candidates: [],
    nextCursor: null,
    providerStatuses: [{ providerKey: "openalex", status: "succeeded", resultCount: 0 }],
    ...overrides
  };
}

function succeededOperation(scope: ImportOperationDTO["scope"] = operationBase.scope): ImportOperationDTO {
  return {
    ...operationBase,
    id: "operation-1",
    scope,
    status: "succeeded",
    takeoverAfter: null,
    literatureId: "literature-1",
    failureCode: null,
    finishedAt: "2026-07-20T10:01:00.000Z"
  };
}

function failedOperation(): ImportOperationDTO {
  return {
    ...operationBase,
    id: "operation-1",
    status: "failed",
    takeoverAfter: null,
    literatureId: null,
    failureCode: "seed_not_found",
    finishedAt: "2026-07-20T10:01:00.000Z"
  };
}

const operationBase = {
  scope: { kind: "personal" as const, ownerUserId: "user-1" },
  createdByUserId: "user-1",
  attemptCount: 1,
  attemptStartedAt: "2026-07-20T10:00:00.000Z",
  warnings: [],
  createdAt: "2026-07-20T10:00:00.000Z",
  updatedAt: "2026-07-20T10:00:00.000Z"
};

function mockFetchSequence(...payloads: readonly unknown[]) {
  const fetchMock = vi.fn<typeof fetch>();
  for (const payload of payloads) fetchMock.mockResolvedValueOnce(jsonResponse(payload));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

function jsonResponse(payload: unknown): Response {
  return new Response(JSON.stringify(payload), { status: 200, headers: { "Content-Type": "application/json" } });
}

function deferred<T>() {
  let resolve: ((value: T) => void) | null = null;
  const promise = new Promise<T>((nextResolve) => { resolve = nextResolve; });
  return {
    promise,
    resolve(value: T): void {
      resolve?.(value);
    }
  };
}
