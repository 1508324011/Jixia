import type { UploadFailureReason } from "@jixia/shared";
import { beforeEach, describe, expect, it } from "vitest";

import {
  CleanupUploadIntentStorageError,
  createCleanupUploadIntentsJob,
  PrismaCleanupUploadIntentRepository,
  type CleanupUploadIntentRecord,
  type CleanupUploadIntentRepository,
  type CleanupUploadIntentStorage
} from "./cleanup-upload-intents.js";

const baseNow = new Date("2026-06-14T12:00:00.000Z");

type InMemoryIntent = Omit<CleanupUploadIntentRecord, "status"> & {
  readonly expiresAt: Date;
  readonly cleanedAt: Date | null;
  readonly status: "pending" | "confirmed" | "expired" | "cleaned";
};

class InMemoryCleanupRepository implements CleanupUploadIntentRepository {
  readonly intents = new Map<string, InMemoryIntent>();

  async claimExpiredPendingIntents(input: {
    readonly now: Date;
    readonly limit: number;
  }): Promise<readonly CleanupUploadIntentRecord[]> {
    const candidates = Array.from(this.intents.values())
      .filter((intent) => intent.status === "pending" && intent.expiresAt <= input.now)
      .sort((left, right) => left.expiresAt.getTime() - right.expiresAt.getTime())
      .slice(0, input.limit);

    return candidates.map((intent) => {
      const claimed: InMemoryIntent = {
        ...intent,
        status: "expired",
        failureReason: "expired",
        failureDetail: "Upload intent expired"
      };
      this.intents.set(intent.id, claimed);
      return this.toCleanupRecord(claimed);
    });
  }

  async markIntentCleaned(input: {
    readonly uploadIntentId: string;
    readonly failureReason: UploadFailureReason;
    readonly failureDetail: string;
    readonly now: Date;
  }): Promise<CleanupUploadIntentRecord | null> {
    const intent = this.intents.get(input.uploadIntentId);

    if (!intent || intent.status !== "expired") {
      return null;
    }

    const cleaned: InMemoryIntent = {
      ...intent,
      status: "cleaned",
      failureReason: input.failureReason,
      failureDetail: input.failureDetail,
      cleanedAt: input.now
    };
    this.intents.set(intent.id, cleaned);
    return this.toCleanupRecord(cleaned);
  }

  async markIntentCleanupStorageError(input: {
    readonly uploadIntentId: string;
    readonly failureDetail: string;
  }): Promise<CleanupUploadIntentRecord | null> {
    const intent = this.intents.get(input.uploadIntentId);

    if (!intent || intent.status !== "expired") {
      return null;
    }

    const failed: InMemoryIntent = {
      ...intent,
      failureReason: "storage_error",
      failureDetail: input.failureDetail
    };
    this.intents.set(intent.id, failed);
    return this.toCleanupRecord(failed);
  }

  seed(input: {
    readonly id: string;
    readonly storageKey?: string;
    readonly status: "pending" | "confirmed";
    readonly expiresAt: Date;
  }): void {
    this.intents.set(input.id, {
      id: input.id,
      storageKey: input.storageKey ?? `tmp/uploads/${input.id}/file.bin`,
      status: input.status,
      failureReason: null,
      failureDetail: null,
      expiresAt: input.expiresAt,
      cleanedAt: null
    });
  }

  private toCleanupRecord(intent: InMemoryIntent): CleanupUploadIntentRecord {
    if (intent.status !== "expired" && intent.status !== "cleaned") {
      throw new Error("Intent was not claimed for cleanup");
    }

    return {
      id: intent.id,
      storageKey: intent.storageKey,
      status: intent.status,
      failureReason: intent.failureReason,
      failureDetail: intent.failureDetail
    };
  }
}

class InMemoryCleanupStorage implements CleanupUploadIntentStorage {
  readonly objects = new Set<string>();
  readonly deleted: string[] = [];
  failKeys = new Set<string>();

  async headObject(storageKey: string): Promise<unknown | null> {
    if (this.failKeys.has(storageKey)) {
      throw new CleanupUploadIntentStorageError();
    }

    return this.objects.has(storageKey) ? { ok: true } : null;
  }

  async deleteObject(storageKey: string): Promise<void> {
    if (this.failKeys.has(storageKey)) {
      throw new CleanupUploadIntentStorageError();
    }

    this.deleted.push(storageKey);
    this.objects.delete(storageKey);
  }
}

describe("cleanup upload intents job", () => {
  let repository: InMemoryCleanupRepository;
  let storage: InMemoryCleanupStorage;

  beforeEach(() => {
    repository = new InMemoryCleanupRepository();
    storage = new InMemoryCleanupStorage();
  });

  it("claims expired pending intents and deletes existing temp objects", async () => {
    repository.seed({ id: "expired-existing", status: "pending", expiresAt: new Date(baseNow.getTime() - 1) });
    storage.objects.add("tmp/uploads/expired-existing/file.bin");
    const job = createCleanupUploadIntentsJob(repository, storage, { now: () => baseNow });

    await expect(job.run()).resolves.toEqual({
      claimed: 1,
      cleaned: 1,
      missing: 0,
      storageErrors: 0
    });
    expect(storage.deleted).toEqual(["tmp/uploads/expired-existing/file.bin"]);
    expect(repository.intents.get("expired-existing")).toMatchObject({
      status: "cleaned",
      failureReason: "expired",
      failureDetail: "Expired upload object deleted",
      cleanedAt: baseNow
    });
  });

  it("marks missing expired objects as cleaned with object_missing", async () => {
    repository.seed({ id: "expired-missing", status: "pending", expiresAt: new Date(baseNow.getTime() - 1) });
    const job = createCleanupUploadIntentsJob(repository, storage, { now: () => baseNow });

    await expect(job.run()).resolves.toEqual({
      claimed: 1,
      cleaned: 0,
      missing: 1,
      storageErrors: 0
    });
    expect(repository.intents.get("expired-missing")).toMatchObject({
      status: "cleaned",
      failureReason: "object_missing",
      failureDetail: "Expired upload object missing",
      cleanedAt: baseNow
    });
  });

  it("records storage errors without persisting sensitive details", async () => {
    repository.seed({ id: "storage-error", status: "pending", expiresAt: new Date(baseNow.getTime() - 1) });
    storage.failKeys.add("tmp/uploads/storage-error/file.bin");
    const job = createCleanupUploadIntentsJob(repository, storage, { now: () => baseNow });

    await expect(job.run()).resolves.toEqual({
      claimed: 1,
      cleaned: 0,
      missing: 0,
      storageErrors: 1
    });
    const intent = repository.intents.get("storage-error");
    expect(intent).toMatchObject({
      status: "expired",
      failureReason: "storage_error",
      failureDetail: "Object storage cleanup failed",
      cleanedAt: null
    });
    expect(JSON.stringify(intent)).not.toMatch(/signed|authorization|cookie|token|credential|contents/i);
  });

  it("preserves confirmed intents and unexpired pending intents", async () => {
    repository.seed({ id: "confirmed", status: "confirmed", expiresAt: new Date(baseNow.getTime() - 1) });
    repository.seed({ id: "unexpired", status: "pending", expiresAt: new Date(baseNow.getTime() + 1_000) });
    storage.objects.add("tmp/uploads/confirmed/file.bin");
    storage.objects.add("tmp/uploads/unexpired/file.bin");
    const job = createCleanupUploadIntentsJob(repository, storage, { now: () => baseNow });

    await expect(job.run()).resolves.toEqual({
      claimed: 0,
      cleaned: 0,
      missing: 0,
      storageErrors: 0
    });
    expect(repository.intents.get("confirmed")).toMatchObject({ status: "confirmed", cleanedAt: null });
    expect(repository.intents.get("unexpired")).toMatchObject({ status: "pending", cleanedAt: null });
    expect(storage.deleted).toEqual([]);
  });

  it("uses pending-to-expired claiming so cleanup loses to confirmed races", async () => {
    repository.seed({ id: "race", status: "pending", expiresAt: new Date(baseNow.getTime() - 1) });
    repository.intents.set("race", { ...repository.intents.get("race")!, status: "confirmed" });
    const job = createCleanupUploadIntentsJob(repository, storage, { now: () => baseNow });

    await job.run();

    expect(repository.intents.get("race")).toMatchObject({ status: "confirmed", cleanedAt: null });
    expect(storage.deleted).toEqual([]);
  });
});

describe("PrismaCleanupUploadIntentRepository", () => {
  it("only claims rows that are still pending and expired", async () => {
    const claimedRows = [
      {
        id: "expired-pending",
        storageKey: "tmp/uploads/expired-pending/file.bin",
        status: "expired" as const,
        failureReason: "expired" as const,
        failureDetail: "Upload intent expired"
      }
    ];
    const transaction = {
      uploadIntent: {
        findMany: async (input: { readonly where: { readonly status?: string } }) => input.where.status === "pending" ? [{ id: "expired-pending" }] : claimedRows,
        updateMany: async (input: { readonly where: { readonly status?: string } }) => {
          expect(input.where.status).toBe("pending");
          return { count: 1 };
        },
        findUnique: async () => claimedRows[0]
      }
    };
    const prisma = {
      $transaction: async (callback: (tx: typeof transaction) => Promise<unknown>) => callback(transaction)
    } as unknown as ConstructorParameters<typeof PrismaCleanupUploadIntentRepository>[0];
    const repository = new PrismaCleanupUploadIntentRepository(prisma);

    await expect(repository.claimExpiredPendingIntents({ now: baseNow, limit: 10 })).resolves.toEqual(
      claimedRows
    );
  });
});
