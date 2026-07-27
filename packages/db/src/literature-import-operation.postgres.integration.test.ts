import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";

import { seedLiteratureOwnershipGraph } from "./literature-postgres-fixture.js";
import { PostgresIntegrationHarness } from "./postgres-integration-harness.js";

const runPostgresIntegration = process.env.JIXIA_RUN_POSTGRES_INTEGRATION === "1";

let harness: PostgresIntegrationHarness | undefined;

function requireHarness(): PostgresIntegrationHarness {
  if (!harness) {
    throw new Error("PostgreSQL integration harness is not connected");
  }
  return harness;
}

async function insertRunningOperation(
  database: PostgresIntegrationHarness,
  id: string,
  idempotencyKey: string,
  takeoverAfter = "2099-01-01T00:00:00.000Z"
): Promise<void> {
  await database.query(
    `INSERT INTO "ImportOperation" (
      "id", "ownerUserId", "projectId", "createdByUserId",
      "idempotencyKey", "requestFingerprint", "sourceProviderKey", "sourceRecordKey",
      "status", "attemptCount", "finishedAttemptCount", "attemptStartedAt", "takeoverAfter",
      "finishedAt", "literatureId", "warningCodes", "failureCode", "updatedAt"
    ) VALUES (
      $1, 'user-1', NULL, 'user-1', $2, repeat('a', 64), 'crossref', '10.1000/seed',
      'running', 1, NULL, '2026-07-18T00:00:00.000Z', $3,
      NULL, NULL, ARRAY[]::"LiteratureImportWarningCode"[], NULL, '2026-07-18T00:00:00.000Z'
    )`,
    [id, idempotencyKey, takeoverAfter]
  );
}

describe.skipIf(!runPostgresIntegration)("Literature import operation state", () => {
  beforeAll(async () => {
    harness = await PostgresIntegrationHarness.connectFromEnvironment();
  });

  beforeEach(async () => {
    const database = requireHarness();
    await database.resetAndApplyAllMigrations();
    await seedLiteratureOwnershipGraph(database);
  });

  afterAll(async () => {
    if (harness) {
      await harness.resetAndApplyAllMigrations();
      await harness.close();
    }
  });

  it("finalizes the active running attempt as succeeded", async () => {
    // Given
    const database = requireHarness();
    await insertRunningOperation(database, "operation-success", "key-success");

    // When
    const finalized = await database.query(`
      UPDATE "ImportOperation"
      SET
        "status" = 'succeeded',
        "finishedAttemptCount" = 1,
        "finishedAt" = '2026-07-18T00:00:10.000Z',
        "literatureId" = 'literature-personal-1',
        "takeoverAfter" = NULL,
        "updatedAt" = '2026-07-18T00:00:10.000Z'
      WHERE "id" = 'operation-success' AND "attemptCount" = 1
    `);

    // Then
    expect(finalized.rowCount).toBe(1);
  });

  it("increments a failed retry and rejects the stale attempt by compare-and-set", async () => {
    // Given
    const database = requireHarness();
    await insertRunningOperation(database, "operation-retry", "key-retry");
    await database.query(`
      UPDATE "ImportOperation"
      SET
        "status" = 'failed',
        "finishedAttemptCount" = 1,
        "finishedAt" = '2026-07-18T00:00:10.000Z',
        "failureCode" = 'seed_unavailable',
        "takeoverAfter" = NULL,
        "updatedAt" = '2026-07-18T00:00:10.000Z'
      WHERE "id" = 'operation-retry'
    `);
    await database.query(`
      UPDATE "ImportOperation"
      SET
        "status" = 'running',
        "attemptCount" = 2,
        "finishedAttemptCount" = NULL,
        "attemptStartedAt" = '2026-07-18T00:01:00.000Z',
        "takeoverAfter" = '2099-01-01T00:01:30.000Z',
        "finishedAt" = NULL,
        "failureCode" = NULL,
        "updatedAt" = '2026-07-18T00:01:00.000Z'
      WHERE "id" = 'operation-retry'
    `);

    // When
    const staleFinalizer = await database.query(`
      UPDATE "ImportOperation"
      SET
        "status" = 'succeeded',
        "finishedAttemptCount" = 1,
        "finishedAt" = '2026-07-18T00:01:10.000Z',
        "literatureId" = 'literature-personal-1',
        "takeoverAfter" = NULL
      WHERE "id" = 'operation-retry' AND "status" = 'running' AND "attemptCount" = 1
    `);
    const activeFinalizer = await database.query(`
      UPDATE "ImportOperation"
      SET
        "status" = 'succeeded',
        "finishedAttemptCount" = 2,
        "finishedAt" = '2026-07-18T00:01:11.000Z',
        "literatureId" = 'literature-personal-1',
        "takeoverAfter" = NULL,
        "updatedAt" = '2026-07-18T00:01:11.000Z'
      WHERE "id" = 'operation-retry' AND "status" = 'running' AND "attemptCount" = 2
    `);

    // Then
    expect(staleFinalizer.rowCount).toBe(0);
    expect(activeFinalizer.rowCount).toBe(1);
  });

  it("permits takeover of an expired running attempt", async () => {
    // Given
    const database = requireHarness();
    await insertRunningOperation(
      database,
      "operation-expired",
      "key-expired",
      "2000-01-01T00:00:00.000Z"
    );

    // When
    const takeover = await database.query(`
      UPDATE "ImportOperation"
      SET
        "attemptCount" = 2,
        "attemptStartedAt" = '2026-07-18T00:01:00.000Z',
        "takeoverAfter" = '2099-01-01T00:01:30.000Z',
        "updatedAt" = '2026-07-18T00:01:00.000Z'
      WHERE "id" = 'operation-expired' AND "status" = 'running' AND "attemptCount" = 1
    `);

    // Then
    expect(takeover.rowCount).toBe(1);
  });

  it("rejects takeover while the running attempt is active", async () => {
    // Given
    const database = requireHarness();
    await insertRunningOperation(database, "operation-active", "key-active");

    // When
    const takeover = database.query(`
      UPDATE "ImportOperation"
      SET
        "attemptCount" = 2,
        "attemptStartedAt" = '2026-07-18T00:01:00.000Z',
        "takeoverAfter" = '2099-01-01T00:01:30.000Z'
      WHERE "id" = 'operation-active'
    `);

    // Then
    await expect(takeover).rejects.toMatchObject({
      code: "23514",
      constraint: "ImportOperation_transition_check"
    });
  });

  it("rejects a transition away from succeeded", async () => {
    // Given
    const database = requireHarness();
    await insertRunningOperation(database, "operation-terminal", "key-terminal");
    await database.query(`
      UPDATE "ImportOperation"
      SET
        "status" = 'succeeded',
        "finishedAttemptCount" = 1,
        "finishedAt" = '2026-07-18T00:00:10.000Z',
        "literatureId" = 'literature-personal-1',
        "takeoverAfter" = NULL
      WHERE "id" = 'operation-terminal'
    `);

    // When
    const rewrite = database.query(`
      UPDATE "ImportOperation"
      SET
        "status" = 'failed',
        "literatureId" = NULL,
        "failureCode" = 'internal_error'
      WHERE "id" = 'operation-terminal'
    `);

    // Then
    await expect(rewrite).rejects.toMatchObject({
      code: "23514",
      constraint: "ImportOperation_transition_check"
    });
  });

  it("rejects a result Literature outside the operation scope", async () => {
    // Given
    const database = requireHarness();
    await insertRunningOperation(database, "operation-scope", "key-scope");

    // When
    const finalize = database.query(`
      UPDATE "ImportOperation"
      SET
        "status" = 'succeeded',
        "finishedAttemptCount" = 1,
        "finishedAt" = '2026-07-18T00:00:10.000Z',
        "literatureId" = 'literature-project-1',
        "takeoverAfter" = NULL
      WHERE "id" = 'operation-scope'
    `);

    // Then
    await expect(finalize).rejects.toMatchObject({
      code: "23514",
      constraint: "ImportOperation_result_scope_check"
    });
  });

  it("enforces actor-scoped idempotency keys", async () => {
    // Given
    const database = requireHarness();
    await insertRunningOperation(database, "operation-first", "key-replay");

    // When
    const replay = insertRunningOperation(database, "operation-second", "key-replay");

    // Then
    await expect(replay).rejects.toMatchObject({
      code: "23505",
      constraint: "ImportOperation_createdByUserId_idempotencyKey_key"
    });
  });
});
