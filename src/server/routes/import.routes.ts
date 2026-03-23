import type { TodayRecommendation } from '@shared/contracts/discovery';

import type {
  ImportedLibraryRecord,
  ImportPaperRequest,
  ImportToPersonalLibraryRequest,
  ImportService,
  UploadPdfRequest,
} from '../services/import.service';

export interface ImportRoutes {
  importToPersonalLibrary(
    input: ImportToPersonalLibraryRequest,
  ): Promise<ImportedLibraryRecord>;
  importPaper(input: ImportPaperRequest): Promise<ImportedLibraryRecord>;
  searchDiscovery(query: string): Promise<TodayRecommendation[]>;
  uploadPdf(input: UploadPdfRequest): Promise<ImportedLibraryRecord>;
}

export function createImportRoutes(service: ImportService): ImportRoutes {
  return {
    importToPersonalLibrary(
      input: ImportToPersonalLibraryRequest,
    ): Promise<ImportedLibraryRecord> {
      return service.importToPersonalLibrary(input);
    },
    importPaper(input: ImportPaperRequest): Promise<ImportedLibraryRecord> {
      return service.importPaper(input);
    },
    searchDiscovery(query: string): Promise<TodayRecommendation[]> {
      return service.searchDiscovery(query);
    },
    uploadPdf(input: UploadPdfRequest): Promise<ImportedLibraryRecord> {
      return service.uploadPdf(input);
    },
  };
}
