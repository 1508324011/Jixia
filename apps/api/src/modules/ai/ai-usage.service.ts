import type { Prisma, PrismaClient } from "@jixia/db/generated";
import type {
  AIUsageAggregateResponse,
  AIUsageMetricView,
  AIUsageScope,
  SpaceRole
} from "@jixia/shared";

export class AIUsageError extends Error {
  constructor(
    message: string,
    readonly statusCode: number
  ) {
    super(message);
    this.name = "AIUsageError";
  }
}

export type AIUsageActor = {
  readonly userId: string;
  readonly spaceId: string;
  readonly spaceRole: SpaceRole;
};

export type AIUsageAggregateRecord = {
  readonly id: string;
  readonly scope: AIUsageScope;
  readonly userId: string | null;
  readonly spaceId: string | null;
  readonly periodStart: Date;
  readonly periodEnd: Date;
  readonly provider: string;
  readonly model: string;
  readonly promptTokens: number;
  readonly completionTokens: number;
  readonly totalTokens: number;
  readonly estimatedCostMicros: number;
  readonly createdAt: Date;
  readonly updatedAt: Date;
};

export type RecordAIUsageInput = {
  readonly actor: AIUsageActor;
  readonly provider: string;
  readonly model: string;
  readonly promptTokens: number;
  readonly completionTokens: number;
  readonly estimatedCostMicros: number;
  readonly periodStart: Date;
  readonly periodEnd: Date;
};

export type AIUsageRepository = {
  readonly createUsageAggregates: (input: {
    readonly actorUserId: string;
    readonly spaceId: string;
    readonly provider: string;
    readonly model: string;
    readonly promptTokens: number;
    readonly completionTokens: number;
    readonly totalTokens: number;
    readonly estimatedCostMicros: number;
    readonly periodStart: Date;
    readonly periodEnd: Date;
  }) => Promise<readonly AIUsageAggregateRecord[]>;
  readonly listUserUsage: (input: {
    readonly userId: string;
    readonly periodStart: Date;
    readonly periodEnd: Date;
  }) => Promise<readonly AIUsageAggregateRecord[]>;
  readonly listSpaceUsage: (input: {
    readonly spaceId: string;
    readonly periodStart: Date;
    readonly periodEnd: Date;
  }) => Promise<readonly AIUsageAggregateRecord[]>;
};

function badRequest(message = "Invalid request"): AIUsageError {
  return new AIUsageError(message, 400);
}

function forbidden(message = "Forbidden"): AIUsageError {
  return new AIUsageError(message, 403);
}

function toIsoString(date: Date): string {
  return date.toISOString();
}

function ensureText(value: string, fieldName: string): string {
  const trimmed = value.trim();

  if (!trimmed || trimmed.length > 256) {
    throw badRequest(`Invalid ${fieldName}`);
  }

  return trimmed;
}

function ensureTokenCount(value: number, fieldName: string): number {
  if (!Number.isInteger(value) || value < 0 || value > 1_000_000_000) {
    throw badRequest(`Invalid ${fieldName}`);
  }

  return value;
}

function ensureUsageWindow(periodStart: Date, periodEnd: Date): void {
  if (Number.isNaN(periodStart.getTime()) || Number.isNaN(periodEnd.getTime()) || periodStart >= periodEnd) {
    throw badRequest("Invalid usage period");
  }
}

function summarizeMetrics(records: readonly AIUsageAggregateRecord[]): readonly AIUsageMetricView[] {
  const metrics = new Map<string, AIUsageMetricView>();

  for (const record of records) {
    const key = `${record.provider}\u0000${record.model}`;
    const current = metrics.get(key) ?? {
      provider: record.provider,
      model: record.model,
      promptTokens: 0,
      completionTokens: 0,
      totalTokens: 0,
      estimatedCostMicros: 0
    };

    metrics.set(key, {
      provider: current.provider,
      model: current.model,
      promptTokens: current.promptTokens + record.promptTokens,
      completionTokens: current.completionTokens + record.completionTokens,
      totalTokens: current.totalTokens + record.totalTokens,
      estimatedCostMicros: current.estimatedCostMicros + record.estimatedCostMicros
    });
  }

  return Array.from(metrics.values()).sort((left, right) =>
    `${left.provider}/${left.model}`.localeCompare(`${right.provider}/${right.model}`)
  );
}

const aiUsageAggregateSelect = {
  id: true,
  scope: true,
  userId: true,
  spaceId: true,
  periodStart: true,
  periodEnd: true,
  provider: true,
  model: true,
  promptTokens: true,
  completionTokens: true,
  totalTokens: true,
  estimatedCostMicros: true,
  createdAt: true,
  updatedAt: true
} satisfies Prisma.AIUsageAggregateSelect;

function toUsageRecord(record: AIUsageAggregateRecord): AIUsageAggregateRecord {
  return record;
}

export class PrismaAIUsageRepository implements AIUsageRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async createUsageAggregates(input: {
    readonly actorUserId: string;
    readonly spaceId: string;
    readonly provider: string;
    readonly model: string;
    readonly promptTokens: number;
    readonly completionTokens: number;
    readonly totalTokens: number;
    readonly estimatedCostMicros: number;
    readonly periodStart: Date;
    readonly periodEnd: Date;
  }): Promise<readonly AIUsageAggregateRecord[]> {
    const records = await this.prisma.$transaction([
      this.prisma.aIUsageAggregate.create({
        data: {
          scope: "user",
          userId: input.actorUserId,
          spaceId: null,
          periodStart: input.periodStart,
          periodEnd: input.periodEnd,
          provider: input.provider,
          model: input.model,
          promptTokens: input.promptTokens,
          completionTokens: input.completionTokens,
          totalTokens: input.totalTokens,
          estimatedCostMicros: input.estimatedCostMicros
        },
        select: aiUsageAggregateSelect
      }),
      this.prisma.aIUsageAggregate.create({
        data: {
          scope: "space",
          userId: null,
          spaceId: input.spaceId,
          periodStart: input.periodStart,
          periodEnd: input.periodEnd,
          provider: input.provider,
          model: input.model,
          promptTokens: input.promptTokens,
          completionTokens: input.completionTokens,
          totalTokens: input.totalTokens,
          estimatedCostMicros: input.estimatedCostMicros
        },
        select: aiUsageAggregateSelect
      })
    ]);

    return records.map(toUsageRecord);
  }

  async listUserUsage(input: {
    readonly userId: string;
    readonly periodStart: Date;
    readonly periodEnd: Date;
  }): Promise<readonly AIUsageAggregateRecord[]> {
    const records = await this.prisma.aIUsageAggregate.findMany({
      where: {
        scope: "user",
        userId: input.userId,
        periodStart: { gte: input.periodStart },
        periodEnd: { lte: input.periodEnd }
      },
      orderBy: [{ periodStart: "asc" }, { provider: "asc" }, { model: "asc" }],
      select: aiUsageAggregateSelect
    });

    return records.map(toUsageRecord);
  }

  async listSpaceUsage(input: {
    readonly spaceId: string;
    readonly periodStart: Date;
    readonly periodEnd: Date;
  }): Promise<readonly AIUsageAggregateRecord[]> {
    const records = await this.prisma.aIUsageAggregate.findMany({
      where: {
        scope: "space",
        spaceId: input.spaceId,
        periodStart: { gte: input.periodStart },
        periodEnd: { lte: input.periodEnd }
      },
      orderBy: [{ periodStart: "asc" }, { provider: "asc" }, { model: "asc" }],
      select: aiUsageAggregateSelect
    });

    return records.map(toUsageRecord);
  }
}

export function createAIUsageService(repository: AIUsageRepository) {
  return {
    async recordUsage(input: RecordAIUsageInput): Promise<{ readonly ok: true }> {
      ensureUsageWindow(input.periodStart, input.periodEnd);
      const promptTokens = ensureTokenCount(input.promptTokens, "prompt tokens");
      const completionTokens = ensureTokenCount(input.completionTokens, "completion tokens");
      const estimatedCostMicros = ensureTokenCount(input.estimatedCostMicros, "estimated cost");

      await repository.createUsageAggregates({
        actorUserId: input.actor.userId,
        spaceId: input.actor.spaceId,
        provider: ensureText(input.provider, "provider"),
        model: ensureText(input.model, "model"),
        promptTokens,
        completionTokens,
        totalTokens: promptTokens + completionTokens,
        estimatedCostMicros,
        periodStart: input.periodStart,
        periodEnd: input.periodEnd
      });

      return { ok: true };
    },

    async getMyUsage(input: {
      readonly actor: AIUsageActor;
      readonly periodStart: Date;
      readonly periodEnd: Date;
    }): Promise<AIUsageAggregateResponse> {
      ensureUsageWindow(input.periodStart, input.periodEnd);
      const records = await repository.listUserUsage({
        userId: input.actor.userId,
        periodStart: input.periodStart,
        periodEnd: input.periodEnd
      });

      return {
        usage: {
          scope: "user",
          userId: input.actor.userId,
          periodStart: toIsoString(input.periodStart),
          periodEnd: toIsoString(input.periodEnd),
          metrics: summarizeMetrics(records)
        }
      };
    },

    async getSpaceUsage(input: {
      readonly actor: AIUsageActor;
      readonly periodStart: Date;
      readonly periodEnd: Date;
    }): Promise<AIUsageAggregateResponse> {
      if (input.actor.spaceRole !== "SpaceAdmin") {
        throw forbidden("SpaceAdmin role required");
      }

      ensureUsageWindow(input.periodStart, input.periodEnd);
      const records = await repository.listSpaceUsage({
        spaceId: input.actor.spaceId,
        periodStart: input.periodStart,
        periodEnd: input.periodEnd
      });

      return {
        usage: {
          scope: "space",
          spaceId: input.actor.spaceId,
          periodStart: toIsoString(input.periodStart),
          periodEnd: toIsoString(input.periodEnd),
          metrics: summarizeMetrics(records)
        }
      };
    }
  };
}

export type AIUsageService = ReturnType<typeof createAIUsageService>;

let cachedService: AIUsageService | undefined;

export async function getDefaultAIUsageService(): Promise<AIUsageService> {
  if (!cachedService) {
    const [{ prisma }] = await Promise.all([import("@jixia/db")]);
    cachedService = createAIUsageService(new PrismaAIUsageRepository(prisma));
  }

  return cachedService;
}
