import type { Prisma } from "@jixia/db";
import { Prisma as PrismaRuntime } from "@jixia/db/generated";
import type { LiteratureScope } from "@jixia/shared";

import { LiteratureImportRepositoryError } from "./literature.import-repository.js";

export type ImportIdentityClaim =
  | {
      readonly kind: "doi";
      readonly providerKey: null;
      readonly identityValue: string;
    }
  | {
      readonly kind: "provider";
      readonly providerKey: string;
      readonly identityValue: string;
    };

type LegacyIdentityRow = {
  readonly literatureId: string;
};

export async function findLegacyImportClaim(
  transaction: Prisma.TransactionClient,
  scope: LiteratureScope,
  claim: ImportIdentityClaim
): Promise<string | null> {
  switch (claim.kind) {
    case "doi":
      return findLegacyDoi(transaction, scope, claim.identityValue);
    case "provider":
      return findLegacyProvider(transaction, scope, claim);
    default: {
      const unreachable: never = claim;
      throw unreachable;
    }
  }
}

async function findLegacyProvider(
  transaction: Prisma.TransactionClient,
  scope: LiteratureScope,
  claim: Extract<ImportIdentityClaim, { readonly kind: "provider" }>
): Promise<string | null> {
  const matches = await transaction.providerRecord.findMany({
    where: {
      providerKey: claim.providerKey,
      recordKey: claim.identityValue,
      literature: { is: literatureScopeWhere(scope) }
    },
    orderBy: { literatureId: "asc" },
    take: 2,
    select: { literatureId: true }
  });
  return requireUnambiguous(matches);
}

async function findLegacyDoi(
  transaction: Prisma.TransactionClient,
  scope: LiteratureScope,
  identityValue: string
): Promise<string | null> {
  const matches = scope.kind === "personal"
    ? await transaction.$queryRaw<readonly LegacyIdentityRow[]>(PrismaRuntime.sql`
        WITH current_doi AS (
          SELECT DISTINCT ON (assertion."literatureId")
            assertion."literatureId",
            assertion."textValue" AS "identityValue"
          FROM "Assertion" assertion
          WHERE assertion."kind" = 'doi'
          ORDER BY assertion."literatureId", assertion."ordinal" DESC, assertion."id" DESC
        )
        SELECT current_doi."literatureId"
        FROM current_doi
        JOIN "Literature" literature ON literature."id" = current_doi."literatureId"
        WHERE literature."ownerUserId" = ${scope.ownerUserId}
          AND current_doi."identityValue" = ${identityValue}
        ORDER BY current_doi."literatureId"
        LIMIT 2
      `)
    : await transaction.$queryRaw<readonly LegacyIdentityRow[]>(PrismaRuntime.sql`
        WITH current_doi AS (
          SELECT DISTINCT ON (assertion."literatureId")
            assertion."literatureId",
            assertion."textValue" AS "identityValue"
          FROM "Assertion" assertion
          WHERE assertion."kind" = 'doi'
          ORDER BY assertion."literatureId", assertion."ordinal" DESC, assertion."id" DESC
        )
        SELECT current_doi."literatureId"
        FROM current_doi
        JOIN "Literature" literature ON literature."id" = current_doi."literatureId"
        WHERE literature."projectId" = ${scope.projectId}
          AND current_doi."identityValue" = ${identityValue}
        ORDER BY current_doi."literatureId"
        LIMIT 2
      `);
  return requireUnambiguous(matches);
}

function requireUnambiguous(matches: readonly LegacyIdentityRow[]): string | null {
  if (matches.length > 1) {
    throw new LiteratureImportRepositoryError("identity_conflict");
  }
  return matches[0]?.literatureId ?? null;
}

function literatureScopeWhere(scope: LiteratureScope): Prisma.LiteratureWhereInput {
  switch (scope.kind) {
    case "personal":
      return { ownerUserId: scope.ownerUserId, projectId: null };
    case "project":
      return { ownerUserId: null, projectId: scope.projectId };
    default: {
      const unreachable: never = scope;
      throw unreachable;
    }
  }
}
