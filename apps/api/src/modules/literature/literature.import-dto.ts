import type { ImportOperationDTO } from "@jixia/shared";

import type { ImportOperationRecord } from "./literature.import-repository.js";

export function toImportOperationDto(operation: ImportOperationRecord): ImportOperationDTO {
  const common = {
    id: operation.id,
    scope: operation.scope,
    createdByUserId: operation.createdByUserId,
    attemptCount: operation.attemptCount,
    attemptStartedAt: operation.attemptStartedAt.toISOString(),
    warnings: operation.warnings,
    createdAt: operation.createdAt.toISOString(),
    updatedAt: operation.updatedAt.toISOString()
  };

  switch (operation.status) {
    case "running":
      return {
        ...common,
        status: operation.status,
        takeoverAfter: operation.takeoverAfter.toISOString(),
        literatureId: null,
        failureCode: null,
        finishedAt: null
      };
    case "succeeded":
      return {
        ...common,
        status: operation.status,
        takeoverAfter: null,
        literatureId: operation.literatureId,
        failureCode: null,
        finishedAt: operation.finishedAt.toISOString()
      };
    case "failed":
      return {
        ...common,
        status: operation.status,
        takeoverAfter: null,
        literatureId: null,
        failureCode: operation.failureCode,
        finishedAt: operation.finishedAt.toISOString()
      };
    default: {
      const unreachable: never = operation;
      throw unreachable;
    }
  }
}
