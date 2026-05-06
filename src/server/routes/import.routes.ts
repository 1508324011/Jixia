import type { TodayRecommendation } from "@shared/contracts/discovery";
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
    actorUserId: string,
  ): Promise<ImportedLibraryRecord>;
  importToPersonalLibrary(input: {
    requestedByUserId: string;
    sourceLocator: string;
    sourceType: "doi" | "pmid" | "arxiv";
  }): Promise<ImportedLibraryRecord>;
  searchDiscovery(query: string): Promise<TodayRecommendation[]>;
  uploadPdf(
    input: UploadPdfToLibraryRequest,
    actorUserId: string,
  ): Promise<ImportedLibraryRecord>;
}

export function createImportRoutes(service: ImportService): ImportRoutes {
  return {
    importPaper(
      input: ImportLibraryEntryRequest,
      actorUserId: string,
    ): Promise<ImportedLibraryRecord> {
      return service.importPaper(input, actorUserId);
    },
    importToPersonalLibrary(input: {
      requestedByUserId: string;
      sourceLocator: string;
      sourceType: "doi" | "pmid" | "arxiv";
    }): Promise<ImportedLibraryRecord> {
      return service.importToPersonalLibrary(input);
    },
    searchDiscovery(query: string): Promise<TodayRecommendation[]> {
      return service.searchDiscovery(query);
    },
    uploadPdf(
      input: UploadPdfToLibraryRequest,
      actorUserId: string,
    ): Promise<ImportedLibraryRecord> {
      return service.uploadPdf(input, actorUserId);
    },
  };
}
