import type { Prisma } from "@jixia/db";
import type { LiteratureImportFailureCode } from "@jixia/shared";

import { ensureMetadataOnlyAuditPayload } from "../audit/audit.service.js";
import type { ImportOperationRecord } from "./literature.import-repository.js";

export type LiteratureImportAuditAction =
  | "literature.import_started"
  | "literature.import_succeeded"
  | "literature.import_failed";

export async function writeImportAudit(
  transaction: Prisma.TransactionClient,
  input: {
    readonly actorUserId: string;
    readonly action: LiteratureImportAuditAction;
    readonly operation: ImportOperationRecord;
    readonly assertionCount?: number;
    readonly failureCode?: LiteratureImportFailureCode;
  }
): Promise<void> {
  const metadata = {
    operationId: input.operation.id,
    scopeKind: input.operation.scope.kind,
    ...(input.operation.scope.kind === "project"
      ? { projectId: input.operation.scope.projectId }
      : {}),
    providerKey: input.operation.seed.providerKey,
    attemptCount: input.operation.attemptCount,
    outcome: auditOutcome(input.action),
    ...(input.assertionCount === undefined ? {} : { assertionCount: input.assertionCount }),
    ...(input.operation.status === "succeeded"
      ? {
          literatureId: input.operation.literatureId,
          warningCodes: [...input.operation.warnings]
        }
      : {}),
    ...(input.failureCode === undefined ? {} : { failureCode: input.failureCode })
  };
  ensureMetadataOnlyAuditPayload(metadata);
  await transaction.auditEvent.create({
    data: {
      actorUserId: input.actorUserId,
      action: input.action,
      targetType: "ImportOperation",
      targetId: input.operation.id,
      metadata
    },
    select: { id: true }
  });
}

function auditOutcome(
  action: LiteratureImportAuditAction
): "started" | "succeeded" | "failed" {
  switch (action) {
    case "literature.import_started":
      return "started";
    case "literature.import_succeeded":
      return "succeeded";
    case "literature.import_failed":
      return "failed";
    default: {
      const unreachable: never = action;
      throw unreachable;
    }
  }
}
