import type {
  LiteratureAuthorValue,
  LiteratureIdentifierValue,
  LiteratureOpenAccessValue,
  LiteraturePublisherValue,
  LiteratureScope,
  LiteratureTargetScope
} from "./literature.core";
import type {
  LiteratureDiscoveryProviderFailureCode,
  LiteratureImportFailureCode,
  LiteratureImportSeedProviderKey,
  LiteratureImportWarningCode,
  LiteratureSearchProviderKey
} from "./literature.vocabulary";

export type LiteratureDiscoverySourceMatchDTO = {
  readonly providerKey: LiteratureSearchProviderKey;
  readonly recordKey: string;
  readonly providerRank: number;
};

export type LiteratureDiscoveryCandidateDTO = {
  readonly title: string | null;
  readonly abstract: string | null;
  readonly publicationYear: number | null;
  readonly publicationDate: string | null;
  readonly venue: string | null;
  readonly publicationType: string | null;
  readonly doi: string | null;
  readonly authors: readonly LiteratureAuthorValue[];
  readonly identifiers: readonly LiteratureIdentifierValue[];
  readonly openAccess: LiteratureOpenAccessValue | null;
  readonly publisher: LiteraturePublisherValue | null;
  readonly sourceMatches: readonly LiteratureDiscoverySourceMatchDTO[];
};

export type LiteratureDiscoveryProviderStatusDTO =
  | {
      readonly providerKey: LiteratureSearchProviderKey;
      readonly status: "succeeded";
      readonly resultCount: number;
    }
  | {
      readonly providerKey: LiteratureSearchProviderKey;
      readonly status: "rate_limited";
      readonly retryAfterSeconds: number | null;
    }
  | {
      readonly providerKey: LiteratureSearchProviderKey;
      readonly status: "unavailable";
      readonly failureCode: LiteratureDiscoveryProviderFailureCode;
    }
  | {
      readonly providerKey: LiteratureSearchProviderKey;
      readonly status: "unconfigured";
    };

export type LiteratureDiscoverySearchRequest = {
  readonly query: string;
  readonly limit?: number;
  readonly cursor?: string;
};

export type LiteratureDiscoverySearchResponse = {
  readonly candidates: readonly LiteratureDiscoveryCandidateDTO[];
  readonly providerStatuses: readonly LiteratureDiscoveryProviderStatusDTO[];
  readonly nextCursor: string | null;
};

export type LiteratureImportSeed = {
  readonly providerKey: LiteratureImportSeedProviderKey;
  readonly recordKey: string;
};

export type CreateLiteratureImportRequest = {
  readonly target: LiteratureTargetScope;
  readonly seed: LiteratureImportSeed;
};

type ImportOperationCommonDTO = {
  readonly id: string;
  readonly scope: LiteratureScope;
  readonly createdByUserId: string;
  readonly attemptCount: number;
  readonly attemptStartedAt: string;
  readonly warnings: readonly LiteratureImportWarningCode[];
  readonly createdAt: string;
  readonly updatedAt: string;
};

export type ImportOperationDTO = ImportOperationCommonDTO &
  (
    | {
        readonly status: "running";
        readonly takeoverAfter: string;
        readonly literatureId: null;
        readonly failureCode: null;
        readonly finishedAt: null;
      }
    | {
        readonly status: "succeeded";
        readonly takeoverAfter: null;
        readonly literatureId: string;
        readonly failureCode: null;
        readonly finishedAt: string;
      }
    | {
        readonly status: "failed";
        readonly takeoverAfter: null;
        readonly literatureId: null;
        readonly failureCode: LiteratureImportFailureCode;
        readonly finishedAt: string;
      }
  );

export type CreateLiteratureImportResponse = {
  readonly operation: ImportOperationDTO;
};

export type GetLiteratureImportOperationRequest = {
  readonly operationId: string;
};

export type GetLiteratureImportOperationResponse = {
  readonly operation: ImportOperationDTO;
};

export type RetryLiteratureImportOperationRequest = {
  readonly operationId: string;
};

export type RetryLiteratureImportOperationResponse = {
  readonly operation: ImportOperationDTO;
};
