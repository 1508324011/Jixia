import { describe, expect, it } from "vitest";

import * as literatureContract from "./literature";
import {
  assertionKindOrder,
  assertionKinds,
  providerKeyMaxLength,
  providerRecordKeyMaxLength,
  relationKinds,
  type AppendLiteratureAssertionsRequest,
  type AppendLiteratureAssertionsResponse,
  type CreateLiteratureRequest,
  type CreateLiteratureResponse,
  type GetLiteratureResponse
} from "./index";

describe("literature contracts", () => {
  it("exposes the closed assertion vocabulary in replay order", () => {
    // Given
    const expectedKinds = ["title", "abstract", "publicationYear", "doi"];

    // When
    const orderedKinds = [...assertionKinds].sort(
      (left, right) => assertionKindOrder[left] - assertionKindOrder[right]
    );

    // Then
    expect(orderedKinds).toEqual(expectedKinds);
  });

  it("exposes only the Phase 1 relation vocabulary", () => {
    // Given
    const expectedKinds = ["cites"];

    // When
    const actualKinds = [...relationKinds];

    // Then
    expect(actualKinds).toEqual(expectedKinds);
  });

  it("represents create scope without caller-supplied ownership identifiers", () => {
    // Given
    const personalRequest = { scope: "personal" } satisfies CreateLiteratureRequest;
    const projectRequest = {
      scope: "project",
      projectId: "project-1"
    } satisfies CreateLiteratureRequest;

    // When
    const requests: readonly CreateLiteratureRequest[] = [personalRequest, projectRequest];

    // Then
    expect(requests).toEqual([
      { scope: "personal" },
      { scope: "project", projectId: "project-1" }
    ]);
  });

  it("exposes database-aligned provider identity limits", () => {
    // Given
    const expectedLimits = { providerKey: 128, recordKey: 512 };

    // When
    const actualLimits = {
      providerKey: providerKeyMaxLength,
      recordKey: providerRecordKeyMaxLength
    };

    // Then
    expect(actualLimits).toEqual(expectedLimits);
  });

  it("preserves the Phase 1 create, manual append, and get transport shapes", () => {
    // Given
    const createdAt = "2026-07-18T00:00:00.000Z";
    const literature = {
      id: "literature-1",
      scope: { kind: "personal", ownerUserId: "user-1" },
      createdByUserId: "user-1",
      createdAt
    } satisfies CreateLiteratureResponse["literature"];
    const providerRecord = {
      id: "provider-record-1",
      literatureId: literature.id,
      providerKey: "manual",
      recordKey: "record-1",
      createdByUserId: "user-1",
      createdAt
    };
    const createRequest = { scope: "personal" } satisfies CreateLiteratureRequest;
    const createResponse = { literature } satisfies CreateLiteratureResponse;
    const appendRequest = {
      provider: { providerKey: "manual", recordKey: "record-1" },
      assertions: [
        { kind: "title", value: "A title" },
        { kind: "abstract", value: "An abstract" },
        { kind: "publicationYear", value: 2026 },
        { kind: "doi", value: "10.1000/phase-one" }
      ]
    } satisfies AppendLiteratureAssertionsRequest;
    const appendResponse = {
      literatureId: literature.id,
      providerRecord,
      assertions: [
        {
          assertionId: "assertion-1",
          providerRecordId: providerRecord.id,
          ordinal: 1,
          kind: "title",
          value: "A title"
        }
      ]
    } satisfies AppendLiteratureAssertionsResponse;
    const getResponse = {
      literature,
      providerRecords: [providerRecord],
      projection: {
        title: { current: null, history: [], conflicts: [] },
        abstract: { current: null, history: [], conflicts: [] },
        publicationYear: { current: null, history: [], conflicts: [] },
        doi: { current: null, history: [], conflicts: [] },
        publicationDate: { current: null, history: [], conflicts: [] },
        venue: { current: null, history: [], conflicts: [] },
        publicationType: { current: null, history: [], conflicts: [] },
        authors: { current: null, history: [], conflicts: [] },
        identifiers: { current: null, history: [], conflicts: [] },
        openAccess: { current: null, history: [], conflicts: [] },
        publisher: { current: null, history: [], conflicts: [] }
      },
      conflictKinds: []
    } satisfies GetLiteratureResponse;

    // When
    const shapes = {
      editableKinds: appendRequest.assertions.map((assertion) => assertion.kind),
      createRequest: Object.keys(createRequest).sort(),
      createResponse: Object.keys(createResponse).sort(),
      literature: Object.keys(literature).sort(),
      appendRequest: Object.keys(appendRequest).sort(),
      appendResponse: Object.keys(appendResponse).sort(),
      getResponse: Object.keys(getResponse).sort(),
      projection: Object.keys(getResponse.projection).sort()
    };

    // Then
    expect(shapes).toEqual({
      editableKinds: ["title", "abstract", "publicationYear", "doi"],
      createRequest: ["scope"],
      createResponse: ["literature"],
      literature: ["createdAt", "createdByUserId", "id", "scope"],
      appendRequest: ["assertions", "provider"],
      appendResponse: ["assertions", "literatureId", "providerRecord"],
      getResponse: ["conflictKinds", "literature", "projection", "providerRecords"],
      projection: [
        "abstract",
        "authors",
        "doi",
        "identifiers",
        "openAccess",
        "publicationDate",
        "publicationType",
        "publicationYear",
        "publisher",
        "title",
        "venue"
      ]
    });
  });

  it("exposes every closed Phase 2 literature contract vocabulary", () => {
    // Given
    const requiredContractExports = [
      "canonicalAssertionKinds",
      "literatureIdentifierSchemes",
      "literatureProviderKeys",
      "literatureSearchProviderKeys",
      "literatureImportSeedProviderKeys",
      "literatureDiscoveryProviderStatuses",
      "literatureImportOperationStatuses",
      "literatureImportWarningCodes",
      "literatureImportFailureCodes",
      "literatureDiscoveryDefaultLimit",
      "literatureDiscoveryMinLimit",
      "literatureDiscoveryMaxLimit",
      "literatureLibraryDefaultLimit",
      "literatureLibraryMaxLimit"
    ];

    // When
    const moduleExports = Object.keys(literatureContract);
    const missingContracts = requiredContractExports.filter(
      (contractName) => !moduleExports.includes(contractName)
    );

    // Then
    expect(missingContracts).toEqual([]);
  });
});
