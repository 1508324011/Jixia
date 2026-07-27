import type { Prisma, PrismaClient } from "@jixia/db";
import { Prisma as PrismaRuntime } from "@jixia/db/generated";

import { requireImportOperationAccess } from "./literature.import-access.js";
import { writeImportAudit } from "./literature.import-audit.js";
import {
  importOperationSelect,
  normalizeImportWarnings,
  toImportOperationRecord
} from "./literature.import-operation.js";
import type {
  FinalizeImportInput,
  SucceededImportOperation
} from "./literature.import-repository.js";
import { LiteratureImportRepositoryError } from "./literature.import-repository.js";
import {
  appendImportAssertionBatches,
  prepareImportBatches,
  type PreparedImportBatches
} from "./literature.prisma-import-assertions.js";
import { databaseNow } from "./literature.prisma-import-admission.js";
import {
  ImportIdentityRaceError,
  resolveImportLiterature
} from "./literature.prisma-import-identity.js";
import { lockImportOperation } from "./literature.prisma-import-lifecycle.js";

const literatureIdentityConstraintFields: readonly (readonly string[])[] = [
  ["ownerUserId", "identityValue"],
  ["projectId", "identityValue"],
  ["ownerUserId", "providerKey", "identityValue"],
  ["projectId", "providerKey", "identityValue"]
];

export async function finalizePrismaImport(
  prisma: PrismaClient,
  input: FinalizeImportInput
): Promise<SucceededImportOperation> {
  const prepared = prepareImportBatches(input.batches);
  try {
    return await finalizeOnce(prisma, input, prepared);
  } catch (error) {
    if (!isReplayableFinalizationRace(error)) {
      throw error;
    }
  }

  try {
    return await finalizeOnce(prisma, input, prepared);
  } catch (error) {
    if (isReplayableFinalizationRace(error)) {
      throw new LiteratureImportRepositoryError("operation_conflict");
    }
    throw error;
  }
}

async function finalizeOnce(
  prisma: PrismaClient,
  input: FinalizeImportInput,
  prepared: PreparedImportBatches
): Promise<SucceededImportOperation> {
  return prisma.$transaction(async (transaction) => {
    const operation = await lockImportOperation(transaction, input.operationId);
    await requireImportOperationAccess(transaction, input.actor, operation, "mutation");
    if (operation.status !== "running" || operation.attemptCount !== input.attemptCount) {
      throw new LiteratureImportRepositoryError("stale_attempt");
    }
    if (!prepared.sources.some(
      (source) =>
        source.providerKey === operation.sourceProviderKey &&
        source.recordKey === operation.sourceRecordKey
    )) {
      throw new LiteratureImportRepositoryError("invalid_batch");
    }

    const scope = toImportOperationRecord(operation).scope;
    const literatureId = await resolveImportLiterature(transaction, {
      scope,
      doi: prepared.doi,
      sources: prepared.sources,
      createdByUserId: input.actor.userId
    });
    await appendImportAssertionBatches(transaction, {
      literatureId,
      createdByUserId: input.actor.userId,
      batches: prepared.batches
    });
    const record = await succeedImportOperation(transaction, {
      operationId: operation.id,
      attemptCount: input.attemptCount,
      literatureId,
      warningCodes: input.warningCodes
    });
    await writeImportAudit(transaction, {
      actorUserId: input.actor.userId,
      action: "literature.import_succeeded",
      operation: record,
      assertionCount: prepared.assertionCount
    });
    return record;
  });
}

async function succeedImportOperation(
  transaction: Prisma.TransactionClient,
  input: {
    readonly operationId: string;
    readonly attemptCount: number;
    readonly literatureId: string;
    readonly warningCodes: FinalizeImportInput["warningCodes"];
  }
): Promise<SucceededImportOperation> {
  const now = await databaseNow(transaction);
  const updated = await transaction.importOperation.updateMany({
    where: {
      id: input.operationId,
      status: "running",
      attemptCount: input.attemptCount
    },
    data: {
      status: "succeeded",
      takeoverAfter: null,
      finishedAttemptCount: input.attemptCount,
      finishedAt: now,
      literatureId: input.literatureId,
      warningCodes: [...normalizeImportWarnings(input.warningCodes)],
      failureCode: null
    }
  });
  if (updated.count !== 1) {
    throw new LiteratureImportRepositoryError("stale_attempt");
  }
  const operation = await transaction.importOperation.findUnique({
    where: { id: input.operationId },
    select: importOperationSelect
  });
  if (operation === null) {
    throw new LiteratureImportRepositoryError("persistence_invariant");
  }
  const record = toImportOperationRecord(operation);
  if (record.status !== "succeeded") {
    throw new LiteratureImportRepositoryError("persistence_invariant");
  }
  return record;
}

export function isReplayableFinalizationRace(error: unknown): boolean {
  if (error instanceof ImportIdentityRaceError) {
    return true;
  }
  if (
    !(error instanceof PrismaRuntime.PrismaClientKnownRequestError) ||
    error.code !== "P2002" ||
    error.meta?.["modelName"] !== "LiteratureIdentity"
  ) {
    return false;
  }
  const driverError = error.meta["driverAdapterError"];
  if (!isUnknownRecord(driverError)) {
    return false;
  }
  const cause = driverError["cause"];
  if (!isUnknownRecord(cause) || cause["kind"] !== "UniqueConstraintViolation") {
    return false;
  }
  const constraint = cause["constraint"];
  if (!isUnknownRecord(constraint)) {
    return false;
  }
  const fields = constraint["fields"];
  if (!Array.isArray(fields)) {
    return false;
  }
  const normalizedFields = fields.map(normalizeConstraintField);
  return literatureIdentityConstraintFields.some(
    (expected) =>
      normalizedFields.length === expected.length &&
      expected.every((field, index) => normalizedFields[index] === field)
  );
}

function isUnknownRecord(value: unknown): value is Readonly<Record<string, unknown>> {
  return typeof value === "object" && value !== null;
}

function normalizeConstraintField(value: unknown): string | null {
  if (typeof value !== "string") {
    return null;
  }
  return /^"([^"]+)"$/.exec(value)?.[1] ?? value;
}
