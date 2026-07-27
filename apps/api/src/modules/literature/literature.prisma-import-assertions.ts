import type { Prisma } from "@jixia/db";
import type { LiteratureSourceIdentity } from "@jixia/shared";

import {
  fingerprintStructuredImportAssertion,
  prepareProviderAssertionBatch
} from "./literature.import-assertions.js";
import type {
  CanonicalImportAssertion,
  ProviderAssertionBatch
} from "./literature.import-repository.js";
import { LiteratureImportRepositoryError } from "./literature.import-repository.js";

export type PreparedImportBatches = {
  readonly batches: readonly ProviderAssertionBatch[];
  readonly sources: readonly LiteratureSourceIdentity[];
  readonly doi: string | null;
  readonly assertionCount: number;
};

type AppendImportBatchesInput = {
  readonly literatureId: string;
  readonly createdByUserId: string;
  readonly batches: readonly ProviderAssertionBatch[];
};

type PersistImportAssertionInput = {
  readonly literatureId: string;
  readonly providerRecordId: string;
  readonly createdByUserId: string;
  readonly ordinal: number;
  readonly assertion: CanonicalImportAssertion;
};

type PersistStructuredValueInput = PersistImportAssertionInput & {
  readonly assertionId: string;
};

export function prepareImportBatches(
  batches: readonly ProviderAssertionBatch[]
): PreparedImportBatches {
  if (batches.length === 0) {
    throw new LiteratureImportRepositoryError("invalid_batch");
  }
  const sources = new Set<string>();
  let doi: string | null = null;
  let assertionCount = 0;
  const prepared = batches.map((batch) => {
    const sourceKey = `${batch.source.providerKey}\u0000${batch.source.recordKey}`;
    if (sources.has(sourceKey)) {
      throw new LiteratureImportRepositoryError("invalid_batch");
    }
    sources.add(sourceKey);
    const normalized = prepareProviderAssertionBatch(batch);
    assertionCount += normalized.assertions.length;
    for (const assertion of normalized.assertions) {
      if (assertion.kind !== "doi") {
        continue;
      }
      if (doi !== null && doi !== assertion.value) {
        throw new LiteratureImportRepositoryError("identity_conflict");
      }
      doi = assertion.value;
    }
    return normalized;
  });
  return {
    batches: prepared,
    sources: prepared.map((batch) => batch.source),
    doi,
    assertionCount
  };
}

export async function appendImportAssertionBatches(
  transaction: Prisma.TransactionClient,
  input: AppendImportBatchesInput
): Promise<void> {
  const assertionCount = input.batches.reduce(
    (count, batch) => count + batch.assertions.length,
    0
  );
  const literature = await transaction.literature.update({
    where: { id: input.literatureId },
    data: { nextAssertionOrdinal: { increment: assertionCount } },
    select: { nextAssertionOrdinal: true }
  });
  let ordinal = literature.nextAssertionOrdinal - assertionCount;

  await transaction.providerRecord.createMany({
    data: input.batches.map((batch) => ({
      literatureId: input.literatureId,
      providerKey: batch.source.providerKey,
      recordKey: batch.source.recordKey,
      createdByUserId: input.createdByUserId
    })),
    skipDuplicates: true
  });

  for (const batch of input.batches) {
    const providerRecord = await transaction.providerRecord.findUnique({
      where: {
        literatureId_providerKey_recordKey: {
          literatureId: input.literatureId,
          providerKey: batch.source.providerKey,
          recordKey: batch.source.recordKey
        }
      },
      select: { id: true }
    });
    if (providerRecord === null) {
      throw new LiteratureImportRepositoryError("persistence_invariant");
    }
    for (const assertion of batch.assertions) {
      await persistImportAssertion(transaction, {
        literatureId: input.literatureId,
        providerRecordId: providerRecord.id,
        createdByUserId: input.createdByUserId,
        ordinal,
        assertion
      });
      ordinal += 1;
    }
  }
}

async function persistImportAssertion(
  transaction: Prisma.TransactionClient,
  input: PersistImportAssertionInput
): Promise<void> {
  const persisted = await transaction.assertion.create({
    data: assertionCreateData(input),
    select: { id: true }
  });
  await persistStructuredValue(transaction, { ...input, assertionId: persisted.id });
}

function assertionCreateData(
  input: PersistImportAssertionInput
): Prisma.AssertionUncheckedCreateInput {
  const common = {
    literatureId: input.literatureId,
    providerRecordId: input.providerRecordId,
    createdByUserId: input.createdByUserId,
    ordinal: input.ordinal,
    kind: input.assertion.kind
  };
  switch (input.assertion.kind) {
    case "title":
    case "abstract":
    case "doi":
    case "publicationDate":
    case "venue":
    case "publicationType":
      return {
        ...common,
        textValue: input.assertion.value,
        integerValue: null,
        structuredItemCount: null,
        valueFingerprint: null
      };
    case "publicationYear":
      return {
        ...common,
        textValue: null,
        integerValue: input.assertion.value,
        structuredItemCount: null,
        valueFingerprint: null
      };
    case "authors":
    case "identifiers":
      return {
        ...common,
        textValue: null,
        integerValue: null,
        structuredItemCount: input.assertion.value.length,
        valueFingerprint: fingerprintStructuredImportAssertion(input.assertion)
      };
    case "openAccess":
    case "publisher":
      return {
        ...common,
        textValue: null,
        integerValue: null,
        structuredItemCount: 1,
        valueFingerprint: fingerprintStructuredImportAssertion(input.assertion)
      };
    default: {
      const unreachable: never = input.assertion;
      throw unreachable;
    }
  }
}

async function persistStructuredValue(
  transaction: Prisma.TransactionClient,
  input: PersistStructuredValueInput
): Promise<void> {
  switch (input.assertion.kind) {
    case "title":
    case "abstract":
    case "doi":
    case "publicationDate":
    case "venue":
    case "publicationType":
    case "publicationYear":
      return;
    case "authors":
      await transaction.assertionAuthor.createMany({
        data: input.assertion.value.map((author, position) => ({
          assertionId: input.assertionId,
          literatureId: input.literatureId,
          position,
          displayName: author.displayName,
          orcid: author.orcid ?? null
        }))
      });
      return;
    case "identifiers":
      await transaction.assertionIdentifier.createMany({
        data: input.assertion.value.map((identifier, position) => ({
          assertionId: input.assertionId,
          literatureId: input.literatureId,
          position,
          scheme: identifier.scheme,
          value: identifier.value
        }))
      });
      return;
    case "openAccess":
      await transaction.assertionOpenAccess.create({
        data: {
          assertionId: input.assertionId,
          literatureId: input.literatureId,
          isOpenAccess: input.assertion.value.isOpenAccess,
          bestUrl: input.assertion.value.bestUrl ?? null,
          license: input.assertion.value.license ?? null,
          version: input.assertion.value.version ?? null,
          hostType: input.assertion.value.hostType ?? null
        }
      });
      return;
    case "publisher":
      await transaction.assertionPublisher.create({
        data: {
          assertionId: input.assertionId,
          literatureId: input.literatureId,
          name: input.assertion.value.name ?? null,
          landingPageUrl: input.assertion.value.landingPageUrl ?? null
        }
      });
      return;
    default: {
      const unreachable: never = input.assertion;
      throw unreachable;
    }
  }
}
