import type { Prisma } from "@jixia/db";
import type { LiteratureScope, LiteratureSourceIdentity } from "@jixia/shared";

import { LiteratureImportRepositoryError } from "./literature.import-repository.js";
import {
  findLegacyImportClaim,
  type ImportIdentityClaim
} from "./literature.prisma-import-legacy-identity.js";

type ResolveImportIdentityInput = {
  readonly scope: LiteratureScope;
  readonly doi: string | null;
  readonly sources: readonly LiteratureSourceIdentity[];
  readonly createdByUserId: string;
};

export class ImportIdentityRaceError extends Error {
  readonly name = "ImportIdentityRaceError";

  constructor() {
    super("Concurrent import identity winner changed");
  }
}

export async function resolveImportLiterature(
  transaction: Prisma.TransactionClient,
  input: ResolveImportIdentityInput
): Promise<string> {
  const claims = importIdentityClaims(input);
  const existingWinner = await resolveExistingWinner(transaction, input.scope, claims);
  const literatureId = existingWinner ?? await createLiterature(transaction, input);

  for (const claim of claims) {
    await transaction.literatureIdentity.createMany({
      data: [identityCreateData(input.scope, literatureId, claim)],
      skipDuplicates: true
    });
  }

  for (const claim of claims) {
    const persisted = await findIdentityClaim(transaction, input.scope, claim);
    if (persisted === null) {
      throw new LiteratureImportRepositoryError("persistence_invariant");
    }
    if (persisted !== literatureId) {
      throw new ImportIdentityRaceError();
    }
  }
  return literatureId;
}

function importIdentityClaims(input: ResolveImportIdentityInput): readonly ImportIdentityClaim[] {
  const providers = [...input.sources]
    .sort(
      (left, right) =>
        left.providerKey.localeCompare(right.providerKey) ||
        left.recordKey.localeCompare(right.recordKey)
    )
    .map((source): ImportIdentityClaim => ({
      kind: "provider",
      providerKey: source.providerKey,
      identityValue: source.recordKey
    }));
  return input.doi === null
    ? providers
    : [{ kind: "doi", providerKey: null, identityValue: input.doi }, ...providers];
}

async function resolveExistingWinner(
  transaction: Prisma.TransactionClient,
  scope: LiteratureScope,
  claims: readonly ImportIdentityClaim[]
): Promise<string | null> {
  let winner: string | null = null;
  for (const claim of claims) {
    const claimed = await findIdentityClaim(transaction, scope, claim);
    const candidate = claimed ?? await findLegacyImportClaim(transaction, scope, claim);
    if (candidate === null) {
      continue;
    }
    if (winner !== null && winner !== candidate) {
      throw new LiteratureImportRepositoryError("identity_conflict");
    }
    winner = candidate;
  }
  return winner;
}

async function findIdentityClaim(
  transaction: Prisma.TransactionClient,
  scope: LiteratureScope,
  claim: ImportIdentityClaim
): Promise<string | null> {
  const identity = await transaction.literatureIdentity.findFirst({
    where: {
      ...identityScopeWhere(scope),
      kind: claim.kind,
      providerKey: claim.providerKey,
      identityValue: claim.identityValue
    },
    select: { literatureId: true }
  });
  return identity?.literatureId ?? null;
}

async function createLiterature(
  transaction: Prisma.TransactionClient,
  input: ResolveImportIdentityInput
): Promise<string> {
  const literature = await transaction.literature.create({
    data: {
      ...literatureScopeCreateData(input.scope),
      createdByUserId: input.createdByUserId
    },
    select: { id: true }
  });
  return literature.id;
}

function identityCreateData(
  scope: LiteratureScope,
  literatureId: string,
  claim: ImportIdentityClaim
): Prisma.LiteratureIdentityCreateManyInput {
  return {
    literatureId,
    ...identityScopeCreateData(scope),
    kind: claim.kind,
    providerKey: claim.providerKey,
    identityValue: claim.identityValue
  };
}

function identityScopeCreateData(
  scope: LiteratureScope
): Pick<Prisma.LiteratureIdentityCreateManyInput, "ownerUserId" | "projectId"> {
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

function identityScopeWhere(scope: LiteratureScope): Prisma.LiteratureIdentityWhereInput {
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

function literatureScopeCreateData(
  scope: LiteratureScope
): Pick<Prisma.LiteratureUncheckedCreateInput, "ownerUserId" | "projectId"> {
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
