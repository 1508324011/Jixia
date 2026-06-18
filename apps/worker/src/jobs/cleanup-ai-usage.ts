import type { PrismaClient } from "@jixia/db/generated";
import { aiUsageRetentionDays } from "@jixia/shared";

export type CleanupAIUsageRepository = {
  readonly deleteUsageBefore: (cutoff: Date) => Promise<number>;
};

export type CleanupAIUsageResult = {
  readonly cutoff: string;
  readonly deleted: number;
};

export type CleanupAIUsageOptions = {
  readonly now?: () => Date;
  readonly retentionDays?: number;
};

const millisecondsPerDay = 24 * 60 * 60 * 1_000;

function retentionCutoff(now: Date, retentionDays: number): Date {
  return new Date(now.getTime() - retentionDays * millisecondsPerDay);
}

export class PrismaCleanupAIUsageRepository implements CleanupAIUsageRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async deleteUsageBefore(cutoff: Date): Promise<number> {
    const result = await this.prisma.aIUsageAggregate.deleteMany({
      where: {
        periodEnd: { lt: cutoff }
      }
    });

    return result.count;
  }
}

export function createCleanupAIUsageJob(
  repository: CleanupAIUsageRepository,
  options: CleanupAIUsageOptions = {}
) {
  const getNow = options.now ?? (() => new Date());
  const retentionDays = options.retentionDays ?? aiUsageRetentionDays;

  return {
    async run(): Promise<CleanupAIUsageResult> {
      const cutoff = retentionCutoff(getNow(), retentionDays);
      const deleted = await repository.deleteUsageBefore(cutoff);

      return {
        cutoff: cutoff.toISOString(),
        deleted
      };
    }
  };
}

export type CleanupAIUsageJob = ReturnType<typeof createCleanupAIUsageJob>;
