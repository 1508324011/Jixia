import type {
  LiteratureAuthorValue,
  LiteratureIdentifierValue,
  LiteratureImportFailureCode,
  LiteratureImportSeed,
  LiteratureImportWarningCode,
  LiteratureOpenAccessValue,
  LiteraturePublisherValue,
  LiteratureScope,
  LiteratureSourceIdentity,
  LiteratureTargetScope
} from "@jixia/shared";

import type { LiteratureActor } from "./literature.repository.js";

export type CanonicalImportAssertion =
  | {
      readonly kind:
        | "title"
        | "abstract"
        | "doi"
        | "publicationDate"
        | "venue"
        | "publicationType";
      readonly value: string;
    }
  | {
      readonly kind: "publicationYear";
      readonly value: number;
    }
  | {
      readonly kind: "authors";
      readonly value: readonly LiteratureAuthorValue[];
    }
  | {
      readonly kind: "identifiers";
      readonly value: readonly LiteratureIdentifierValue[];
    }
  | {
      readonly kind: "openAccess";
      readonly value: LiteratureOpenAccessValue;
    }
  | {
      readonly kind: "publisher";
      readonly value: LiteraturePublisherValue;
    };

export type StructuredImportAssertion = Extract<
  CanonicalImportAssertion,
  { readonly kind: "authors" | "identifiers" | "openAccess" | "publisher" }
>;

export type ProviderAssertionBatch = {
  readonly source: LiteratureSourceIdentity;
  readonly assertions: readonly CanonicalImportAssertion[];
};

type ImportOperationCommon = {
  readonly id: string;
  readonly scope: LiteratureScope;
  readonly seed: LiteratureImportSeed;
  readonly createdByUserId: string;
  readonly attemptCount: number;
  readonly attemptStartedAt: Date;
  readonly warnings: readonly LiteratureImportWarningCode[];
  readonly createdAt: Date;
  readonly updatedAt: Date;
};

export type RunningImportOperation = ImportOperationCommon & {
  readonly status: "running";
  readonly takeoverAfter: Date;
  readonly finishedAt: null;
  readonly literatureId: null;
  readonly failureCode: null;
};

export type SucceededImportOperation = ImportOperationCommon & {
  readonly status: "succeeded";
  readonly takeoverAfter: null;
  readonly finishedAt: Date;
  readonly literatureId: string;
  readonly failureCode: null;
};

export type FailedImportOperation = ImportOperationCommon & {
  readonly status: "failed";
  readonly takeoverAfter: null;
  readonly finishedAt: Date;
  readonly literatureId: null;
  readonly failureCode: LiteratureImportFailureCode;
};

export type ImportOperationRecord =
  | RunningImportOperation
  | SucceededImportOperation
  | FailedImportOperation;

export type AdmitImportResult =
  | { readonly kind: "admitted"; readonly operation: RunningImportOperation }
  | { readonly kind: "replayed"; readonly operation: ImportOperationRecord };

export type AdmitImportInput = {
  readonly actor: LiteratureActor;
  readonly target: LiteratureTargetScope;
  readonly seed: LiteratureImportSeed;
  readonly idempotencyKey: string;
};

export type FinalizeImportInput = {
  readonly actor: LiteratureActor;
  readonly operationId: string;
  readonly attemptCount: number;
  readonly warningCodes: readonly LiteratureImportWarningCode[];
  readonly batches: readonly ProviderAssertionBatch[];
};

export type FailImportInput = {
  readonly actor: LiteratureActor;
  readonly operationId: string;
  readonly attemptCount: number;
  readonly warningCodes: readonly LiteratureImportWarningCode[];
  readonly failureCode: LiteratureImportFailureCode;
};

export interface LiteratureImportRepository {
  admitImport(input: AdmitImportInput): Promise<AdmitImportResult>;
  getImportOperation(input: {
    readonly actor: LiteratureActor;
    readonly operationId: string;
  }): Promise<ImportOperationRecord>;
  retryImport(input: {
    readonly actor: LiteratureActor;
    readonly operationId: string;
  }): Promise<RunningImportOperation>;
  finalizeImport(input: FinalizeImportInput): Promise<SucceededImportOperation>;
  failImport(input: FailImportInput): Promise<FailedImportOperation>;
}

export type LiteratureImportRepositoryErrorCode =
  | "not_found"
  | "forbidden"
  | "idempotency_conflict"
  | "operation_conflict"
  | "stale_attempt"
  | "identity_conflict"
  | "invalid_batch"
  | "persistence_invariant";

const errorStatusCodes = {
  not_found: 404,
  forbidden: 403,
  idempotency_conflict: 409,
  operation_conflict: 409,
  stale_attempt: 409,
  identity_conflict: 409,
  invalid_batch: 500,
  persistence_invariant: 500
} as const satisfies Readonly<Record<LiteratureImportRepositoryErrorCode, number>>;

export class LiteratureImportRepositoryError extends Error {
  readonly name = "LiteratureImportRepositoryError";
  readonly statusCode: number;

  constructor(readonly code: LiteratureImportRepositoryErrorCode) {
    super(code);
    this.statusCode = errorStatusCodes[code];
  }
}
