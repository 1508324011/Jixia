import type { PrismaClient } from "@jixia/db";
import { Prisma } from "@jixia/db/generated";

import { completeImportBatch } from "./literature.import.postgres-fixture.js";
import {
  appendImportAssertionBatches,
  prepareImportBatches
} from "./literature.prisma-import-assertions.js";

export async function seedStructuredLibraryAggregate(input: {
  readonly prisma: PrismaClient;
  readonly literatureId: string;
  readonly ownerUserId: string;
  readonly prefix: string;
}): Promise<void> {
  await input.prisma.literature.create({
    data: {
      id: input.literatureId,
      ownerUserId: input.ownerUserId,
      projectId: null,
      createdByUserId: input.ownerUserId
    }
  });
  const doi = `10.1000/${input.prefix}`;
  const prepared = prepareImportBatches([
    completeImportBatch({
      providerKey: "crossref",
      recordKey: `${input.prefix}-crossref`,
      doi
    }),
    {
      source: { providerKey: "openalex", recordKey: `${input.prefix}-openalex` },
      assertions: [
        { kind: "title", value: "Canonical title" },
        {
          kind: "authors",
          value: [
            { displayName: "Ada Lovelace", orcid: "0000-0000-0000-0001" },
            { displayName: "Grace Hopper" }
          ]
        }
      ]
    },
    {
      source: { providerKey: "pubmed", recordKey: `${input.prefix}-pubmed` },
      assertions: [{ kind: "title", value: "Conflicting current title" }]
    }
  ]);
  await input.prisma.$transaction((transaction) => appendImportAssertionBatches(transaction, {
    literatureId: input.literatureId,
    createdByUserId: input.ownerUserId,
    batches: prepared.batches
  }));
}

export async function corruptStructuredFingerprint(
  migrationPrisma: PrismaClient,
  literatureId: string
): Promise<void> {
  const assertion = await migrationPrisma.assertion.findFirstOrThrow({
    where: { literatureId, kind: "authors" },
    orderBy: { ordinal: "asc" },
    select: { id: true }
  });
  await migrationPrisma.$transaction(async (transaction) => {
    await transaction.$executeRaw(Prisma.sql`SET LOCAL session_replication_role = replica`);
    await transaction.$executeRaw(Prisma.sql`
      UPDATE "Assertion"
      SET "valueFingerprint" = ${"0".repeat(64)}
      WHERE "id" = ${assertion.id}
    `);
  });
}

export async function corruptStructuredPosition(
  migrationPrisma: PrismaClient,
  literatureId: string
): Promise<void> {
  const author = await migrationPrisma.assertionAuthor.findFirstOrThrow({
    where: { literatureId },
    orderBy: { position: "asc" },
    select: { assertionId: true, position: true }
  });
  await migrationPrisma.$transaction(async (transaction) => {
    await transaction.$executeRaw(Prisma.sql`SET LOCAL session_replication_role = replica`);
    await transaction.$executeRaw(Prisma.sql`
      UPDATE "AssertionAuthor"
      SET "position" = 7
      WHERE "assertionId" = ${author.assertionId}
        AND "position" = ${author.position}
    `);
  });
}
