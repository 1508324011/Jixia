import type {
  CreateLiteratureImportRequest,
  CreateLiteratureImportResponse,
  GetLiteratureImportOperationResponse,
  RetryLiteratureImportOperationResponse
} from "@jixia/shared";

import type { CrossrefAdapter } from "./discovery/crossref/crossref.types.js";
import type { NcbiAdapters } from "./discovery/ncbi/ncbi.types.js";
import type { OpenAlexAdapter } from "./discovery/openalex/openalex.types.js";
import type { UnpaywallAdapter } from "./discovery/unpaywall/unpaywall.types.js";
import type { LiteratureImportRepository } from "./literature.import-repository.js";
import type { RunningImportOperation } from "./literature.import-repository.js";
import { collectLiteratureImportAttempt } from "./literature.import-attempt.js";
import { toImportOperationDto } from "./literature.import-dto.js";
import { classifyFinalizationFailure } from "./literature.import-failure.js";
import type { LiteratureActor } from "./literature.repository.js";

export type LiteratureImportProviders = {
  readonly openalex: Pick<OpenAlexAdapter, "fetchSeed" | "lookupDoi">;
  readonly crossref: Pick<CrossrefAdapter, "fetchSeed" | "lookupDoi">;
  readonly pubmed: Pick<NcbiAdapters["pubmed"], "fetchSeed" | "lookupDoi">;
  readonly pmc: NcbiAdapters["pmc"];
  readonly unpaywall: UnpaywallAdapter;
};

export type CreateLiteratureImportServiceResult =
  | { readonly kind: "created"; readonly response: CreateLiteratureImportResponse }
  | { readonly kind: "replayed"; readonly response: CreateLiteratureImportResponse };

export interface LiteratureImportService {
  createImport(input: {
    readonly actor: LiteratureActor;
    readonly request: CreateLiteratureImportRequest;
    readonly idempotencyKey: string;
  }): Promise<CreateLiteratureImportServiceResult>;
  getImportOperation(input: {
    readonly actor: LiteratureActor;
    readonly operationId: string;
  }): Promise<GetLiteratureImportOperationResponse>;
  retryImport(input: {
    readonly actor: LiteratureActor;
    readonly operationId: string;
  }): Promise<RetryLiteratureImportOperationResponse>;
}

export type LiteratureImportServiceDependencies = {
  readonly repository: LiteratureImportRepository;
  readonly providers: LiteratureImportProviders;
  readonly now?: () => number;
};

export function createLiteratureImportService(
  dependencies: LiteratureImportServiceDependencies
): LiteratureImportService {
  return {
    async createImport(input) {
      const result = await dependencies.repository.admitImport({
        actor: input.actor,
        target: input.request.target,
        seed: input.request.seed,
        idempotencyKey: input.idempotencyKey
      });
      if (result.kind === "replayed") {
        return {
          kind: "replayed",
          response: { operation: toImportOperationDto(result.operation) }
        };
      }
      return {
        kind: "created",
        response: {
          operation: toImportOperationDto(await executeAttempt(dependencies, input.actor, result.operation))
        }
      };
    },
    async getImportOperation(input) {
      const operation = await dependencies.repository.getImportOperation(input);
      return { operation: toImportOperationDto(operation) };
    },
    async retryImport(input) {
      const operation = await dependencies.repository.retryImport(input);
      return {
        operation: toImportOperationDto(await executeAttempt(dependencies, input.actor, operation))
      };
    }
  };
}

async function executeAttempt(
  dependencies: LiteratureImportServiceDependencies,
  actor: LiteratureActor,
  operation: RunningImportOperation
) {
  const operationDeadlineMs = (dependencies.now ?? Date.now)() + 20_000;
  const attempt = await collectLiteratureImportAttempt({
    providers: dependencies.providers,
    seed: operation.seed,
    operationDeadlineMs
  });
  if (attempt.kind === "failed") {
    return completeFailedAttempt({
      dependencies,
      actor,
      operation,
      warningCodes: attempt.warningCodes,
      failureCode: attempt.failureCode
    });
  }
  try {
    return await dependencies.repository.finalizeImport({
      actor,
      operationId: operation.id,
      attemptCount: operation.attemptCount,
      warningCodes: attempt.warningCodes,
      batches: attempt.batches
    });
  } catch (error) {
    const failureCode = classifyFinalizationFailure(error);
    if (failureCode === null) {
      throw error;
    }
    return completeFailedAttempt({
      dependencies,
      actor,
      operation,
      warningCodes: attempt.warningCodes,
      failureCode
    });
  }
}

async function completeFailedAttempt(input: {
  readonly dependencies: LiteratureImportServiceDependencies;
  readonly actor: LiteratureActor;
  readonly operation: RunningImportOperation;
  readonly warningCodes: Parameters<LiteratureImportRepository["failImport"]>[0]["warningCodes"];
  readonly failureCode: Parameters<LiteratureImportRepository["failImport"]>[0]["failureCode"];
}) {
  const failureInput = {
    actor: input.actor,
    operationId: input.operation.id,
    attemptCount: input.operation.attemptCount,
    warningCodes: input.warningCodes,
    failureCode: input.failureCode
  };
  try {
    return await input.dependencies.repository.failImport(failureInput);
  } catch (error) {
    if (
      input.failureCode === "authorization_revoked" ||
      classifyFinalizationFailure(error) !== "authorization_revoked"
    ) {
      throw error;
    }
    return input.dependencies.repository.failImport({
      ...failureInput,
      failureCode: "authorization_revoked"
    });
  }
}
