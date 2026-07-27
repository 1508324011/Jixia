import type { PrismaClient } from "@jixia/db";

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
import { admitPrismaImport, readPrismaImport } from "./literature.prisma-import-admission.js";
import { finalizePrismaImport } from "./literature.prisma-import-finalization.js";
import { failPrismaImport, retryPrismaImport } from "./literature.prisma-import-lifecycle.js";

class PrismaLiteratureImportRepository implements LiteratureImportRepository {
  constructor(private readonly prisma: PrismaClient) {}

  async admitImport(input: AdmitImportInput): Promise<AdmitImportResult> {
    return admitPrismaImport(this.prisma, input);
  }

  async getImportOperation(input: {
    readonly actor: AdmitImportInput["actor"];
    readonly operationId: string;
  }): Promise<ImportOperationRecord> {
    return readPrismaImport(this.prisma, input);
  }

  async retryImport(input: {
    readonly actor: AdmitImportInput["actor"];
    readonly operationId: string;
  }): Promise<RunningImportOperation> {
    return retryPrismaImport(this.prisma, input);
  }

  async finalizeImport(input: FinalizeImportInput): Promise<SucceededImportOperation> {
    return finalizePrismaImport(this.prisma, input);
  }

  async failImport(input: FailImportInput): Promise<FailedImportOperation> {
    return failPrismaImport(this.prisma, input);
  }
}

export function createPrismaLiteratureImportRepository(
  prisma: PrismaClient
): LiteratureImportRepository {
  return new PrismaLiteratureImportRepository(prisma);
}
