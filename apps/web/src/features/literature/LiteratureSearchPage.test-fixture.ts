import type {
  ImportOperationDTO,
  LiteratureDiscoveryCandidateDTO,
  LiteratureDiscoverySearchResponse,
  ProjectDTO
} from "@jixia/shared";
import { fireEvent, screen } from "@testing-library/react";
import { vi } from "vitest";

export const candidate: LiteratureDiscoveryCandidateDTO = {
  title: "A long-lived study of precise research discovery",
  abstract: "A compact abstract for the selected discovery record.",
  publicationYear: 2026,
  publicationDate: "2026-01-14",
  venue: "Journal of Evidence Systems",
  publicationType: "article",
  doi: "10.1000/jixia.research.discovery.2026.001",
  authors: [{ displayName: "Ada Researcher" }],
  identifiers: [{ scheme: "doi", value: "10.1000/jixia.research.discovery.2026.001" }],
  openAccess: { isOpenAccess: true },
  publisher: { name: "Jixia Press" },
  sourceMatches: [{ providerKey: "openalex", recordKey: "W123", providerRank: 1 }]
};

export const project: ProjectDTO = {
  id: "project-1",
  spaceId: "space-1",
  name: "Long project name for a research synthesis",
  createdByUserId: "user-1",
  createdAt: "2026-07-20T10:00:00.000Z",
  updatedAt: "2026-07-20T10:00:00.000Z"
};

export function submitQuery(query: string): void {
  fireEvent.change(screen.getByTestId("literature-search-query"), { target: { value: query } });
  fireEvent.submit(screen.getByTestId("literature-search-submit").closest("form") ?? document.createElement("form"));
}

export function searchResponse(overrides: Partial<LiteratureDiscoverySearchResponse> = {}): LiteratureDiscoverySearchResponse {
  return {
    candidates: [],
    nextCursor: null,
    providerStatuses: [{ providerKey: "openalex", status: "succeeded", resultCount: 0 }],
    ...overrides
  };
}

export function runningOperation(): ImportOperationDTO {
  return {
    ...operationBase,
    id: "operation-1",
    status: "running",
    takeoverAfter: "2099-01-01T00:00:00.000Z",
    literatureId: null,
    failureCode: null,
    finishedAt: null
  };
}

export function failedOperation(): ImportOperationDTO {
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

export function expiredRunningOperation(): ImportOperationDTO {
  return {
    ...operationBase,
    id: "operation-1",
    status: "running",
    takeoverAfter: "2020-01-01T00:00:00.000Z",
    literatureId: null,
    failureCode: null,
    finishedAt: null
  };
}

export function succeededOperation(warnings: ImportOperationDTO["warnings"] = []): ImportOperationDTO {
  return {
    ...operationBase,
    id: "operation-1",
    status: "succeeded",
    takeoverAfter: null,
    literatureId: "literature-1",
    failureCode: null,
    finishedAt: "2026-07-20T10:01:00.000Z",
    warnings
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

export function candidateWithoutOpenAccess(): LiteratureDiscoveryCandidateDTO {
  return {
    title: "Unknown access result",
    abstract: candidate.abstract,
    publicationYear: candidate.publicationYear,
    publicationDate: candidate.publicationDate,
    venue: candidate.venue,
    publicationType: candidate.publicationType,
    doi: "10.1000/unknown-access",
    authors: candidate.authors,
    identifiers: [{ scheme: "doi", value: "10.1000/unknown-access" }],
    openAccess: null,
    publisher: candidate.publisher,
    sourceMatches: [{ providerKey: "pubmed", recordKey: "12345678", providerRank: 1 }]
  };
}

export function mockFetchSequence(...payloads: readonly unknown[]) {
  const fetchMock = vi.fn<typeof fetch>();
  for (const payload of payloads) fetchMock.mockResolvedValueOnce(jsonResponse(payload));
  vi.stubGlobal("fetch", fetchMock);
  return fetchMock;
}

export function jsonResponse(payload: unknown): Response {
  return new Response(JSON.stringify(payload), { status: 200, headers: { "Content-Type": "application/json" } });
}

export function errorResponse(message: string): Response {
  return new Response(JSON.stringify({ error: message }), { status: 503, headers: { "Content-Type": "application/json" } });
}

export function deferred<T>() {
  let resolve: ((value: T) => void) | null = null;
  const promise = new Promise<T>((nextResolve) => { resolve = nextResolve; });
  return {
    promise,
    resolve(value: T): void {
      resolve?.(value);
    }
  };
}
