import { terminalUploadIntentStatuses, type TerminalUploadIntentStatus } from "@jixia/shared";
import { describe, expect, it } from "vitest";

import {
  createCleanupUploadIntentMetadataJob,
  PrismaCleanupUploadIntentMetadataRepository,
  type CleanupUploadIntentMetadataRepository
} from "./cleanup-upload-intent-metadata.js";

const baseNow = new Date("2026-06-15T12:00:00.000Z");

type InMemoryIntent = {
  readonly id: string;
  readonly status: "pending" | TerminalUploadIntentStatus;
  readonly updatedAt: Date;
};

class InMemoryCleanupMetadataRepository implements CleanupUploadIntentMetadataRepository {
  readonly intents = new Map<string, InMemoryIntent>();
  cutoff: Date | undefined;
  statuses: readonly TerminalUploadIntentStatus[] | undefined;

  async deleteTerminalMetadataBefore(input: {
    readonly cutoff: Date;
    readonly statuses: readonly TerminalUploadIntentStatus[];
  }): Promise<number> {
    this.cutoff = input.cutoff;
    this.statuses = input.statuses;
    let deleted = 0;

    for (const intent of this.intents.values()) {
      if (input.statuses.includes(intent.status as TerminalUploadIntentStatus) && intent.updatedAt < input.cutoff) {
        this.intents.delete(intent.id);
        deleted += 1;
      }
    }

    return deleted;
  }

  seed(input: InMemoryIntent): void {
    this.intents.set(input.id, input);
  }
}

describe("cleanup upload intent metadata job", () => {
  it("deletes only terminal metadata older than the retention cutoff", async () => {
    const repository = new InMemoryCleanupMetadataRepository();
    const oldUpdatedAt = new Date("2026-05-16T11:59:59.999Z");
    const recentUpdatedAt = new Date("2026-05-16T12:00:00.000Z");
    repository.seed({ id: "old-pending", status: "pending", updatedAt: oldUpdatedAt });
    repository.seed({ id: "old-confirmed", status: "confirmed", updatedAt: oldUpdatedAt });
    repository.seed({ id: "old-failed", status: "failed", updatedAt: oldUpdatedAt });
    repository.seed({ id: "old-expired", status: "expired", updatedAt: oldUpdatedAt });
    repository.seed({ id: "old-cleaned", status: "cleaned", updatedAt: oldUpdatedAt });
    repository.seed({ id: "recent-confirmed", status: "confirmed", updatedAt: recentUpdatedAt });
    const job = createCleanupUploadIntentMetadataJob(repository, { now: () => baseNow });

    await expect(job.run()).resolves.toEqual({
      cutoff: "2026-05-16T12:00:00.000Z",
      deleted: 4
    });

    expect(repository.statuses).toEqual(terminalUploadIntentStatuses);
    expect([...repository.intents.keys()].sort()).toEqual(["old-pending", "recent-confirmed"]);
  });

  it("returns count-only metadata without sensitive payload fields", async () => {
    const repository = new InMemoryCleanupMetadataRepository();
    const job = createCleanupUploadIntentMetadataJob(repository, {
      now: () => baseNow,
      retentionDays: 7
    });

    const result = await job.run();

    expect(result).toEqual({ cutoff: "2026-06-08T12:00:00.000Z", deleted: 0 });
    expect(JSON.stringify(result)).not.toMatch(/signed|authorization|cookie|token|credential|storageKey|prompt|response/i);
  });
});

describe("PrismaCleanupUploadIntentMetadataRepository", () => {
  it("filters deleteMany to terminal statuses and old updatedAt rows", async () => {
    const cutoff = new Date("2026-05-16T12:00:00.000Z");
    const prisma = {
      uploadIntent: {
        deleteMany: async (input: {
          readonly where: {
            readonly status: { readonly in: readonly TerminalUploadIntentStatus[] };
            readonly updatedAt: { readonly lt: Date };
          };
        }) => {
          expect(input.where.status.in).toEqual(terminalUploadIntentStatuses);
          expect(input.where.updatedAt.lt).toBe(cutoff);
          return { count: 3 };
        }
      }
    } as unknown as ConstructorParameters<typeof PrismaCleanupUploadIntentMetadataRepository>[0];
    const repository = new PrismaCleanupUploadIntentMetadataRepository(prisma);

    await expect(
      repository.deleteTerminalMetadataBefore({ cutoff, statuses: terminalUploadIntentStatuses })
    ).resolves.toBe(3);
  });
});
