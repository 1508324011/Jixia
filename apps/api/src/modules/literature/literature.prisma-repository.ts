import type { PrismaClient } from "@jixia/db";

import { PrismaLiteratureTransaction } from "./literature.prisma-transaction.js";
import type { LiteratureRepository } from "./literature.repository.js";
import {
  TransactionalLiteratureRepository,
  type LiteratureTransaction,
  type LiteratureTransactionRunner
} from "./literature.transactional-repository.js";

class PrismaLiteratureTransactionRunner implements LiteratureTransactionRunner {
  constructor(private readonly prisma: PrismaClient) {}

  async run<T>(
    work: (transaction: LiteratureTransaction) => Promise<T>,
    options?: { readonly isolationLevel?: "RepeatableRead" }
  ): Promise<T> {
    if (options?.isolationLevel === undefined) {
      return this.prisma.$transaction((transaction) =>
        work(new PrismaLiteratureTransaction(transaction))
      );
    }

    return this.prisma.$transaction(
      (transaction) => work(new PrismaLiteratureTransaction(transaction)),
      { isolationLevel: options.isolationLevel }
    );
  }
}

export function createPrismaLiteratureRepository(prisma: PrismaClient): LiteratureRepository {
  return new TransactionalLiteratureRepository(new PrismaLiteratureTransactionRunner(prisma));
}
