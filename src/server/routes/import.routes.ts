import type {
  ImportLibraryEntryRequest,
  UploadPdfToLibraryRequest,
} from "@shared/contracts/library";

import type {
  ImportedLibraryRecord,
  ImportService,
} from "../services/import.service";

export interface ImportRoutes {
  importPaper(
    input: ImportLibraryEntryRequest,
    actorUserId?: string,
  ): Promise<ImportedLibraryRecord>;
  uploadPdf(
    input: UploadPdfToLibraryRequest,
    actorUserId?: string,
  ): Promise<ImportedLibraryRecord>;
}

export function createImportRoutes(service: ImportService): ImportRoutes {
  return {
    importPaper(
      input: ImportLibraryEntryRequest,
      actorUserId?: string,
    ): Promise<ImportedLibraryRecord> {
      return service.importPaper(input, actorUserId);
    },
    uploadPdf(
      input: UploadPdfToLibraryRequest,
      actorUserId?: string,
    ): Promise<ImportedLibraryRecord> {
      return service.uploadPdf(input, actorUserId);
    },
  };
}
