import type { Prisma, PrismaClient } from "@jixia/db";
import { Prisma as PrismaRuntime } from "@jixia/db/generated";
import type { LiteratureImportFailureCode } from "@jixia/shared";

import { requireImportOperationAccess } from "./literature.import-access.js";
import { writeImportAudit } from "./literature.import-audit.js";
import {
  importLeaseMilliseconds,
  importOperationSelect,
  normalizeImportWarnings,
  type SelectedImportOperation,
  toImportOperationRecord
} from "./literature.import-operation.js";
import type {
  FailedImportOperation,
  FailImportInput,
  RunningImportOperation
} from "./literature.import-repository.js";
import { LiteratureImportRepositoryError } from "./literature.import-repository.js";
import { databaseNow } from "./literature.prisma-import-admission.js";

export async function retryPrismaImport(
  prisma: PrismaClient,
  input: {
    readonly actor: FailImportInput["actor"];
    readonly operationId: string;
  }
): Promise<RunningImportOperation> {
  return prisma.$transaction(async (transaction) => {
    const operation = await lockImportOperation(transaction, input.operationId);
    await requireImportOperationAccess(transaction, input.actor, operation, "mutation");
    const now = await databaseNow(transaction);
    switch (operation.status) {
      case "failed":
        break;
      case "running":
        if (operation.takeoverAfter === null || operation.takeoverAfter > now) {
          throw new LiteratureImportRepositoryError("operation_conflict");
        }
        break;
      case "succeeded":
        throw new LiteratureImportRepositoryError("operation_conflict");
      default: {
        const unreachable: never = operation.status;
        throw unreachable;
      }
    }
    const updated = await transaction.importOperation.update({
      where: { id: operation.id },
      data: {
        status: "running",
        attemptCount: { increment: 1 },
        attemptStartedAt: now,
        takeoverAfter: new Date(now.getTime() + importLeaseMilliseconds),
        finishedAttemptCount: null,
        finishedAt: null,
        literatureId: null,
        warningCodes: [],
        failureCode: null
      },
      select: importOperationSelect
    });
    const record = toImportOperationRecord(updated);
    if (record.status !== "running") {
      throw new LiteratureImportRepositoryError("persistence_invariant");
    }
    await writeImportAudit(transaction, {
      actorUserId: input.actor.userId,
      action: "literature.import_started",
      operation: record
    });
    return record;
  });
}

export async function failPrismaImport(
  prisma: PrismaClient,
  input: FailImportInput
): Promise<FailedImportOperation> {
  return prisma.$transaction(async (transaction) => {
    const operation = await lockImportOperation(transaction, input.operationId);
    const failureCode = await resolveFailureCode(transaction, input, operation);
    if (operation.status !== "running" || operation.attemptCount !== input.attemptCount) {
      throw new LiteratureImportRepositoryError("stale_attempt");
    }
    const now = await databaseNow(transaction);
    const updated = await transaction.importOperation.update({
      where: { id: operation.id },
      data: {
        status: "failed",
        takeoverAfter: null,
        finishedAttemptCount: input.attemptCount,
        finishedAt: now,
        literatureId: null,
        warningCodes: [...normalizeImportWarnings(input.warningCodes)],
        failureCode
      },
      select: importOperationSelect
    });
    const record = toImportOperationRecord(updated);
    if (record.status !== "failed") {
      throw new LiteratureImportRepositoryError("persistence_invariant");
    }
    await writeImportAudit(transaction, {
      actorUserId: input.actor.userId,
      action: "literature.import_failed",
      operation: record,
      failureCode
    });
    return record;
  });
}

async function resolveFailureCode(
  transaction: Prisma.TransactionClient,
  input: FailImportInput,
  operation: SelectedImportOperation
): Promise<LiteratureImportFailureCode> {
  try {
    await requireImportOperationAccess(transaction, input.actor, operation, "mutation");
    return input.failureCode;
  } catch (error) {
    if (
      operation.projectId !== null &&
      error instanceof LiteratureImportRepositoryError &&
      (error.code === "forbidden" || error.code === "not_found")
    ) {
      return "authorization_revoked";
    }
    throw error;
  }
}

export async function lockImportOperation(
  transaction: Prisma.TransactionClient,
  operationId: string
): Promise<SelectedImportOperation> {
  const [locked] = await transaction.$queryRaw<readonly { readonly id: string }[]>(
    PrismaRuntime.sql`
      SELECT "id"
      FROM "ImportOperation"
      WHERE "id" = ${operationId}
      FOR UPDATE
    `
  );
  if (locked === undefined) {
    throw new LiteratureImportRepositoryError("not_found");
  }
  const operation = await transaction.importOperation.findUnique({
    where: { id: locked.id },
    select: importOperationSelect
  });
  if (operation === null) {
    throw new LiteratureImportRepositoryError("persistence_invariant");
  }
  return operation;
}
