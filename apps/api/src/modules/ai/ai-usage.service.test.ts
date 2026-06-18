import type { AIUsageScope, SpaceRole } from "@jixia/shared";
import { beforeEach, describe, expect, it } from "vitest";

import {
  AIUsageError,
  createAIUsageService,
  type AIUsageActor,
  type AIUsageAggregateRecord,
  type AIUsageRepository,
  type AIUsageService
} from "./ai-usage.service.js";

const createdAt = new Date("2026-06-15T12:00:00.000Z");
const periodStart = new Date("2026-06-15T00:00:00.000Z");
const periodEnd = new Date("2026-06-16T00:00:00.000Z");

class InMemoryAIUsageRepository implements AIUsageRepository {
  readonly records: AIUsageAggregateRecord[] = [];
  private nextId = 1;

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
    const userRecord = this.record({
      ...input,
      scope: "user",
      userId: input.actorUserId,
      spaceId: null
    });
    const spaceRecord = this.record({
      ...input,
      scope: "space",
      userId: null,
      spaceId: input.spaceId
    });
    this.records.push(userRecord, spaceRecord);
    return [userRecord, spaceRecord];
  }

  async listUserUsage(input: {
    readonly userId: string;
    readonly periodStart: Date;
    readonly periodEnd: Date;
  }): Promise<readonly AIUsageAggregateRecord[]> {
    return this.records.filter(
      (record) =>
        record.scope === "user" &&
        record.userId === input.userId &&
        record.periodStart >= input.periodStart &&
        record.periodEnd <= input.periodEnd
    );
  }

  async listSpaceUsage(input: {
    readonly spaceId: string;
    readonly periodStart: Date;
    readonly periodEnd: Date;
  }): Promise<readonly AIUsageAggregateRecord[]> {
    return this.records.filter(
      (record) =>
        record.scope === "space" &&
        record.spaceId === input.spaceId &&
        record.periodStart >= input.periodStart &&
        record.periodEnd <= input.periodEnd
    );
  }

  private record(input: {
    readonly scope: AIUsageScope;
    readonly userId: string | null;
    readonly spaceId: string | null;
    readonly provider: string;
    readonly model: string;
    readonly promptTokens: number;
    readonly completionTokens: number;
    readonly totalTokens: number;
    readonly estimatedCostMicros: number;
    readonly periodStart: Date;
    readonly periodEnd: Date;
  }): AIUsageAggregateRecord {
    return {
      id: `usage-${this.nextId++}`,
      scope: input.scope,
      userId: input.userId,
      spaceId: input.spaceId,
      periodStart: input.periodStart,
      periodEnd: input.periodEnd,
      provider: input.provider,
      model: input.model,
      promptTokens: input.promptTokens,
      completionTokens: input.completionTokens,
      totalTokens: input.totalTokens,
      estimatedCostMicros: input.estimatedCostMicros,
      createdAt,
      updatedAt: createdAt
    };
  }
}

function actor(userId = "user-1", spaceRole: SpaceRole = "SpaceMember"): AIUsageActor {
  return { userId, spaceId: "space-1", spaceRole };
}

async function expectAIUsageError(promise: Promise<unknown>, statusCode: number): Promise<void> {
  await expect(promise).rejects.toSatisfy((error: unknown) => {
    expect(error).toBeInstanceOf(AIUsageError);
    expect((error as AIUsageError).statusCode).toBe(statusCode);
    return true;
  });
}

describe("AI usage service", () => {
  let repository: InMemoryAIUsageRepository;
  let service: AIUsageService;

  beforeEach(() => {
    repository = new InMemoryAIUsageRepository();
    service = createAIUsageService(repository);
  });

  it("records only user and space aggregate rows for a usage event", async () => {
    await expect(
      service.recordUsage({
        actor: actor(),
        provider: " openai ",
        model: " gpt-test ",
        promptTokens: 10,
        completionTokens: 25,
        estimatedCostMicros: 1234,
        periodStart,
        periodEnd
      })
    ).resolves.toEqual({ ok: true });

    expect(repository.records).toHaveLength(2);
    expect(repository.records).toEqual([
      expect.objectContaining({
        scope: "user",
        userId: "user-1",
        spaceId: null,
        provider: "openai",
        model: "gpt-test",
        promptTokens: 10,
        completionTokens: 25,
        totalTokens: 35,
        estimatedCostMicros: 1234
      }),
      expect.objectContaining({
        scope: "space",
        userId: null,
        spaceId: "space-1",
        provider: "openai",
        model: "gpt-test",
        promptTokens: 10,
        completionTokens: 25,
        totalTokens: 35,
        estimatedCostMicros: 1234
      })
    ]);
    expect(JSON.stringify(repository.records)).not.toContain("rawPrompt");
    expect(JSON.stringify(repository.records)).not.toContain("promptBody");
    expect(JSON.stringify(repository.records)).not.toContain("responseBody");
    expect(JSON.stringify(repository.records)).not.toContain("apiKey");
  });

  it("summarizes current user usage by provider and model", async () => {
    await service.recordUsage({
      actor: actor(),
      provider: "openai",
      model: "gpt-test",
      promptTokens: 10,
      completionTokens: 5,
      estimatedCostMicros: 100,
      periodStart,
      periodEnd
    });
    await service.recordUsage({
      actor: actor(),
      provider: "openai",
      model: "gpt-test",
      promptTokens: 3,
      completionTokens: 7,
      estimatedCostMicros: 50,
      periodStart,
      periodEnd
    });
    await service.recordUsage({
      actor: actor("other-user"),
      provider: "openai",
      model: "gpt-test",
      promptTokens: 100,
      completionTokens: 100,
      estimatedCostMicros: 999,
      periodStart,
      periodEnd
    });

    await expect(service.getMyUsage({ actor: actor(), periodStart, periodEnd })).resolves.toEqual({
      usage: {
        scope: "user",
        userId: "user-1",
        periodStart: periodStart.toISOString(),
        periodEnd: periodEnd.toISOString(),
        metrics: [
          {
            provider: "openai",
            model: "gpt-test",
            promptTokens: 13,
            completionTokens: 12,
            totalTokens: 25,
            estimatedCostMicros: 150
          }
        ]
      }
    });
  });

  it("allows only SpaceAdmin actors to view space aggregate usage", async () => {
    await service.recordUsage({
      actor: actor(),
      provider: "openai",
      model: "gpt-test",
      promptTokens: 10,
      completionTokens: 5,
      estimatedCostMicros: 100,
      periodStart,
      periodEnd
    });

    await expectAIUsageError(service.getSpaceUsage({ actor: actor("user-1"), periodStart, periodEnd }), 403);
    await expect(service.getSpaceUsage({ actor: actor("admin-user", "SpaceAdmin"), periodStart, periodEnd })).resolves.toEqual({
      usage: {
        scope: "space",
        spaceId: "space-1",
        periodStart: periodStart.toISOString(),
        periodEnd: periodEnd.toISOString(),
        metrics: [
          {
            provider: "openai",
            model: "gpt-test",
            promptTokens: 10,
            completionTokens: 5,
            totalTokens: 15,
            estimatedCostMicros: 100
          }
        ]
      }
    });
  });

  it("rejects invalid token counts and invalid usage windows", async () => {
    await expectAIUsageError(
      service.recordUsage({
        actor: actor(),
        provider: "openai",
        model: "gpt-test",
        promptTokens: -1,
        completionTokens: 5,
        estimatedCostMicros: 100,
        periodStart,
        periodEnd
      }),
      400
    );
    await expectAIUsageError(
      service.getMyUsage({ actor: actor(), periodStart: periodEnd, periodEnd: periodStart }),
      400
    );
  });
});
