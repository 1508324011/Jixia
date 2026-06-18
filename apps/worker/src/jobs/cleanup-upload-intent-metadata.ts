import type { PrismaClient } from "@jixia/db/generated";
import { terminalUploadIntentMetadataRetentionDays, terminalUploadIntentStatuses } from "@jixia/shared";
import type { TerminalUploadIntentStatus } from "@jixia/shared";

export type CleanupUploadIntentMetadataRepository = {
  readonly deleteTerminalMetadataBefore: (input: {
    readonly cutoff: Date;
    readonly statuses: readonly TerminalUploadIntentStatus[];
  }) => Promise<number>;
};

export type CleanupUploadIntentMetadataResult = {
  readonly cutoff: string;
  readonly deleted: number;
};

export type CleanupUploadIntentMetadataOptions = {
  readonly now?: () => Date;
  readonly retentionDays?: number;
};

const millisecondsPerDay = 24 * 60 * 60 * 1_000;

function retentionCutoff(now: Date, retentionDays: number): Date {
  return new Date(now.getTime() - retentionDays * millisecondsPerDay);
}

export class PrismaCleanupUploadIntentMetadataRepository implements CleanupUploadIntentMetadataRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async deleteTerminalMetadataBefore(input: {
    readonly cutoff: Date;
    readonly statuses: readonly TerminalUploadIntentStatus[];
  }): Promise<number> {
    const result = await this.prisma.uploadIntent.deleteMany({
      where: {
        status: { in: [...input.statuses] },
        updatedAt: { lt: input.cutoff }
      }
    });

    return result.count;
  }
}

export function createCleanupUploadIntentMetadataJob(
  repository: CleanupUploadIntentMetadataRepository,
  options: CleanupUploadIntentMetadataOptions = {}
) {
  const getNow = options.now ?? (() => new Date());
  const retentionDays = options.retentionDays ?? terminalUploadIntentMetadataRetentionDays;

  return {
    async run(): Promise<CleanupUploadIntentMetadataResult> {
      const cutoff = retentionCutoff(getNow(), retentionDays);
      const deleted = await repository.deleteTerminalMetadataBefore({
        cutoff,
        statuses: terminalUploadIntentStatuses
      });

      return {
        cutoff: cutoff.toISOString(),
        deleted
      };
    }
  };
}

export type CleanupUploadIntentMetadataJob = ReturnType<typeof createCleanupUploadIntentMetadataJob>;
