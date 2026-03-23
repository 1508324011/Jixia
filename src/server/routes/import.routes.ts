import type {
  ImportedLibraryRecord,
  ImportPaperRequest,
  ImportService,
  UploadPdfRequest,
} from '../services/import.service';

export interface ImportRoutes {
  importPaper(input: ImportPaperRequest): Promise<ImportedLibraryRecord>;
  uploadPdf(input: UploadPdfRequest): Promise<ImportedLibraryRecord>;
}

export function createImportRoutes(service: ImportService): ImportRoutes {
  return {
    importPaper(input: ImportPaperRequest): Promise<ImportedLibraryRecord> {
      return service.importPaper(input);
    },
    uploadPdf(input: UploadPdfRequest): Promise<ImportedLibraryRecord> {
      return service.uploadPdf(input);
    },
  };
}
