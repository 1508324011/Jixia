import { describe, expect, it } from "vitest";

import { createCleanupAIUsageJob, type CleanupAIUsageRepository } from "./cleanup-ai-usage.js";

class CapturingCleanupAIUsageRepository implements CleanupAIUsageRepository {
  cutoff: Date | undefined;

  constructor(private readonly deleted: number) {}

  async deleteUsageBefore(cutoff: Date): Promise<number> {
    this.cutoff = cutoff;
    return this.deleted;
  }
}

describe("cleanup AI usage job", () => {
  it("deletes aggregate usage rows older than the retention cutoff", async () => {
    const repository = new CapturingCleanupAIUsageRepository(4);
    const job = createCleanupAIUsageJob(repository, {
      now: () => new Date("2026-06-15T12:00:00.000Z"),
      retentionDays: 30
    });

    await expect(job.run()).resolves.toEqual({
      cutoff: "2026-05-16T12:00:00.000Z",
      deleted: 4
    });
    expect(repository.cutoff?.toISOString()).toBe("2026-05-16T12:00:00.000Z");
  });

  it("uses the configured retention window instead of exposing per-call details", async () => {
    const repository = new CapturingCleanupAIUsageRepository(0);
    const job = createCleanupAIUsageJob(repository, {
      now: () => new Date("2026-06-15T12:00:00.000Z"),
      retentionDays: 7
    });

    const result = await job.run();

    expect(result).toEqual({ cutoff: "2026-06-08T12:00:00.000Z", deleted: 0 });
    expect(JSON.stringify(result)).not.toContain("prompt");
    expect(JSON.stringify(result)).not.toContain("response");
    expect(JSON.stringify(result)).not.toContain("apiKey");
  });
});
