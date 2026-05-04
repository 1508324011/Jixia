import type {
  ImportLibraryEntryRequest,
  UploadPdfToLibraryRequest,
} from "@shared/contracts/library";

import type {
  ImportedLibraryRecord,
  ImportService,
} from "../services/import.service";

export interface ImportRoutes {
  importPaper(input: ImportLibraryEntryRequest): Promise<ImportedLibraryRecord>;
  uploadPdf(input: UploadPdfToLibraryRequest): Promise<ImportedLibraryRecord>;
}

export function createImportRoutes(service: ImportService): ImportRoutes {
  return {
    importPaper(
      input: ImportLibraryEntryRequest,
    ): Promise<ImportedLibraryRecord> {
      return service.importPaper(input);
    },
    uploadPdf(
      input: UploadPdfToLibraryRequest,
    ): Promise<ImportedLibraryRecord> {
      return service.uploadPdf(input);
    },
  };
}
