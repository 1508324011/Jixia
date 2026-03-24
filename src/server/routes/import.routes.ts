import type { TodayRecommendation } from '@shared/contracts/discovery';

import type {
  ImportDiscoveryCandidateRequest,
  ImportedLibraryRecord,
  ImportedDiscoveryCandidateRecord,
  ImportPaperRequest,
  ImportToPersonalLibraryRequest,
  ImportService,
  UploadPdfRequest,
} from '../services/import.service';

export interface ImportRoutes {
  importDiscoveryCandidate(
    input: ImportDiscoveryCandidateRequest,
  ): Promise<ImportedDiscoveryCandidateRecord>;
  importToPersonalLibrary(
    input: ImportToPersonalLibraryRequest,
  ): Promise<ImportedLibraryRecord>;
  importPaper(input: ImportPaperRequest): Promise<ImportedLibraryRecord>;
  listTodayDiscovery(): Promise<TodayRecommendation[]>;
  searchDiscovery(query: string): Promise<TodayRecommendation[]>;
  uploadPdf(input: UploadPdfRequest): Promise<ImportedLibraryRecord>;
}

export function createImportRoutes(service: ImportService): ImportRoutes {
  return {
    importDiscoveryCandidate(
      input: ImportDiscoveryCandidateRequest,
    ): Promise<ImportedDiscoveryCandidateRecord> {
      return service.importDiscoveryCandidate(input);
    },
    importToPersonalLibrary(
      input: ImportToPersonalLibraryRequest,
    ): Promise<ImportedLibraryRecord> {
      return service.importToPersonalLibrary(input);
    },
    importPaper(input: ImportPaperRequest): Promise<ImportedLibraryRecord> {
      return service.importPaper(input);
    },
    listTodayDiscovery(): Promise<TodayRecommendation[]> {
      return service.listTodayDiscovery();
    },
    searchDiscovery(query: string): Promise<TodayRecommendation[]> {
      return service.searchDiscovery(query);
    },
    uploadPdf(input: UploadPdfRequest): Promise<ImportedLibraryRecord> {
      return service.uploadPdf(input);
    },
  };
}
