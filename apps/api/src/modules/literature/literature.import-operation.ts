import { createHash } from "node:crypto";

import type { Prisma } from "@jixia/db";
import {
  literatureImportWarningCodes,
  type LiteratureImportWarningCode,
  type LiteratureTargetScope
} from "@jixia/shared";

import type {
  AdmitImportInput,
  ImportOperationRecord
} from "./literature.import-repository.js";
import { LiteratureImportRepositoryError } from "./literature.import-repository.js";

export const importLeaseMilliseconds = 30_000;

export const importOperationSelect = {
  id: true,
  ownerUserId: true,
  projectId: true,
  createdByUserId: true,
  sourceProviderKey: true,
  sourceRecordKey: true,
  status: true,
  attemptCount: true,
  attemptStartedAt: true,
  takeoverAfter: true,
  finishedAt: true,
  literatureId: true,
  warningCodes: true,
  failureCode: true,
  createdAt: true,
  updatedAt: true
} satisfies Prisma.ImportOperationSelect;

export type SelectedImportOperation = Prisma.ImportOperationGetPayload<{
  readonly select: typeof importOperationSelect;
}>;

export function fingerprintImportRequest(input: AdmitImportInput): string {
  const targetTuple = importTargetTuple(input.target);
  return createHash("sha256")
    .update(
      JSON.stringify([
        targetTuple,
        [input.seed.providerKey, input.seed.recordKey]
      ]),
      "utf8"
    )
    .digest("hex");
}

export function normalizeImportWarnings(
  warningCodes: readonly LiteratureImportWarningCode[]
): readonly LiteratureImportWarningCode[] {
  const present = new Set(warningCodes);
  return literatureImportWarningCodes.filter((warningCode) => present.has(warningCode));
}

export function toImportOperationRecord(row: SelectedImportOperation): ImportOperationRecord {
  const scope = operationScope(row);
  const common = {
    id: row.id,
    scope,
    seed: { providerKey: row.sourceProviderKey, recordKey: row.sourceRecordKey },
    createdByUserId: row.createdByUserId,
    attemptCount: row.attemptCount,
    attemptStartedAt: row.attemptStartedAt,
    warnings: row.warningCodes,
    createdAt: row.createdAt,
    updatedAt: row.updatedAt
  };

  switch (row.status) {
    case "running":
      if (
        row.takeoverAfter === null ||
        row.finishedAt !== null ||
        row.literatureId !== null ||
        row.failureCode !== null
      ) {
        throw invariantFailure();
      }
      return {
        ...common,
        status: row.status,
        takeoverAfter: row.takeoverAfter,
        finishedAt: null,
        literatureId: null,
        failureCode: null
      };
    case "succeeded":
      if (
        row.takeoverAfter !== null ||
        row.finishedAt === null ||
        row.literatureId === null ||
        row.failureCode !== null
      ) {
        throw invariantFailure();
      }
      return {
        ...common,
        status: row.status,
        takeoverAfter: null,
        finishedAt: row.finishedAt,
        literatureId: row.literatureId,
        failureCode: null
      };
    case "failed":
      if (
        row.takeoverAfter !== null ||
        row.finishedAt === null ||
        row.literatureId !== null ||
        row.failureCode === null
      ) {
        throw invariantFailure();
      }
      return {
        ...common,
        status: row.status,
        takeoverAfter: null,
        finishedAt: row.finishedAt,
        literatureId: null,
        failureCode: row.failureCode
      };
    default: {
      const unreachable: never = row.status;
      throw unreachable;
    }
  }
}

function importTargetTuple(target: LiteratureTargetScope): readonly [string, string | null] {
  switch (target.scope) {
    case "personal":
      return [target.scope, null];
    case "project":
      return [target.scope, target.projectId];
    default: {
      const unreachable: never = target;
      throw unreachable;
    }
  }
}

function operationScope(row: SelectedImportOperation): ImportOperationRecord["scope"] {
  if (row.ownerUserId !== null && row.projectId === null) {
    return { kind: "personal", ownerUserId: row.ownerUserId };
  }
  if (row.ownerUserId === null && row.projectId !== null) {
    return { kind: "project", projectId: row.projectId };
  }
  throw invariantFailure();
}

function invariantFailure(): LiteratureImportRepositoryError {
  return new LiteratureImportRepositoryError("persistence_invariant");
}
