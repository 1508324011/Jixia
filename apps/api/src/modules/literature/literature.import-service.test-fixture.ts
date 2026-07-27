import type { LiteratureTargetScope } from "@jixia/shared";

import type {
  AdmitImportInput,
  AdmitImportResult,
  FailedImportOperation,
  FailImportInput,
  FinalizeImportInput,
  ImportOperationRecord,
  LiteratureImportRepository,
  RunningImportOperation,
  SucceededImportOperation
} from "./literature.import-repository.js";
import { LiteratureImportRepositoryError } from "./literature.import-repository.js";
import {
  createLiteratureImportService,
  type LiteratureImportService
} from "./literature.import-service.js";
import { FixtureImportProviders } from "./literature.import-provider.test-fixture.js";
import type { LiteratureActor } from "./literature.repository.js";

export const importFixtureActor: LiteratureActor = {
  userId: "user-1",
  spaceId: "space-1",
  spaceRole: "SpaceMember"
};

const fixtureNow = new Date("2026-07-20T00:00:00.000Z");

export class InMemoryImportRepository implements LiteratureImportRepository {
  readonly finalizeCalls: FinalizeImportInput[] = [];
  readonly failCalls: FailImportInput[] = [];
  readonly history: ImportOperationRecord[] = [];
  admitError: Error | null = null;
  failError: Error | null = null;
  finalizeError: Error | null = null;
  getError: Error | null = null;
  retryError: Error | null = null;
  private operation: ImportOperationRecord | null = null;
  private idempotencyKey: string | null = null;
  private requestSignature: string | null = null;

  async admitImport(input: AdmitImportInput): Promise<AdmitImportResult> {
    if (this.admitError !== null) {
      throw this.admitError;
    }
    const signature = JSON.stringify([input.target, input.seed]);
    if (this.operation !== null && this.idempotencyKey === input.idempotencyKey) {
      if (this.requestSignature !== signature) {
        throw new LiteratureImportRepositoryError("idempotency_conflict");
      }
      return { kind: "replayed", operation: this.operation };
    }
    const operation = createRunningOperation(input);
    this.operation = operation;
    this.idempotencyKey = input.idempotencyKey;
    this.requestSignature = signature;
    this.history.push(operation);
    return { kind: "admitted", operation };
  }

  async getImportOperation(): Promise<ImportOperationRecord> {
    if (this.getError !== null) {
      throw this.getError;
    }
    return this.requireOperation();
  }

  async retryImport(): Promise<RunningImportOperation> {
    if (this.retryError !== null) {
      throw this.retryError;
    }
    const current = this.requireOperation();
    if (current.status === "succeeded") {
      throw new LiteratureImportRepositoryError("operation_conflict");
    }
    if (current.status === "running" && current.takeoverAfter > fixtureNow) {
      throw new LiteratureImportRepositoryError("operation_conflict");
    }
    const running: RunningImportOperation = {
      ...current,
      status: "running",
      attemptCount: current.attemptCount + 1,
      attemptStartedAt: fixtureNow,
      takeoverAfter: new Date(fixtureNow.getTime() + 30_000),
      finishedAt: null,
      literatureId: null,
      warnings: [],
      failureCode: null,
      updatedAt: fixtureNow
    };
    this.operation = running;
    this.history.push(running);
    return running;
  }

  async finalizeImport(input: FinalizeImportInput): Promise<SucceededImportOperation> {
    this.finalizeCalls.push(input);
    if (this.finalizeError !== null) {
      throw this.finalizeError;
    }
    const running = this.requireCurrentAttempt(input.attemptCount);
    const succeeded: SucceededImportOperation = {
      ...running,
      status: "succeeded",
      takeoverAfter: null,
      finishedAt: new Date(fixtureNow.getTime() + 1_000),
      literatureId: "literature-1",
      warnings: input.warningCodes,
      failureCode: null,
      updatedAt: new Date(fixtureNow.getTime() + 1_000)
    };
    this.operation = succeeded;
    this.history.push(succeeded);
    return succeeded;
  }

  async failImport(input: FailImportInput): Promise<FailedImportOperation> {
    this.failCalls.push(input);
    if (this.failError !== null) {
      const error = this.failError;
      this.failError = null;
      throw error;
    }
    const running = this.requireCurrentAttempt(input.attemptCount);
    const failed: FailedImportOperation = {
      ...running,
      status: "failed",
      takeoverAfter: null,
      finishedAt: new Date(fixtureNow.getTime() + 1_000),
      literatureId: null,
      warnings: input.warningCodes,
      failureCode: input.failureCode,
      updatedAt: new Date(fixtureNow.getTime() + 1_000)
    };
    this.operation = failed;
    this.history.push(failed);
    return failed;
  }

  expireRunningAttempt(): void {
    const current = this.requireOperation();
    if (current.status !== "running") {
      throw new LiteratureImportRepositoryError("operation_conflict");
    }
    this.operation = { ...current, takeoverAfter: new Date(fixtureNow.getTime() - 1) };
  }

  private requireOperation(): ImportOperationRecord {
    if (this.operation === null) {
      throw new LiteratureImportRepositoryError("not_found");
    }
    return this.operation;
  }

  private requireCurrentAttempt(attemptCount: number): RunningImportOperation {
    const current = this.requireOperation();
    if (current.status !== "running" || current.attemptCount !== attemptCount) {
      throw new LiteratureImportRepositoryError("stale_attempt");
    }
    return current;
  }
}

export type ImportServiceHarness = {
  readonly repository: InMemoryImportRepository;
  readonly providers: FixtureImportProviders;
  readonly service: LiteratureImportService;
};

export function createImportServiceHarness(): ImportServiceHarness {
  const repository = new InMemoryImportRepository();
  const providers = new FixtureImportProviders();
  return {
    repository,
    providers,
    service: createLiteratureImportService({
      repository,
      providers: providers.adapters,
      now: () => fixtureNow.getTime()
    })
  };
}

function createRunningOperation(input: AdmitImportInput): RunningImportOperation {
  return {
    id: "operation-1",
    scope: scopeFor(input.actor, input.target),
    seed: input.seed,
    createdByUserId: input.actor.userId,
    status: "running",
    attemptCount: 1,
    attemptStartedAt: fixtureNow,
    takeoverAfter: new Date(fixtureNow.getTime() + 30_000),
    finishedAt: null,
    literatureId: null,
    warnings: [],
    failureCode: null,
    createdAt: fixtureNow,
    updatedAt: fixtureNow
  };
}

function scopeFor(actor: LiteratureActor, target: LiteratureTargetScope) {
  switch (target.scope) {
    case "personal":
      return { kind: "personal", ownerUserId: actor.userId } as const;
    case "project":
      return { kind: "project", projectId: target.projectId } as const;
    default: {
      const unreachable: never = target;
      throw unreachable;
    }
  }
}
