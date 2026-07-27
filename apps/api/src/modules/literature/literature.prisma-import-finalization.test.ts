import { Prisma as PrismaRuntime } from "@jixia/db/generated";
import { describe, expect, it } from "vitest";

import { ImportIdentityRaceError } from "./literature.prisma-import-identity.js";
import { isReplayableFinalizationRace } from "./literature.prisma-import-finalization.js";

function uniqueConstraintError(
  modelName: string,
  constraint: Readonly<Record<string, unknown>> | undefined
): PrismaRuntime.PrismaClientKnownRequestError {
  return new PrismaRuntime.PrismaClientKnownRequestError("Unique constraint failed", {
    code: "P2002",
    clientVersion: "7.8.0",
    meta: {
      modelName,
      driverAdapterError: {
        name: "DriverAdapterError",
        cause: {
          originalCode: "23505",
          originalMessage: "duplicate key value violates unique constraint",
          kind: "UniqueConstraintViolation",
          ...(constraint === undefined ? {} : { constraint })
        }
      }
    }
  });
}

describe("Prisma import finalization race classification", () => {
  it.each([
    ["personal DOI", ["\"ownerUserId\"", "\"identityValue\""]],
    ["project DOI", ["\"projectId\"", "\"identityValue\""]],
    ["personal provider", ["\"ownerUserId\"", "\"providerKey\"", "\"identityValue\""]],
    ["project provider", ["\"projectId\"", "\"providerKey\"", "\"identityValue\""]]
  ])("replays the %s identity constraint", (_name, fields) => {
    // Given: adapter-pg reports a LiteratureIdentity partial-index violation by exact fields
    const error = uniqueConstraintError("LiteratureIdentity", { fields });

    // When: finalization classifies the failed transaction
    const replayable = isReplayableFinalizationRace(error);

    // Then: the identity claim may be reread on one replay
    expect(replayable).toBe(true);
  });

  it("replays the explicit identity race signal", () => {
    // Given: identity resolution detected a concurrent winner after its insert attempt
    const error = new ImportIdentityRaceError();

    // When: finalization classifies the failed transaction
    const replayable = isReplayableFinalizationRace(error);

    // Then: the identity claim may be reread on one replay
    expect(replayable).toBe(true);
  });

  it.each([
    ["assertion ordinal", "Assertion", { fields: ["\"literatureId\"", "\"ordinal\""] }],
    ["unknown identity fields", "LiteratureIdentity", { fields: ["\"literatureId\""] }],
    ["named unknown index", "LiteratureIdentity", { index: "Unknown_identity_key" }],
    ["missing constraint", "LiteratureIdentity", undefined]
  ])("does not replay a %s uniqueness violation", (_name, modelName, constraint) => {
    // Given: P2002 does not identify one of the four scope-local identity constraints
    const error = uniqueConstraintError(modelName, constraint);

    // When: finalization classifies the failed transaction
    const replayable = isReplayableFinalizationRace(error);

    // Then: the original persistence failure is not masked as an operation conflict
    expect(replayable).toBe(false);
  });
});
