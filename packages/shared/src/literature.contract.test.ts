import { describe, expect, it } from "vitest";

import {
  assertionKinds,
  type AppendLiteratureAssertionsRequest,
  type AppendLiteratureAssertionsResponse,
  type CreateLiteratureImportRequest,
  type CreateLiteratureImportResponse,
  type CreateLiteratureRequest,
  type CreateLiteratureResponse,
  type GetLiteratureImportOperationRequest,
  type GetLiteratureImportOperationResponse,
  type GetLiteratureResponse,
  type ImportOperationDTO,
  type ListLiteratureRequest,
  type ListLiteratureResponse,
  type LiteratureAssertionDTO,
  type LiteratureAssertionHistoryDTO,
  type LiteratureAssertionInput,
  type LiteratureAuthorValue,
  type LiteratureDiscoveryCandidateDTO,
  type LiteratureDiscoveryProviderStatusDTO,
  type LiteratureDiscoverySearchRequest,
  type LiteratureDiscoverySearchResponse,
  type LiteratureDiscoverySourceMatchDTO,
  type LiteratureDTO,
  type LiteratureFieldProjectionDTO,
  type LiteratureIdentifierValue,
  type LiteratureImportSeed,
  type LiteratureOpenAccessValue,
  type LiteratureProjectionDTO,
  type LiteraturePublisherValue,
  type LiteratureScope,
  type LiteratureSourceIdentity,
  type LiteratureSummaryDTO,
  type LiteratureTargetScope,
  type ProjectedAssertionValueDTO,
  type ProviderIdentity,
  type ProviderRecordDTO,
  type RetryLiteratureImportOperationRequest,
  type RetryLiteratureImportOperationResponse
} from "./index";

type Equal<TLeft, TRight> = (<TValue>() => TValue extends TLeft ? 1 : 2) extends <
  TValue
>() => TValue extends TRight ? 1 : 2
  ? (<TValue>() => TValue extends TRight ? 1 : 2) extends <TValue>() =>
      TValue extends TLeft ? 1 : 2
    ? true
    : false
  : false;
type Expect<TValue extends true> = TValue;
type KeysOfUnion<TValue> = TValue extends unknown ? keyof TValue : never;

type ManualAssertionKind = "title" | "abstract" | "publicationYear" | "doi";
type CanonicalHistoryKind =
  | ManualAssertionKind
  | "publicationDate"
  | "venue"
  | "publicationType"
  | "authors"
  | "identifiers"
  | "openAccess"
  | "publisher";
type ImportOperationStatus = "running" | "succeeded" | "failed";
type ForbiddenPublicField =
  | "rawPayload"
  | "providerPayload"
  | "providerResponse"
  | "responseBody"
  | "apiKey"
  | "secret"
  | "credentials"
  | "headers";

type GuardedPublicDTO =
  | AppendLiteratureAssertionsRequest
  | AppendLiteratureAssertionsResponse
  | CreateLiteratureImportRequest
  | CreateLiteratureImportResponse
  | CreateLiteratureRequest
  | CreateLiteratureResponse
  | GetLiteratureImportOperationRequest
  | GetLiteratureImportOperationResponse
  | GetLiteratureResponse
  | ImportOperationDTO
  | ListLiteratureRequest
  | ListLiteratureResponse
  | LiteratureAssertionDTO
  | LiteratureAssertionHistoryDTO
  | LiteratureAssertionInput
  | LiteratureAuthorValue
  | LiteratureDiscoveryCandidateDTO
  | LiteratureDiscoveryProviderStatusDTO
  | LiteratureDiscoverySearchRequest
  | LiteratureDiscoverySearchResponse
  | LiteratureDiscoverySourceMatchDTO
  | LiteratureDTO
  | LiteratureFieldProjectionDTO<string>
  | LiteratureIdentifierValue
  | LiteratureImportSeed
  | LiteratureOpenAccessValue
  | LiteratureProjectionDTO
  | LiteraturePublisherValue
  | LiteratureScope
  | LiteratureSourceIdentity
  | LiteratureSummaryDTO
  | LiteratureTargetScope
  | ProjectedAssertionValueDTO<string>
  | ProviderIdentity
  | ProviderRecordDTO
  | RetryLiteratureImportOperationRequest
  | RetryLiteratureImportOperationResponse;

type ForbiddenPublicFieldOverlap = KeysOfUnion<GuardedPublicDTO> & ForbiddenPublicField;
type CandidateKey =
  | "title"
  | "abstract"
  | "publicationYear"
  | "publicationDate"
  | "venue"
  | "publicationType"
  | "doi"
  | "authors"
  | "identifiers"
  | "openAccess"
  | "publisher"
  | "sourceMatches";
type ImportOperationKey =
  | "id"
  | "scope"
  | "createdByUserId"
  | "attemptCount"
  | "attemptStartedAt"
  | "takeoverAfter"
  | "warnings"
  | "createdAt"
  | "updatedAt"
  | "status"
  | "literatureId"
  | "failureCode"
  | "finishedAt";
type LiteratureSummaryKey =
  | "id"
  | "scope"
  | "title"
  | "authors"
  | "publicationYear"
  | "publicationDate"
  | "venue"
  | "doi"
  | "openAccess"
  | "publisher"
  | "provenanceCount"
  | "conflictKinds"
  | "createdAt"
  | "updatedAt";

export type LiteratureContractProofs = readonly [
  Expect<Equal<LiteratureAssertionInput["kind"], ManualAssertionKind>>,
  Expect<Equal<LiteratureAssertionHistoryDTO["kind"], CanonicalHistoryKind>>,
  Expect<Equal<ImportOperationDTO["status"], ImportOperationStatus>>,
  Expect<Equal<keyof CreateLiteratureImportRequest, "target" | "seed">>,
  Expect<Equal<KeysOfUnion<CreateLiteratureImportRequest["target"]>, "scope" | "projectId">>,
  Expect<Equal<keyof CreateLiteratureImportRequest["seed"], "providerKey" | "recordKey">>,
  Expect<Equal<ForbiddenPublicFieldOverlap, never>>,
  Expect<
    Equal<
      KeysOfUnion<LiteratureAssertionHistoryDTO>,
      "assertionId" | "providerRecordId" | "ordinal" | "kind" | "value"
    >
  >,
  Expect<Equal<keyof LiteratureAuthorValue, "displayName" | "orcid">>,
  Expect<Equal<keyof LiteratureIdentifierValue, "scheme" | "value">>,
  Expect<
    Equal<
      keyof LiteratureOpenAccessValue,
      "isOpenAccess" | "bestUrl" | "license" | "version" | "hostType"
    >
  >,
  Expect<Equal<KeysOfUnion<LiteraturePublisherValue>, "name" | "landingPageUrl">>,
  Expect<Equal<keyof ProviderIdentity, "providerKey" | "recordKey">>,
  Expect<Equal<keyof LiteratureSourceIdentity, "providerKey" | "recordKey">>,
  Expect<
    Equal<
      keyof ProviderRecordDTO,
      "providerKey" | "recordKey" | "id" | "literatureId" | "createdByUserId" | "createdAt"
    >
  >,
  Expect<
    Equal<keyof LiteratureDiscoverySourceMatchDTO, "providerKey" | "recordKey" | "providerRank">
  >,
  Expect<Equal<keyof LiteratureDiscoveryCandidateDTO, CandidateKey>>,
  Expect<
    Equal<
      KeysOfUnion<LiteratureDiscoveryProviderStatusDTO>,
      "providerKey" | "status" | "resultCount" | "retryAfterSeconds" | "failureCode"
    >
  >,
  Expect<Equal<keyof LiteratureDiscoverySearchRequest, "query" | "limit" | "cursor">>,
  Expect<
    Equal<
      keyof LiteratureDiscoverySearchResponse,
      "candidates" | "providerStatuses" | "nextCursor"
    >
  >,
  Expect<Equal<KeysOfUnion<ImportOperationDTO>, ImportOperationKey>>,
  Expect<Equal<keyof CreateLiteratureImportResponse, "operation">>,
  Expect<Equal<keyof GetLiteratureImportOperationRequest, "operationId">>,
  Expect<Equal<keyof GetLiteratureImportOperationResponse, "operation">>,
  Expect<Equal<keyof RetryLiteratureImportOperationRequest, "operationId">>,
  Expect<Equal<keyof RetryLiteratureImportOperationResponse, "operation">>,
  Expect<Equal<keyof LiteratureSummaryDTO, LiteratureSummaryKey>>,
  Expect<Equal<KeysOfUnion<ListLiteratureRequest>, "scope" | "projectId" | "limit" | "cursor">>,
  Expect<Equal<keyof ListLiteratureResponse, "literature" | "nextCursor">>,
  Expect<Equal<keyof AppendLiteratureAssertionsRequest, "provider" | "assertions">>,
  Expect<
    Equal<
      keyof AppendLiteratureAssertionsResponse,
      "literatureId" | "providerRecord" | "assertions"
    >
  >,
  Expect<
    Equal<
      keyof GetLiteratureResponse,
      "literature" | "providerRecords" | "projection" | "conflictKinds" | "assertions"
    >
  >
];

describe("literature exact contract surface", () => {
  it("pins the Phase 1 manual assertion vocabulary", () => {
    // Given
    const expectedKinds = ["title", "abstract", "publicationYear", "doi"];

    // When
    const actualKinds = [...assertionKinds];

    // Then
    expect(actualKinds).toEqual(expectedKinds);
  });
});
