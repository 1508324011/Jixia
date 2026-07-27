import type { Prisma, PrismaClient } from "@jixia/db";
import { Prisma as PrismaRuntime } from "@jixia/db/generated";

import { requireImportOperationAccess, requireImportTargetMutation } from "./literature.import-access.js";
import { writeImportAudit } from "./literature.import-audit.js";
import {
  fingerprintImportRequest,
  importLeaseMilliseconds,
  importOperationSelect,
  toImportOperationRecord
} from "./literature.import-operation.js";
import type {
  AdmitImportInput,
  AdmitImportResult,
  ImportOperationRecord
} from "./literature.import-repository.js";
import { LiteratureImportRepositoryError } from "./literature.import-repository.js";

export async function admitPrismaImport(
  prisma: PrismaClient,
  input: AdmitImportInput
): Promise<AdmitImportResult> {
  const requestFingerprint = fingerprintImportRequest(input);
  try {
    return await prisma.$transaction((transaction) =>
      admitOnce(transaction, input, requestFingerprint)
    );
  } catch (error) {
    if (error instanceof PrismaRuntime.PrismaClientKnownRequestError && error.code === "P2002") {
      return prisma.$transaction((transaction) =>
        admitOnce(transaction, input, requestFingerprint)
      );
    }
    throw error;
  }
}

export async function readPrismaImport(
  prisma: PrismaClient,
  input: {
    readonly actor: AdmitImportInput["actor"];
    readonly operationId: string;
  }
): Promise<ImportOperationRecord> {
  return prisma.$transaction(async (transaction) => {
    const operation = await transaction.importOperation.findUnique({
      where: { id: input.operationId },
      select: importOperationSelect
    });
    if (operation === null) {
      throw new LiteratureImportRepositoryError("not_found");
    }
    await requireImportOperationAccess(transaction, input.actor, operation, "read");
    return toImportOperationRecord(operation);
  });
}

async function admitOnce(
  transaction: Prisma.TransactionClient,
  input: AdmitImportInput,
  requestFingerprint: string
): Promise<AdmitImportResult> {
  await requireImportTargetMutation(transaction, input.actor, input.target);
  const existing = await transaction.importOperation.findUnique({
    where: {
      createdByUserId_idempotencyKey: {
        createdByUserId: input.actor.userId,
        idempotencyKey: input.idempotencyKey
      }
    },
    select: { ...importOperationSelect, requestFingerprint: true }
  });
  if (existing !== null) {
    if (existing.requestFingerprint !== requestFingerprint) {
      throw new LiteratureImportRepositoryError("idempotency_conflict");
    }
    return { kind: "replayed", operation: toImportOperationRecord(existing) };
  }

  const now = await databaseNow(transaction);
  const operation = await transaction.importOperation.create({
    data: {
      ...(input.target.scope === "personal"
        ? { ownerUserId: input.actor.userId }
        : { projectId: input.target.projectId }),
      createdByUserId: input.actor.userId,
      idempotencyKey: input.idempotencyKey,
      requestFingerprint,
      sourceProviderKey: input.seed.providerKey,
      sourceRecordKey: input.seed.recordKey,
      status: "running",
      attemptCount: 1,
      attemptStartedAt: now,
      takeoverAfter: new Date(now.getTime() + importLeaseMilliseconds)
    },
    select: importOperationSelect
  });
  const record = toImportOperationRecord(operation);
  if (record.status !== "running") {
    throw new LiteratureImportRepositoryError("persistence_invariant");
  }
  await writeImportAudit(transaction, {
    actorUserId: input.actor.userId,
    action: "literature.import_started",
    operation: record
  });
  return { kind: "admitted", operation: record };
}

export async function databaseNow(transaction: Prisma.TransactionClient): Promise<Date> {
  const [clock] = await transaction.$queryRaw<readonly { readonly now: Date }[]>(
    PrismaRuntime.sql`SELECT CURRENT_TIMESTAMP AS "now"`
  );
  if (clock === undefined) {
    throw new LiteratureImportRepositoryError("persistence_invariant");
  }
  return clock.now;
}
