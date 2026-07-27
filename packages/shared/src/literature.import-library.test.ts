import { describe, expect, it } from "vitest";

import {
  literatureImportFailureCodes,
  literatureImportWarningCodes,
  literatureLibraryDefaultLimit,
  literatureLibraryMaxLimit,
  literatureProviderKeys,
  type CreateLiteratureImportRequest,
  type CreateLiteratureImportResponse,
  type GetLiteratureImportOperationRequest,
  type GetLiteratureImportOperationResponse,
  type ImportOperationDTO,
  type ListLiteratureRequest,
  type ListLiteratureResponse,
  type LiteratureScope,
  type LiteratureSummaryDTO,
  type RetryLiteratureImportOperationRequest,
  type RetryLiteratureImportOperationResponse
} from "./index";

describe("Phase 2 literature import and library contracts", () => {
  it("keeps imports seed-only and models every durable operation status", () => {
    // Given
    const requests = [
      { target: { scope: "personal" }, seed: { providerKey: "openalex", recordKey: "W1" } },
      {
        target: { scope: "project", projectId: "project-1" },
        seed: { providerKey: "crossref", recordKey: "10.1000/phase-two" }
      },
      { target: { scope: "personal" }, seed: { providerKey: "pubmed", recordKey: "12345678" } }
    ] satisfies readonly CreateLiteratureImportRequest[];
    const operationBase = {
      scope: {
        kind: "personal",
        ownerUserId: "user-1"
      } satisfies LiteratureScope,
      createdByUserId: "user-1",
      attemptCount: 1,
      attemptStartedAt: "2026-07-18T00:00:00.000Z",
      takeoverAfter: "2026-07-18T00:00:30.000Z",
      createdAt: "2026-07-18T00:00:00.000Z",
      updatedAt: "2026-07-18T00:00:00.000Z"
    };
    const operations = [
      {
        ...operationBase,
        id: "operation-running",
        status: "running",
        warnings: [],
        failureCode: null,
        literatureId: null,
        finishedAt: null
      },
      {
        ...operationBase,
        id: "operation-succeeded",
        status: "succeeded",
        takeoverAfter: null,
        warnings: ["unpaywall_enrichment_unavailable"],
        failureCode: null,
        literatureId: "literature-1",
        finishedAt: "2026-07-18T00:00:05.000Z"
      },
      {
        ...operationBase,
        id: "operation-failed",
        status: "failed",
        takeoverAfter: null,
        warnings: [],
        failureCode: "identity_conflict",
        literatureId: null,
        finishedAt: "2026-07-18T00:00:05.000Z"
      }
    ] satisfies readonly [ImportOperationDTO, ImportOperationDTO, ImportOperationDTO];
    const responses = {
      create: { operation: operations[0] },
      get: { operation: operations[1] },
      retry: { operation: operations[2] }
    } satisfies {
      readonly create: CreateLiteratureImportResponse;
      readonly get: GetLiteratureImportOperationResponse;
      readonly retry: RetryLiteratureImportOperationResponse;
    };
    const operationRequests = {
      get: { operationId: "operation-succeeded" },
      retry: { operationId: "operation-failed" }
    } satisfies {
      readonly get: GetLiteratureImportOperationRequest;
      readonly retry: RetryLiteratureImportOperationRequest;
    };

    // When
    const operationStatuses = operations.map((operation) => operation.status);

    // Then
    expect(requests.map((request) => request.seed.providerKey)).toEqual([
      "openalex",
      "crossref",
      "pubmed"
    ]);
    expect(operationStatuses).toEqual(["running", "succeeded", "failed"]);
    expect(Object.keys(responses).sort()).toEqual(["create", "get", "retry"]);
    expect(Object.keys(operationRequests).sort()).toEqual(["get", "retry"]);
    expect(literatureImportWarningCodes).toEqual([
      "openalex_enrichment_unavailable",
      "crossref_enrichment_unavailable",
      "pubmed_enrichment_unavailable",
      "pmc_enrichment_unavailable",
      "unpaywall_enrichment_unavailable"
    ]);
    expect(literatureImportFailureCodes).toEqual([
      "provider_unconfigured",
      "seed_not_found",
      "seed_unavailable",
      "invalid_provider_response",
      "identity_conflict",
      "authorization_revoked",
      "persistence_failed",
      "internal_error"
    ]);
  });

  it("models personal and project library pages with opaque cursors", () => {
    // Given
    const requests = [
      { scope: "personal", limit: literatureLibraryDefaultLimit },
      { scope: "project", projectId: "project-1", limit: 50, cursor: "opaque-library-cursor" }
    ] satisfies readonly ListLiteratureRequest[];
    const summary = {
      id: "literature-1",
      scope: { kind: "personal", ownerUserId: "user-1" },
      title: "A title",
      authors: [{ displayName: "Ada Lovelace" }],
      publicationYear: 2026,
      publicationDate: "2026-07-18",
      venue: "Jixia Journal",
      doi: "10.1000/phase-two",
      openAccess: { isOpenAccess: true },
      publisher: { name: "Jixia Press" },
      provenanceCount: 3,
      conflictKinds: ["doi"],
      createdAt: "2026-07-18T00:00:00.000Z",
      updatedAt: "2026-07-18T00:00:05.000Z"
    } satisfies LiteratureSummaryDTO;
    const response = {
      literature: [summary],
      nextCursor: "opaque-next-library-cursor"
    } satisfies ListLiteratureResponse;

    // When
    const scopes = requests.map((request) => request.scope);

    // Then
    expect(scopes).toEqual(["personal", "project"]);
    expect(response.nextCursor).toBe("opaque-next-library-cursor");
    expect(response.literature[0]?.conflictKinds).toEqual(["doi"]);
    expect(literatureLibraryMaxLimit).toBe(50);
    expect(literatureProviderKeys).toEqual([
      "openalex",
      "crossref",
      "pubmed",
      "pmc",
      "unpaywall"
    ]);
  });
});
