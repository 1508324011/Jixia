import type { ImportOperationDTO } from "@jixia/shared";

import type { LiteratureImportService } from "./literature.import-service.js";

const now = "2026-07-20T00:00:00.000Z";

export const importRouteOperation: ImportOperationDTO = {
  id: "operation-1",
  scope: { kind: "personal", ownerUserId: "user-1" },
  createdByUserId: "user-1",
  status: "succeeded",
  attemptCount: 1,
  attemptStartedAt: now,
  takeoverAfter: null,
  finishedAt: "2026-07-20T00:00:01.000Z",
  literatureId: "literature-1",
  warnings: [],
  failureCode: null,
  createdAt: now,
  updatedAt: "2026-07-20T00:00:01.000Z"
};

export class RecordingImportService implements LiteratureImportService {
  readonly createCalls: Parameters<LiteratureImportService["createImport"]>[0][] = [];
  readonly getCalls: Parameters<LiteratureImportService["getImportOperation"]>[0][] = [];
  readonly retryCalls: Parameters<LiteratureImportService["retryImport"]>[0][] = [];
  createKind: "created" | "replayed" = "created";
  error: Error | null = null;

  async createImport(input: Parameters<LiteratureImportService["createImport"]>[0]) {
    this.createCalls.push(input);
    this.throwConfiguredError();
    return {
      kind: this.createKind,
      response: { operation: importRouteOperation }
    };
  }

  async getImportOperation(input: Parameters<LiteratureImportService["getImportOperation"]>[0]) {
    this.getCalls.push(input);
    this.throwConfiguredError();
    return { operation: importRouteOperation };
  }

  async retryImport(input: Parameters<LiteratureImportService["retryImport"]>[0]) {
    this.retryCalls.push(input);
    this.throwConfiguredError();
    return { operation: importRouteOperation };
  }

  private throwConfiguredError(): void {
    if (this.error !== null) {
      throw this.error;
    }
  }
}
