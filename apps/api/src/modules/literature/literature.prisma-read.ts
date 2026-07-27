import type { Prisma } from "@jixia/db";

import type {
  LiteratureLibraryRecord,
  LiteratureListAnchor,
  LiteratureListScope
} from "./literature.repository.js";
import { summarizeLiteratureLibraryPage } from "./literature.prisma-library-summary.js";
import { storedAssertionSelect } from "./literature.prisma-selects.js";
import type { StoredCanonicalLiteratureAssertion } from "./literature.stored-assertion.js";

const literatureSelect = {
  id: true,
  ownerUserId: true,
  projectId: true,
  createdByUserId: true,
  createdAt: true
} satisfies Prisma.LiteratureSelect;

export async function listCanonicalAssertions(
  transaction: Prisma.TransactionClient,
  literatureId: string
): Promise<readonly StoredCanonicalLiteratureAssertion[]> {
  return transaction.assertion.findMany({
    where: { literatureId },
    orderBy: [{ ordinal: "asc" }, { id: "asc" }],
    select: storedAssertionSelect
  });
}

export async function listLiteratureLibraryPage(
  transaction: Prisma.TransactionClient,
  input: {
    readonly userId: string;
    readonly scope: LiteratureListScope;
    readonly limit: number;
    readonly anchor: LiteratureListAnchor | null;
  }
): Promise<readonly LiteratureLibraryRecord[]> {
  const records = await transaction.literature.findMany({
    where: {
      ...(input.scope.kind === "personal"
        ? { ownerUserId: input.userId, projectId: null }
        : { ownerUserId: null, projectId: input.scope.projectId }),
      ...(input.anchor === null
        ? {}
        : {
            OR: [
              { createdAt: { lt: input.anchor.createdAt } },
              { createdAt: input.anchor.createdAt, id: { lt: input.anchor.id } }
            ]
          })
    },
    orderBy: [{ createdAt: "desc" }, { id: "desc" }],
    take: input.limit,
    select: literatureSelect
  });

  return summarizeLiteratureLibraryPage(transaction, records);
}
