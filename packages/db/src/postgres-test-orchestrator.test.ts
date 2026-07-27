import { describe, expect, it } from "vitest";

import { runPostgresTestGate } from "./postgres-test-orchestrator.js";

describe("PostgreSQL test gate orchestration", () => {
  it("normalizes the runtime capability before each suite and deploys before API tests", async () => {
    // Given
    const calls: string[] = [];

    // When
    await runPostgresTestGate(
      {},
      {
        async revokeConfiguredRuntimeCapability() {
          calls.push("revoke");
        },
        async resetAndDeployDatabase() {
          calls.push("deploy");
        },
        async runCommand({ args }) {
          calls.push(args.join(" "));
        }
      }
    );

    // Then
    expect(calls).toEqual([
      "revoke",
      "--filter @jixia/db test:postgres",
      "revoke",
      "deploy",
      "--filter @jixia/api test:postgres"
    ]);
  });

  it("stops before the handoff when the database suite fails", async () => {
    // Given
    const calls: string[] = [];

    // When
    const run = runPostgresTestGate(
      {},
      {
        async revokeConfiguredRuntimeCapability() {
          calls.push("revoke");
        },
        async resetAndDeployDatabase() {
          calls.push("deploy");
        },
        async runCommand({ args }) {
          calls.push(args.join(" "));
          throw new Error("database suite failed");
        }
      }
    );

    // Then
    await expect(run).rejects.toThrow("database suite failed");
    expect(calls).toEqual(["revoke", "--filter @jixia/db test:postgres"]);
  });
});
