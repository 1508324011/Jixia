import type { Prisma, PrismaClient } from "@jixia/db/generated";
import { maxUploadFailureDetailLength, type UploadFailureReason } from "@jixia/shared";

export class CleanupUploadIntentStorageError extends Error {
  constructor(message = "Object storage cleanup failed") {
    super(message);
    this.name = "CleanupUploadIntentStorageError";
  }
}

export type CleanupUploadIntentRecord = {
  readonly id: string;
  readonly storageKey: string;
  readonly status: "expired" | "cleaned";
  readonly failureReason: UploadFailureReason | null;
  readonly failureDetail: string | null;
};

export type CleanupUploadIntentRepository = {
  readonly claimExpiredPendingIntents: (input: {
    readonly now: Date;
    readonly limit: number;
  }) => Promise<readonly CleanupUploadIntentRecord[]>;
  readonly markIntentCleaned: (input: {
    readonly uploadIntentId: string;
    readonly failureReason: UploadFailureReason;
    readonly failureDetail: string;
    readonly now: Date;
  }) => Promise<CleanupUploadIntentRecord | null>;
  readonly markIntentCleanupStorageError: (input: {
    readonly uploadIntentId: string;
    readonly failureDetail: string;
  }) => Promise<CleanupUploadIntentRecord | null>;
};

export type CleanupUploadIntentStorage = {
  readonly headObject: (storageKey: string) => Promise<unknown | null>;
  readonly deleteObject: (storageKey: string) => Promise<void>;
};

export type CleanupUploadIntentsResult = {
  readonly claimed: number;
  readonly cleaned: number;
  readonly missing: number;
  readonly storageErrors: number;
};

export type CleanupUploadIntentsOptions = {
  readonly now?: () => Date;
  readonly limit?: number;
};

const defaultLimit = 100;

function shortDetail(detail: string): string {
  return detail.slice(0, maxUploadFailureDetailLength);
}

function toRecord(record: {
  readonly id: string;
  readonly storageKey: string;
  readonly status: "expired" | "cleaned";
  readonly failureReason: UploadFailureReason | null;
  readonly failureDetail: string | null;
}): CleanupUploadIntentRecord {
  return record;
}

const cleanupIntentSelect = {
  id: true,
  storageKey: true,
  status: true,
  failureReason: true,
  failureDetail: true
} satisfies Prisma.UploadIntentSelect;

export class PrismaCleanupUploadIntentRepository implements CleanupUploadIntentRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async claimExpiredPendingIntents(input: {
    readonly now: Date;
    readonly limit: number;
  }): Promise<readonly CleanupUploadIntentRecord[]> {
    return this.prisma.$transaction(async (transaction) => {
      const candidates = await transaction.uploadIntent.findMany({
        where: {
          status: "pending",
          expiresAt: { lte: input.now }
        },
        orderBy: { expiresAt: "asc" },
        take: input.limit,
        select: { id: true }
      });

      if (candidates.length === 0) {
        return [];
      }

      const claimed: CleanupUploadIntentRecord[] = [];

      for (const candidate of candidates) {
        const result = await transaction.uploadIntent.updateMany({
          where: {
            id: candidate.id,
            status: "pending",
            expiresAt: { lte: input.now }
          },
          data: {
            status: "expired",
            failureReason: "expired",
            failureDetail: shortDetail("Upload intent expired")
          }
        });

        if (result.count !== 1) {
          continue;
        }

        const intent = await transaction.uploadIntent.findUnique({
          where: { id: candidate.id },
          select: cleanupIntentSelect
        });

        if (intent) {
          claimed.push(toRecord(intent as CleanupUploadIntentRecord));
        }
      }

      return claimed;
    });
  }

  async markIntentCleaned(input: {
    readonly uploadIntentId: string;
    readonly failureReason: UploadFailureReason;
    readonly failureDetail: string;
    readonly now: Date;
  }): Promise<CleanupUploadIntentRecord | null> {
    const claimed = await this.prisma.uploadIntent.updateMany({
      where: {
        id: input.uploadIntentId,
        status: "expired"
      },
      data: {
        status: "cleaned",
        failureReason: input.failureReason,
        failureDetail: shortDetail(input.failureDetail),
        cleanedAt: input.now
      }
    });

    if (claimed.count !== 1) {
      return null;
    }

    const intent = await this.prisma.uploadIntent.findUnique({
      where: { id: input.uploadIntentId },
      select: cleanupIntentSelect
    });

    return intent ? toRecord(intent as CleanupUploadIntentRecord) : null;
  }

  async markIntentCleanupStorageError(input: {
    readonly uploadIntentId: string;
    readonly failureDetail: string;
  }): Promise<CleanupUploadIntentRecord | null> {
    const claimed = await this.prisma.uploadIntent.updateMany({
      where: {
        id: input.uploadIntentId,
        status: "expired"
      },
      data: {
        failureReason: "storage_error",
        failureDetail: shortDetail(input.failureDetail)
      }
    });

    if (claimed.count !== 1) {
      return null;
    }

    const intent = await this.prisma.uploadIntent.findUnique({
      where: { id: input.uploadIntentId },
      select: cleanupIntentSelect
    });

    return intent ? toRecord(intent as CleanupUploadIntentRecord) : null;
  }
}

export function createCleanupUploadIntentsJob(
  repository: CleanupUploadIntentRepository,
  storage: CleanupUploadIntentStorage,
  options: CleanupUploadIntentsOptions = {}
) {
  const getNow = options.now ?? (() => new Date());
  const limit = options.limit ?? defaultLimit;

  return {
    async run(): Promise<CleanupUploadIntentsResult> {
      const now = getNow();
      const claimed = await repository.claimExpiredPendingIntents({ now, limit });
      let cleaned = 0;
      let missing = 0;
      let storageErrors = 0;

      for (const intent of claimed) {
        try {
          const objectMetadata = await storage.headObject(intent.storageKey);

          if (objectMetadata) {
            await storage.deleteObject(intent.storageKey);
            await repository.markIntentCleaned({
              uploadIntentId: intent.id,
              failureReason: "expired",
              failureDetail: "Expired upload object deleted",
              now: getNow()
            });
            cleaned += 1;
            continue;
          }

          await repository.markIntentCleaned({
            uploadIntentId: intent.id,
            failureReason: "object_missing",
            failureDetail: "Expired upload object missing",
            now: getNow()
          });
          missing += 1;
        } catch (error) {
          if (error instanceof CleanupUploadIntentStorageError) {
            await repository.markIntentCleanupStorageError({
              uploadIntentId: intent.id,
              failureDetail: "Object storage cleanup failed"
            });
            storageErrors += 1;
            continue;
          }

          throw error;
        }
      }

      return {
        claimed: claimed.length,
        cleaned,
        missing,
        storageErrors
      };
    }
  };
}

export type CleanupUploadIntentsJob = ReturnType<typeof createCleanupUploadIntentsJob>;
