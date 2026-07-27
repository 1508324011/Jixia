import type { Prisma } from "@jixia/db";

import { authorizeLiteratureAccess } from "./literature.repository.js";
import type { LiteratureActor } from "./literature.repository.js";
import { LiteratureImportRepositoryError } from "./literature.import-repository.js";
import type { SelectedImportOperation } from "./literature.import-operation.js";
import { findLockedProjectAccess } from "./literature.prisma-access.js";
import { PrismaLiteratureTransaction } from "./literature.prisma-transaction.js";

export async function requireImportTargetMutation(
  transaction: Prisma.TransactionClient,
  actor: LiteratureActor,
  target: { readonly scope: "personal" } | { readonly scope: "project"; readonly projectId: string }
): Promise<void> {
  if (target.scope === "personal") {
    return;
  }
  const scope = await findLockedProjectAccess(transaction, {
    projectId: target.projectId,
    userId: actor.userId
  });
  if (scope === null) {
    throw new LiteratureImportRepositoryError("not_found");
  }
  requireDecision(authorizeLiteratureAccess({ operation: "create", actor, scope }));
}

export async function requireImportOperationAccess(
  transaction: Prisma.TransactionClient,
  actor: LiteratureActor,
  operation: Pick<SelectedImportOperation, "ownerUserId" | "projectId">,
  mode: "read" | "mutation"
): Promise<void> {
  if (operation.ownerUserId !== null && operation.projectId === null) {
    requireDecision(
      authorizeLiteratureAccess({
        operation: mode === "read" ? "read" : "append",
        actor,
        scope: { kind: "personal", ownerUserId: operation.ownerUserId }
      })
    );
    return;
  }
  if (operation.ownerUserId === null && operation.projectId !== null) {
    const adapter = new PrismaLiteratureTransaction(transaction);
    const scope = mode === "mutation"
      ? await findLockedProjectAccess(transaction, {
          projectId: operation.projectId,
          userId: actor.userId
        })
      : await adapter.findProjectAccess({
          projectId: operation.projectId,
          userId: actor.userId,
          mode: "read"
        });
    if (scope === null) {
      throw new LiteratureImportRepositoryError("not_found");
    }
    requireDecision(
      authorizeLiteratureAccess({
        operation: mode === "read" ? "read" : "append",
        actor,
        scope
      })
    );
    return;
  }
  throw new LiteratureImportRepositoryError("persistence_invariant");
}

function requireDecision(decision: ReturnType<typeof authorizeLiteratureAccess>): void {
  switch (decision) {
    case "allow":
      return;
    case "not-found":
      throw new LiteratureImportRepositoryError("not_found");
    case "forbidden":
      throw new LiteratureImportRepositoryError("forbidden");
    default: {
      const unreachable: never = decision;
      throw unreachable;
    }
  }
}
